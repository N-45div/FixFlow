import { generateObject } from "ai";
import { z } from "zod";
import { getCerebrasLanguageModel, getCerebrasProviderOptions, hasCerebrasApiKey } from "./provider.js";
import type { ActiveCaseState, AttachmentEvidence, CaseStage } from "./types.js";
import type { GroundedLookupBundle } from "./grounded-retrieval.js";

const CoordinatorDecisionSchema = z.object({
  stage: z.enum(["intake", "clarification", "diagnosis", "dispatch", "resolution", "closed"]),
  issueType: z.string(),
  confidence: z.number().min(0).max(1),
  probableCause: z.string(),
  nextStep: z.string(),
  openQuestions: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  immediateActions: z.array(z.string()).default([]),
  technicianChecklist: z.array(z.string()).default([]),
  recommendedQuestion: z.string().nullable().default(null),
  escalationReason: z.string(),
  rationale: z.string(),
});

export type CoordinatorDecision = z.infer<typeof CoordinatorDecisionSchema>;

function fallbackDecision(input: {
  current: ActiveCaseState;
  issueType: string;
  probableCause: string;
  nextStep: string;
  openQuestions: string[];
  blockers: string[];
  immediateActions: string[];
  technicianChecklist: string[];
  severity: "low" | "medium" | "high" | "critical";
  safetySignals: string[];
}): CoordinatorDecision {
  let stage: CaseStage = "diagnosis";
  if (input.safetySignals.length > 0 || input.severity === "critical" || input.severity === "high") {
    stage = "dispatch";
  } else if (input.openQuestions.length > 0) {
    stage = "clarification";
  }

  return {
    stage,
    issueType: input.issueType,
    confidence: input.current.confidence,
    probableCause: input.probableCause,
    nextStep: input.nextStep,
    openQuestions: input.openQuestions,
    blockers: input.blockers,
    immediateActions: input.immediateActions,
    technicianChecklist: input.technicianChecklist,
    recommendedQuestion: input.openQuestions[0] ?? null,
    escalationReason:
      input.safetySignals.length > 0
        ? `Safety signals detected: ${input.safetySignals.join(", ")}`
        : "No explicit life-safety trigger detected from current evidence.",
    rationale: "Fallback coordinator used deterministic safety and evidence heuristics.",
  };
}

function formatEvidenceLines(bundle: GroundedLookupBundle): string {
  return bundle.recommended
    .slice(0, 8)
    .map(
      (hit) =>
        `${hit.citationId} | ${hit.sourceType} | ${hit.title} | trust=${hit.trustScore.toFixed(2)} | freshness=${hit.freshnessScore.toFixed(2)} | ${hit.excerpt}`,
    )
    .join("\n");
}

function formatAttachmentLines(attachments: readonly AttachmentEvidence[]): string {
  return attachments
    .map(
      (attachment) =>
        `${attachment.filename} | ${attachment.kind} | ${attachment.summary} | facts=${attachment.facts
          .map((fact) => `${fact.label}:${fact.value}`)
          .join(", ")}`,
    )
    .join("\n");
}

export async function coordinateCaseDecision(input: {
  report: string;
  current: ActiveCaseState;
  attachments: readonly AttachmentEvidence[];
  grounded: GroundedLookupBundle;
  severity: "low" | "medium" | "high" | "critical";
  issueType: string;
  probableCause: string;
  nextStep: string;
  openQuestions: string[];
  blockers: string[];
  immediateActions: string[];
  technicianChecklist: string[];
  safetySignals: string[];
}): Promise<CoordinatorDecision> {
  if (!hasCerebrasApiKey()) {
    return fallbackDecision(input);
  }

  const { object } = await generateObject({
    model: getCerebrasLanguageModel(),
    providerOptions: getCerebrasProviderOptions(),
    schema: CoordinatorDecisionSchema,
    system:
      "You are a maintenance case coordinator. Make staged, evidence-grounded decisions. Prefer dispatch only when risk, confidence, and evidence justify it. Use the provided citations, identify blockers, ask at most one best next question, and keep all recommendations operationally safe.",
    prompt: [
      `Raw report:\n${input.report}`,
      `Current case state:\n${JSON.stringify(input.current, null, 2)}`,
      `Derived severity: ${input.severity}`,
      `Provisional issue type: ${input.issueType}`,
      `Provisional probable cause: ${input.probableCause}`,
      `Initial next step: ${input.nextStep}`,
      `Initial open questions: ${input.openQuestions.join(" | ") || "none"}`,
      `Initial blockers: ${input.blockers.join(" | ") || "none"}`,
      `Initial immediate actions: ${input.immediateActions.join(" | ") || "none"}`,
      `Technician checklist seeds: ${input.technicianChecklist.join(" | ") || "none"}`,
      `Attachment evidence:\n${formatAttachmentLines(input.attachments) || "none"}`,
      `Grounded evidence with citations:\n${formatEvidenceLines(input.grounded) || "none"}`,
      `Grounded conflicts:\n${input.grounded.conflicts.map((conflict) => `${conflict.severity}: ${conflict.summary}`).join("\n") || "none"}`,
      "Return a structured coordinator decision. If evidence is incomplete, choose clarification. If safety signals or critical severity exist, dispatch is allowed. Use citations indirectly through rationale, but keep the output schema exact.",
    ].join("\n\n"),
  });

  return object;
}
