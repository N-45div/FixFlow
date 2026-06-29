import { z } from "zod";

export const MemoryScopeSchema = z.enum(["incident", "playbook", "knowledge"]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const CaseStageSchema = z.enum([
  "intake",
  "clarification",
  "diagnosis",
  "dispatch",
  "resolution",
  "closed",
]);
export type CaseStage = z.infer<typeof CaseStageSchema>;

export const EvidenceSchema = z.object({
  source: z.string().min(1),
  excerpt: z.string().min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AttachmentFactSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});
export type AttachmentFact = z.infer<typeof AttachmentFactSchema>;

export const AttachmentEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "pdf", "text", "other"]),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  summary: z.string().min(1),
  extractedText: z.string().default(""),
  detectedSignals: z.array(z.string()).default([]),
  facts: z.array(AttachmentFactSchema).default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
});
export type AttachmentEvidence = z.infer<typeof AttachmentEvidenceSchema>;

export const ActiveCaseStateSchema = z.object({
  stage: CaseStageSchema.default("intake"),
  issueType: z.string().default("unknown"),
  summary: z.string().default(""),
  language: z.string().default("en"),
  location: z.string().default(""),
  priority: PrioritySchema.default("medium"),
  confidence: z.number().min(0).max(1).default(0.35),
  probableCause: z.string().default(""),
  nextStep: z.string().default(""),
  blockers: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  attachments: z.array(AttachmentEvidenceSchema).default([]),
});
export type ActiveCaseState = z.infer<typeof ActiveCaseStateSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string(),
  scope: MemoryScopeSchema,
  title: z.string(),
  text: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  tags: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const PlaybookCandidateSchema = z.object({
  title: z.string(),
  appliesWhen: z.array(z.string()).default([]),
  prerequisites: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  stopConditions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type PlaybookCandidate = z.infer<typeof PlaybookCandidateSchema>;
