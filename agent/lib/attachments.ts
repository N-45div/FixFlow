import { randomUUID } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { generateObject, type FilePart } from "ai";
import { z } from "zod";
import { rememberMemory } from "./memory-store.js";
import {
  getCerebrasLanguageModel,
  getCerebrasProviderOptions,
  hasCerebrasApiKey,
} from "./provider.js";
import {
  AttachmentEvidenceSchema,
  type AttachmentEvidence,
  type AttachmentFact,
} from "./types.js";

const IMAGE_MEDIA_PREFIX = "image/";
const PDF_MEDIA_TYPE = "application/pdf";
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 4000;
const MAX_MEMORY_TEXT_CHARS = 1200;

const VisionExtractionSchema = z.object({
  summary: z.string(),
  visibleText: z.array(z.string()).default([]),
  detectedSignals: z.array(z.string()).default([]),
  facts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export interface InboundAttachment {
  bytes: Buffer;
  filename: string;
  mediaType: string;
  source: string;
}

export interface AttachmentExtractionResult {
  evidence: AttachmentEvidence[];
  persistedKnowledgeCount: number;
}

function trimWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clampText(text: string, limit: number): string {
  return trimWhitespace(text).slice(0, limit);
}

function makeFact(label: string, value: string): AttachmentFact | null {
  const normalizedLabel = label.trim();
  const normalizedValue = value.trim().replace(/[.,;:)\]]+$/g, "");
  if (!normalizedLabel || !normalizedValue) {
    return null;
  }

  return { label: normalizedLabel, value: normalizedValue };
}

