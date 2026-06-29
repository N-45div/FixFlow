import { twilioChannel } from "eve/channels/twilio";

function readAllowFrom(): string | readonly string[] {
  const raw = process.env.TWILIO_ALLOW_FROM?.trim();
  if (!raw || raw === "*") {
    return "*";
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length === 1 ? values[0]! : values;
}

function buildAuth(from: string, to?: string | undefined) {
  return {
    principalId: from,
    principalType: "user" as const,
    authenticator: "twilio",
    attributes: {
      from,
      to: to ?? "",
      transport: from.startsWith("whatsapp:") ? "whatsapp" : "phone",
    },
  };
}

export default twilioChannel({
  allowFrom: readAllowFrom(),
  webhookUrl: process.env.TWILIO_WEBHOOK_URL,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  messaging: {
    from: process.env.TWILIO_PHONE_NUMBER,
  },
  voice: {
    prompt:
      "You have reached FixFlow Voice. Please describe the maintenance issue after the tone.",
    acknowledgement:
      "Thanks. We captured your report and will send a text follow-up with the next step.",
    language: "en-US",
    speechTimeout: "auto",
  },
  onText(_ctx, message) {
    return { auth: buildAuth(message.from, message.to) };
  },
  onVoiceTranscription(_ctx, transcription) {
    return { auth: buildAuth(transcription.from, transcription.to) };
  },
});
