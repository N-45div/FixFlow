import { groundedLookup, type EvidenceHit } from "./grounded-retrieval.js";
import { coordinateCaseDecision } from "./coordinator.js";
import { activeCaseState } from "./state.js";
import type {
  ActiveCaseState,
  AttachmentEvidence,
  CaseStage,
} from "./types.js";

export interface TriageWorkflowInput {
  report: string;
  language?: string;
  location?: string;
  equipment?: string;
  attachmentEvidence?: AttachmentEvidence[];
}

function safeCurrentState(): ActiveCaseState {
  try {
    return activeCaseState.get();
  } catch {
    return {
      stage: "intake",
      issueType: "unknown",
      summary: "",
      language: "en",
      location: "",
      priority: "medium",
      confidence: 0.35,
      probableCause: "",
      nextStep: "",
      blockers: [],
      openQuestions: [],
      attachments: [],
    };
  }
}

function lower(text: string): string {
  return text.toLowerCase();
}

function inferSeverity(report: string, safetySignals: string[]): "low" | "medium" | "high" | "critical" {
  const text = lower(report);
  if (safetySignals.length > 0) return "critical";
  if (/\b(no cooling|not cooling|no power|water|leak|overflow)\b/.test(text)) return "high";
  if (/\b(noisy|buzzing|humming|weak airflow|filter)\b/.test(text)) return "medium";
  return "low";
}