function inferTags(filename: string, text: string, mediaType: string): string[] {
  const tags = new Set<string>();
  const joined = `${filename} ${text}`.toLowerCase();

  if (mediaType === PDF_MEDIA_TYPE) tags.add("pdf");
  if (mediaType.startsWith(IMAGE_MEDIA_PREFIX)) tags.add("image");
  if (/\bmanual|installation|service manual|owner'?s manual\b/.test(joined)) tags.add("manual");
  if (/\btroubleshooting|fault code|diagnostic|error code\b/.test(joined)) tags.add("troubleshooting");
  if (/\bwarning|danger|caution|hazard\b/.test(joined)) tags.add("warning");
  if (/\bmodel\b/.test(joined)) tags.add("model");
  if (/\bserial\b/.test(joined)) tags.add("serial");
  if (/\bhvac|air handler|condenser|thermostat|compressor|furnace|chiller\b/.test(joined)) {
    tags.add("hvac");
  }

  return [...tags];
}

function detectSignals(text: string): string[] {
  const signals = new Set<string>();
  const joined = text.toLowerCase();

  if (/\bhigh voltage|480v|240v|208v|electrical\b/.test(joined)) signals.add("electrical");
  if (/\bwarning|danger|caution\b/.test(joined)) signals.add("warning-label");
  if (/\bwater|leak|overflow|drain\b/.test(joined)) signals.add("water");
  if (/\bburn|smoke|sparks?\b/.test(joined)) signals.add("burn-risk");
  if (/\bfault|alarm|error code|trip\b/.test(joined)) signals.add("fault-code");

  return [...signals];
}

function extractFactsFromText(text: string): AttachmentFact[] {
  const facts: AttachmentFact[] = [];
  const patterns = [
    { label: "model", regex: /\bmodel(?:\s*(?:no\.?|number))?[:#\s-]*([A-Z0-9][A-Z0-9._/-]{2,})/i },
    { label: "serial", regex: /\bserial(?:\s*(?:no\.?|number))?[:#\s-]*([A-Z0-9][A-Z0-9._/-]{2,})/i },
    { label: "fault code", regex: /\b(?:fault|error|alarm)\s*code[:#\s-]*([A-Z0-9-]{2,})/i },
    { label: "voltage", regex: /\b(\d{2,4}\s?(?:v|volt|volts))\b/i },
    { label: "refrigerant", regex: /\b(R[- ]?\d{2,3}[A-Z]?)\b/i },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    const fact = match?.[1] ? makeFact(pattern.label, match[1]) : null;
    if (fact) {
      facts.push(fact);
    }
  }

  return facts;
}

function buildPdfSummary(text: string, filename: string): string {
  const cleaned = clampText(text, 900);
  if (!cleaned) {
    return `PDF attachment ${filename} was received, but no readable text could be extracted.`;
  }

  return `PDF attachment ${filename} contains: ${cleaned}`;
}

async function extractPdfEvidence(attachment: InboundAttachment): Promise<AttachmentEvidence> {
  const parser = new PDFParse({ data: attachment.bytes });
  const parsed = await parser.getText();
  const extractedText = clampText(parsed.text ?? "", MAX_EXTRACTED_TEXT_CHARS);
  const tags = inferTags(attachment.filename, extractedText, attachment.mediaType);
  const detectedSignals = detectSignals(extractedText);
  const facts = extractFactsFromText(extractedText);

  await parser.destroy().catch(() => undefined);

  return AttachmentEvidenceSchema.parse({
    id: randomUUID(),
    kind: "pdf",
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    summary: buildPdfSummary(extractedText, attachment.filename),
    extractedText,
    detectedSignals,
    facts,
    tags,
    confidence: extractedText.length > 80 ? 0.88 : 0.6,
    source: attachment.source,
  });
}

async function extractTextEvidence(attachment: InboundAttachment): Promise<AttachmentEvidence> {
  const extractedText = clampText(attachment.bytes.toString("utf8"), MAX_EXTRACTED_TEXT_CHARS);
  const tags = inferTags(attachment.filename, extractedText, attachment.mediaType);
  const detectedSignals = detectSignals(extractedText);
  const facts = extractFactsFromText(extractedText);

  return AttachmentEvidenceSchema.parse({
    id: randomUUID(),
    kind: "text",
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    summary: `Text attachment ${attachment.filename} contains: ${clampText(extractedText, 900)}`,
    extractedText,
    detectedSignals,
    facts,
    tags,
    confidence: extractedText.length > 20 ? 0.86 : 0.55,
    source: attachment.source,
  });
}

async function extractImageEvidence(attachment: InboundAttachment): Promise<AttachmentEvidence> {
  if (!hasCerebrasApiKey()) {
    return AttachmentEvidenceSchema.parse({
      id: randomUUID(),
      kind: "image",
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      summary:
        `Image attachment ${attachment.filename} was received. Visual extraction is waiting for Cerebras credentials, so only the raw image is available right now.`,
      extractedText: "",
      detectedSignals: [],
      facts: [],
      tags: inferTags(attachment.filename, "", attachment.mediaType),
      confidence: 0.2,
      source: attachment.source,
    });
  }

  const { object } = await generateObject({
    model: getCerebrasLanguageModel(),
    providerOptions: getCerebrasProviderOptions(),
    schema: VisionExtractionSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Analyze this maintenance-related image for a facility/HVAC operations agent. Return a concise operational summary, any visible warning or fault signals, visible text, and structured facts such as model numbers, serial numbers, labels, or error codes. Do not invent unreadable text.",
          },
          {
            type: "file",
            data: attachment.bytes,
            mediaType: attachment.mediaType,
            filename: attachment.filename,
          } satisfies FilePart,
        ],
      },
    ],
  });

  const visibleText = clampText(object.visibleText.join(" | "), MAX_EXTRACTED_TEXT_CHARS);
  const tags = [...new Set([...inferTags(attachment.filename, visibleText, attachment.mediaType), ...object.tags])];

  return AttachmentEvidenceSchema.parse({
    id: randomUUID(),
    kind: "image",
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    summary: object.summary,
    extractedText: visibleText,
    detectedSignals: object.detectedSignals,
    facts: object.facts,
    tags,
    confidence: object.confidence,
    source: attachment.source,
  });
}

async function extractOtherEvidence(attachment: InboundAttachment): Promise<AttachmentEvidence> {
  return AttachmentEvidenceSchema.parse({
    id: randomUUID(),
    kind: "other",
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    summary: `Attachment ${attachment.filename} (${attachment.mediaType}) was received and staged for the agent.`,
    extractedText: "",
    detectedSignals: [],
    facts: [],
    tags: inferTags(attachment.filename, "", attachment.mediaType),
    confidence: 0.4,
    source: attachment.source,
  });
}

export async function extractAttachmentEvidence(
  attachments: readonly InboundAttachment[],
): Promise<AttachmentExtractionResult> {
  const evidence: AttachmentEvidence[] = [];

  for (const attachment of attachments) {
    if (attachment.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      evidence.push(
        AttachmentEvidenceSchema.parse({
          id: randomUUID(),
          kind: attachment.mediaType === PDF_MEDIA_TYPE ? "pdf" : "other",
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          summary: `Attachment ${attachment.filename} was skipped because it exceeded the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB processing limit.`,
          extractedText: "",
          detectedSignals: [],
          facts: [],
          tags: ["oversize"],
          confidence: 1,
          source: attachment.source,
        }),
      );
      continue;
    }

    if (attachment.mediaType === PDF_MEDIA_TYPE) {
      evidence.push(await extractPdfEvidence(attachment));
      continue;
    }

    if (attachment.mediaType.startsWith("text/")) {
      evidence.push(await extractTextEvidence(attachment));
      continue;
    }

    if (attachment.mediaType.startsWith(IMAGE_MEDIA_PREFIX)) {
      evidence.push(await extractImageEvidence(attachment));
      continue;
    }

    evidence.push(await extractOtherEvidence(attachment));
  }

  let persistedKnowledgeCount = 0;
  for (const item of evidence) {
    const shouldPersist =
      item.extractedText.length >= 200 &&
      (item.tags.includes("manual") || item.tags.includes("troubleshooting"));

    if (!shouldPersist) {
      continue;
    }

    await rememberMemory({
      scope: "knowledge",
      title: `Attachment knowledge: ${item.filename}`,
      text: clampText(item.extractedText || item.summary, MAX_MEMORY_TEXT_CHARS),
      source: item.source,
      confidence: 0.72,
      tags: [...item.tags, "attachment-ingest"],
      evidence: [{ source: item.source, excerpt: clampText(item.summary, 240) }],
    });
    persistedKnowledgeCount += 1;
  }

  return {
    evidence,
    persistedKnowledgeCount,
  };
}

export function formatAttachmentEvidenceContext(
  evidence: readonly AttachmentEvidence[],
): string | null {
  if (evidence.length === 0) {
    return null;
  }

  const lines = [
    "<attachment_evidence>",
    "Use this block as grounded evidence from inbound attachments.",
  ];

  for (const item of evidence) {
    lines.push(`attachment: ${item.filename} (${item.mediaType})`);
    lines.push(`summary: ${item.summary}`);

    if (item.detectedSignals.length > 0) {
      lines.push(`signals: ${item.detectedSignals.join(", ")}`);
    }

    if (item.facts.length > 0) {
      lines.push(
        `facts: ${item.facts.map((fact) => `${fact.label}=${fact.value}`).join("; ")}`,
      );
    }

    if (item.extractedText) {
      lines.push(`text_excerpt: ${clampText(item.extractedText, 900)}`);
    }
  }

  lines.push(
    "If the attachment evidence materially changes the case, persist it into session state before continuing triage.",
  );
  lines.push("</attachment_evidence>");

  return lines.join("\n");
}
