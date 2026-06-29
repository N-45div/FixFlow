import type { FilePart, UserContent } from "ai";
import { defineChannel, POST } from "eve/channels";
import {
  emptyTwilioResponse,
  sendTwilioMessage,
  verifyTwilioRequest,
} from "eve/channels/twilio";
import {
  extractAttachmentEvidence,
  formatAttachmentEvidenceContext,
  type InboundAttachment,
} from "../lib/attachments.js";

type WhatsAppReceiveTarget = {
  readonly from?: string;
  readonly phoneNumber: string;
};

type ContinuationPayload = {
  readonly from: string;
  readonly to?: string;
};

const CONTINUATION_TOKEN_VERSION = "v2";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readAllowFrom(): string | readonly string[] {
  const raw = env("TWILIO_ALLOW_FROM");
  if (!raw || raw === "*") {
    return "*";
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length === 1 ? values[0]! : values;
}

function readMessagingFrom(): string | undefined {
  return env("TWILIO_MESSAGING_FROM");
}

function buildAuth(from: string, to?: string | undefined) {
  return {
    principalId: from,
    principalType: "user" as const,
    authenticator: "twilio-whatsapp",
    attributes: {
      from,
      to: to ?? "",
      transport: "whatsapp",
    },
  };
}

function parseTwilioTextMessage(params: URLSearchParams) {
  const from = params.get("From")?.trim();
  const body = params.get("Body")?.trim() ?? "";

  if (!from) {
    return null;
  }

  return {
    accountSid: params.get("AccountSid") ?? undefined,
    body,
    from,
    messageSid:
      params.get("MessageSid") ??
      params.get("SmsMessageSid") ??
      undefined,
    to: params.get("To") ?? undefined,
  };
}

function formatTwilioContextBlock(input: {
  readonly from: string;
  readonly messageSid?: string;
  readonly to?: string;
}) {
  const lines = [
    "<twilio_context>",
    "channel: text",
    "response_medium: whatsapp",
    "response_instructions: Reply for WhatsApp in plain text. Keep responses concise, field-friendly, and easy to skim on a phone. Avoid Markdown tables, code fences, and long paragraphs.",
    `from: ${input.from}`,
  ];

  if (input.to) {
    lines.push(`to: ${input.to}`);
  }

  if (input.messageSid) {
    lines.push(`message_sid: ${input.messageSid}`);
  }

  lines.push("</twilio_context>");
  return lines.join("\n");
}

function encodeContinuationToken(payload: ContinuationPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${CONTINUATION_TOKEN_VERSION}.${encoded}`;
}

function decodeContinuationToken(token: string): ContinuationPayload {
  const tokenBody = token.includes(":") ? token.slice(token.indexOf(":") + 1) : token;
  const encodedBody = tokenBody.startsWith(`${CONTINUATION_TOKEN_VERSION}.`)
    ? tokenBody.slice(CONTINUATION_TOKEN_VERSION.length + 1)
    : tokenBody;

  try {
    const decoded = Buffer.from(encodedBody, "base64url").toString("utf8");
    return JSON.parse(decoded) as ContinuationPayload;
  } catch {
    try {
      return JSON.parse(encodedBody) as ContinuationPayload;
    } catch (error) {
      throw new Error(
        `Unable to decode WhatsApp continuation token.`,
        { cause: error },
      );
    }
  }
}

function readWebhookUrl(request: Request): string | ((request: Request) => string) {
  return env("TWILIO_WHATSAPP_WEBHOOK_URL") ?? env("TWILIO_WEBHOOK_URL") ?? request.url;
}

async function isAllowed(from: string): Promise<boolean> {
  const allowFrom = readAllowFrom();
  if (allowFrom === "*") {
    return true;
  }

  return typeof allowFrom === "string"
    ? allowFrom === from
    : allowFrom.includes(from);
}

function mediaExtension(mediaType: string): string {
  const subtype = mediaType.split("/")[1]?.split(";")[0]?.trim();
  if (!subtype) {
    return "";
  }

  if (subtype === "jpeg") {
    return ".jpg";
  }

  return `.${subtype.replace(/[^a-z0-9.+-]/gi, "")}`;
}

function collectMediaParts(params: URLSearchParams): FilePart[] {
  const numMedia = Number(params.get("NumMedia") ?? "0");
  if (!Number.isFinite(numMedia) || numMedia <= 0) {
    return [];
  }

  const parts: FilePart[] = [];

  for (let index = 0; index < numMedia; index += 1) {
    const url = params.get(`MediaUrl${index}`);
    const mediaType = params.get(`MediaContentType${index}`) ?? "application/octet-stream";

    if (!url) {
      continue;
    }

    parts.push({
      type: "file",
      data: new URL(url),
      filename: `whatsapp-media-${index + 1}${mediaExtension(mediaType)}`,
      mediaType,
    });
  }

  return parts;
}

function collectInboundAttachments(
  mediaParts: readonly FilePart[],
): InboundAttachment[] {
  const attachments: InboundAttachment[] = [];

  for (const [index, part] of mediaParts.entries()) {
    if (!(part.data instanceof URL)) {
      continue;
    }

    attachments.push({
      bytes: Buffer.alloc(0),
      filename: part.filename ?? `attachment-${index + 1}`,
      mediaType: part.mediaType,
      source: part.data.href,
    });
  }

  return attachments;
}

function buildInboundMessage(body: string, mediaParts: readonly FilePart[]): string | UserContent {
  const trimmedBody = body.trim();
  if (mediaParts.length === 0) {
    return trimmedBody || "Shared a WhatsApp attachment without a text caption.";
  }

  const content: Exclude<UserContent, string> = [];

  if (trimmedBody) {
    content.push({ type: "text", text: trimmedBody });
  } else {
    content.push({
      type: "text",
      text: "Shared a WhatsApp attachment without a text caption.",
    });
  }

  content.push(...mediaParts);
  return content;
}

function splitReply(text: string, limit = 1400): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const breakpoint = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const cut = breakpoint > Math.floor(limit * 0.6) ? breakpoint : limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function isTwilioMediaUrl(url: string): boolean {
  return (
    url.startsWith("https://api.twilio.com/") ||
    url.startsWith("https://mms.twiliocdn.com/") ||
    url.startsWith("https://media.twiliocdn.com/")
  );
}

function buildTwilioBasicAuthHeader(): string | null {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    return null;
  }

  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function fetchTwilioAttachmentBytes(url: string): Promise<Buffer> {
  const authorization = buildTwilioBasicAuthHeader();
  const response = await fetch(url, {
    headers: authorization ? { authorization } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Twilio media: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export default defineChannel<undefined, void, WhatsAppReceiveTarget>({
  routes: [
    POST("/incoming", async (request, { send, waitUntil }) => {
      let verified;
      try {
        verified = await verifyTwilioRequest(request, {
          authToken: env("TWILIO_AUTH_TOKEN"),
          webhookUrl: readWebhookUrl(request),
        });
      } catch {
        return new Response("unauthorized", { status: 401 });
      }

      const message = parseTwilioTextMessage(verified.params);
      if (!message) {
        return emptyTwilioResponse();
      }

      if (!(await isAllowed(message.from))) {
        return new Response("forbidden", { status: 403 });
      }

      const mediaParts = collectMediaParts(verified.params);
      const inboundAttachments = collectInboundAttachments(mediaParts);
      let attachmentContextBlock: string | null = null;

      if (inboundAttachments.length > 0) {
        const hydratedAttachments: InboundAttachment[] = [];
        for (const attachment of inboundAttachments) {
          hydratedAttachments.push({
            ...attachment,
            bytes: await fetchTwilioAttachmentBytes(attachment.source),
          });
        }

        const extraction = await extractAttachmentEvidence(hydratedAttachments);
        attachmentContextBlock = formatAttachmentEvidenceContext(extraction.evidence);
      }

      const inboundMessage = buildInboundMessage(message.body, mediaParts);
      const continuationToken = encodeContinuationToken({
        from: message.from,
        to: message.to,
      });
      const contextBlock = formatTwilioContextBlock({
        from: message.from,
        messageSid: message.messageSid,
        to: message.to,
      });

      waitUntil(
        send(
          {
            message: inboundMessage,
            context: [contextBlock, attachmentContextBlock].filter(
              (value): value is string => Boolean(value),
            ),
          },
          {
            auth: buildAuth(message.from, message.to),
            continuationToken,
            title: `WhatsApp ${message.from}`,
          },
        ),
      );

      return emptyTwilioResponse();
    }),
  ],
  async receive(input, { send }) {
    const from = input.target.from ?? readMessagingFrom();
    if (!from) {
      throw new Error(
        "WhatsApp receive requires target.from or TWILIO_MESSAGING_FROM to be set.",
      );
    }

    return send(input.message, {
      auth: input.auth,
      continuationToken: encodeContinuationToken({
        from: input.target.phoneNumber,
        to: from,
      }),
      title: `WhatsApp ${input.target.phoneNumber}`,
    });
  },
  events: {
    async "message.completed"(event, channel) {
      if (!event.message?.trim()) {
        return;
      }

      const payload = decodeContinuationToken(channel.continuationToken);
      const from = payload.to ?? readMessagingFrom();
      if (!from) {
        throw new Error(
          "TWILIO_MESSAGING_FROM is required to send WhatsApp replies.",
        );
      }

      for (const chunk of splitReply(event.message)) {
        await sendTwilioMessage({
          body: chunk,
          from,
          statusCallbackUrl: env("TWILIO_STATUS_CALLBACK_URL"),
          to: payload.from,
        });
      }
    },
    async "session.failed"(_event, channel) {
      const payload = decodeContinuationToken(channel.continuationToken);
      const from = payload.to ?? readMessagingFrom();
      if (!from) {
        return;
      }

      await sendTwilioMessage({
        body:
          "I hit an issue while processing that report. Please resend the message or share a short text summary and I will continue from there.",
        from,
        statusCallbackUrl: env("TWILIO_STATUS_CALLBACK_URL"),
        to: payload.from,
      });
    },
  },
  async fetchFile(url) {
    if (!isTwilioMediaUrl(url)) {
      return null;
    }

    const authorization = buildTwilioBasicAuthHeader();
    const response = await fetch(url, {
      headers: authorization ? { authorization } : undefined,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Twilio media: ${response.status}`);
    }

    return { bytes: Buffer.from(await response.arrayBuffer()) };
  },
  metadata() {
    return {
      transport: "whatsapp",
    };
  },
  kindHint: "twilio",
});