function inferIssueType(report: string): string {
  const text = lower(report);
  if (/\bwater|leak|overflow|drip\b/.test(text)) return "water-leak";
  if (/\bno cooling|not cooling|warm air|hot air\b/.test(text)) return "cooling-failure";
  if (/\bno power|dead|won't turn on|wont turn on\b/.test(text)) return "power-loss";
  if (/\bsmoke|burning|sparks?\b/.test(text)) return "safety-hazard";
  if (/\bnoise|buzzing|clicking|humming\b/.test(text)) return "mechanical-noise";
  return "general-maintenance";
}

function probableCauses(evidence: EvidenceHit[]): string[] {
  const joined = evidence.map((hit) => `${hit.title} ${hit.excerpt}`).join("\n").toLowerCase();
  const causes: string[] = [];

  if (joined.includes("condensate drain")) causes.push("Possible condensate drain blockage");
  if (joined.includes("filter")) causes.push("Possible airflow restriction or dirty filter");
  if (joined.includes("breaker")) causes.push("Possible breaker or disconnect issue");
  if (joined.includes("compressor")) causes.push("Possible compressor or outdoor unit issue");
  if (joined.includes("electrical")) causes.push("Possible electrical hazard requiring qualified inspection");

  return causes.slice(0, 3);
}

function buildImmediateActions(
  severity: "low" | "medium" | "high" | "critical",
  issueType: string,
  safetySignals: string[],
): string[] {
  const actions: string[] = [];

  if (severity === "critical") {
    actions.push("Do not keep cycling power if there is a safety risk.");
  }
  if (safetySignals.includes("water-near-electric")) {
    actions.push("Keep people away from wet electrical areas until a qualified technician inspects.");
  }
  if (issueType === "water-leak") {
    actions.push("Check for active overflow and protect nearby property or electronics.");
  }
  if (issueType === "cooling-failure") {
    actions.push("Confirm thermostat mode and setpoint before dispatching a deeper repair.");
  }
  if (actions.length === 0) {
    actions.push("Gather one more high-value fact before assigning a final diagnosis.");
  }

  return actions;
}

function buildMissingInfo(report: string): string[] {
  const text = lower(report);
  const missing: string[] = [];

  if (!/\b(unit|hvac|ac|air handler|thermostat|condenser)\b/.test(text)) {
    missing.push("Exact equipment or unit involved");
  }
  if (!/\b(room|suite|apartment|floor|building|location)\b/.test(text)) {
    missing.push("Precise location of the issue");
  }
  if (!/\bwater|leak|cool|power|noise|smoke|smell\b/.test(text)) {
    missing.push("Primary symptom in plain words");
  }

  return missing.slice(0, 3);
}

function inferCaseStage(input: {
  report: string;
  missingInfo: string[];
  severity: "low" | "medium" | "high" | "critical";
  safetySignals: string[];
}): CaseStage {
  const text = lower(input.report);

  if (/\b(resolved|fixed|working now|restored|closed out|issue is gone)\b/.test(text)) {
    return "resolution";
  }
  if (input.safetySignals.length > 0 || input.severity === "critical" || input.severity === "high") {
    return "dispatch";
  }
  if (input.missingInfo.length > 0) {
    return "clarification";
  }
  if (/\bdiagnos|likely|probable\b/.test(text)) {
    return "diagnosis";
  }

  return "diagnosis";
}

function buildCaseBlockers(
  missingInfo: string[],
  safetySignals: string[],
  attachments: readonly AttachmentEvidence[],
): string[] {
  const blockers: string[] = [];

  if (missingInfo.length > 0) {
    blockers.push("missing-critical-context");
  }
  if (safetySignals.length > 0) {
    blockers.push("safety-review-required");
  }
  if (attachments.length === 0 && missingInfo.length > 0) {
    blockers.push("no-supporting-attachment-evidence");
  }

  return blockers;
}

function estimateConfidence(input: {
  evidenceCount: number;
  missingInfoCount: number;
  attachmentFactCount: number;
  safetySignalCount: number;
}): number {
  let confidence = 0.35;

  confidence += Math.min(0.2, input.evidenceCount * 0.04);
  confidence += Math.min(0.2, input.attachmentFactCount * 0.05);
  confidence -= Math.min(0.18, input.missingInfoCount * 0.06);
  confidence -= input.safetySignalCount > 0 ? 0.05 : 0;

  return Math.max(0.1, Math.min(0.95, Number(confidence.toFixed(2))));
}

function buildNextStep(stage: CaseStage, actions: string[], missingInfo: string[]): string {
  if (stage === "clarification" && missingInfo.length > 0) {
    return `Ask for: ${missingInfo[0]}.`;
  }

  return actions[0] ?? "Review evidence and gather one more fact.";
}

function renderAttachmentSignalText(attachments: readonly AttachmentEvidence[]): string {
  return attachments
    .map((attachment) => {
      const facts =
        attachment.facts.length > 0
          ? ` Facts: ${attachment.facts
              .map((fact) => `${fact.label} ${fact.value}`)
              .join(", ")}.`
          : "";
      return `${attachment.summary}.${facts}`;
    })
    .join(" ");
}

function technicianChecklist(issueType: string, evidence: EvidenceHit[]): string[] {
  const checklist: string[] = [];
  const joined = evidence.map((hit) => hit.excerpt).join("\n").toLowerCase();

  if (issueType === "cooling-failure") {
    checklist.push("Verify thermostat mode, setpoint, and call for cooling.");
    checklist.push("Check breaker/disconnect state and indoor airflow.");
  }
  if (issueType === "water-leak") {
    checklist.push("Inspect condensate drain line, drain pan, and active overflow path.");
    checklist.push("Verify no energized components are exposed to water.");
  }
  if (joined.includes("filter")) {
    checklist.push("Inspect filter condition and airflow restriction.");
  }
  if (joined.includes("compressor")) {
    checklist.push("If safe, verify outdoor unit operation before escalating refrigerant or compressor hypotheses.");
  }
  if (checklist.length === 0) {
    checklist.push("Start with the safest basic inspection and verify site-specific conditions.");
  }

  return checklist.slice(0, 5);
}

function renderCustomerMessage(language: string, severity: string, actions: string[], missingInfo: string[]): string {
  const nextStep = actions[0] ?? "A technician review is recommended.";
  const followUp = missingInfo.length > 0 ? `We may still need: ${missingInfo.join(", ")}.` : "We have enough detail to continue triage.";

  if (language.toLowerCase().startsWith("es")) {
    return `Siguiente paso: ${nextStep}. ${followUp}`;
  }

  return `Next step: ${nextStep}. ${followUp}`;
}

export async function runTriageWorkflow(input: TriageWorkflowInput) {
  const normalizedLanguage = input.language?.trim() || "en";
  const attachments = input.attachmentEvidence ?? [];
  const attachmentSignalText = renderAttachmentSignalText(attachments);
  const reportForReasoning = [input.report.trim(), attachmentSignalText].filter(Boolean).join("\n");
  const evidence = await groundedLookup(reportForReasoning, 6);
  const attachmentSignals = attachments.flatMap((attachment) => attachment.detectedSignals);
  const combinedSafetySignals = [...new Set([...evidence.safetySignals, ...attachmentSignals])];
  const severity = inferSeverity(reportForReasoning, [...evidence.safetySignals, ...attachmentSignals]);
  const issueType = inferIssueType(reportForReasoning);
  const causes = probableCauses(evidence.recommended);
  const actions = buildImmediateActions(severity, issueType, combinedSafetySignals);
  const missingInfo = buildMissingInfo(reportForReasoning);
  const blockers = buildCaseBlockers(missingInfo, combinedSafetySignals, attachments);
  const confidence = estimateConfidence({
    evidenceCount: evidence.recommended.length,
    missingInfoCount: missingInfo.length,
    attachmentFactCount: attachments.reduce((sum, attachment) => sum + attachment.facts.length, 0),
    safetySignalCount: combinedSafetySignals.length,
  });
  const checklist = technicianChecklist(issueType, evidence.recommended);

  const summary = input.report.trim();
  const probableCause = causes[0] ?? "Needs more evidence";
  const heuristicStage = inferCaseStage({
    report: reportForReasoning,
    missingInfo,
    severity,
    safetySignals: combinedSafetySignals,
  });
  const nextStep = buildNextStep(heuristicStage, actions, missingInfo);
  const current = safeCurrentState();
  const coordinator = await coordinateCaseDecision({
    report: reportForReasoning,
    current: {
      ...current,
      confidence,
      blockers,
      openQuestions: missingInfo,
      attachments,
    },
    attachments,
    grounded: evidence,
    severity,
    issueType,
    probableCause,
    nextStep,
    openQuestions: missingInfo,
    blockers,
    immediateActions: actions,
    technicianChecklist: checklist,
    safetySignals: combinedSafetySignals,
  });
  const nextState: ActiveCaseState = {
    ...current,
    stage: coordinator.stage,
    issueType: coordinator.issueType,
    summary,
    language: normalizedLanguage,
    location: input.location?.trim() || current.location,
    priority: severity,
    confidence: coordinator.confidence,
    probableCause: coordinator.probableCause,
    nextStep: coordinator.nextStep,
    blockers: coordinator.blockers,
    openQuestions: coordinator.openQuestions,
    attachments,
  };

  try {
    activeCaseState.update(() => nextState);
  } catch {
    // Standalone verification can run without an Eve context.
  }

  return {
    activeCase: nextState,
    triage: {
      stage: coordinator.stage,
      severity,
      issueType: coordinator.issueType,
      confidence: coordinator.confidence,
      probableCauses: causes,
      immediateActions: coordinator.immediateActions,
      missingInfo: coordinator.openQuestions,
      safetySignals: combinedSafetySignals,
      blockers: coordinator.blockers,
      rationale: coordinator.rationale,
      conflicts: evidence.conflicts,
    },
    dispatcher: {
      stage: coordinator.stage,
      summary,
      location: input.location?.trim() || "unknown",
      equipment: input.equipment?.trim() || "unknown",
      severity,
      confidence: coordinator.confidence,
      probableCause: coordinator.probableCause,
      nextStep: coordinator.nextStep,
      recommendedQuestion: coordinator.recommendedQuestion,
      escalationReason: coordinator.escalationReason,
    },
    technician: {
      checklist: coordinator.technicianChecklist,
      evidence: evidence.recommended.slice(0, 4),
      attachments,
    },
    customer: {
      language: normalizedLanguage,
      message: renderCustomerMessage(
        normalizedLanguage,
        severity,
        coordinator.immediateActions,
        coordinator.openQuestions,
      ),
    },
    evidence,
  };
}
