import { createHash } from "node:crypto";
import type { MemoryRecord, PlaybookCandidate } from "./types.js";

export interface PromotionAssessment {
  approved: boolean;
  conflictReason: string | null;
  supportCount: number;
  version: number;
  reviewStatus: "approved" | "provisional" | "rejected";
  clusterKey: string;
  supersedesId: string | null;
}

function normalizePlaybookTitle(title: string): string {
  return title.replace(/\s+\(v\d+\)$/i, "").trim();
}

function parseVersionFromTitle(title: string): number {
  const match = title.match(/\(v(\d+)\)$/i);
  return match?.[1] ? Number(match[1]) : 1;
}

export function computeClusterKey(candidate: PlaybookCandidate): string {
  const seed = [
    normalizePlaybookTitle(candidate.title).toLowerCase(),
    candidate.appliesWhen.join("|").toLowerCase(),
    candidate.steps.slice(0, 2).join("|").toLowerCase(),
  ].join("::");

  return createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

function findConflicts(
  candidate: PlaybookCandidate,
  similarPlaybooks: readonly MemoryRecord[],
  similarIncidents: readonly MemoryRecord[],
): string | null {
  const next = candidate.steps.join(" ").toLowerCase();
  const pool = [...similarPlaybooks, ...similarIncidents].map((memory) => memory.text.toLowerCase());

  if (next.includes("reset") && pool.some((text) => text.includes("do not reset"))) {
    return "Candidate recommends a reset but existing guidance says do not reset.";
  }
  if (next.includes("energize") && pool.some((text) => text.includes("lockout") || text.includes("de-energize"))) {
    return "Candidate could conflict with existing lockout or de-energize guidance.";
  }

  return null;
}

export function assessPlaybookPromotion(input: {
  candidate: PlaybookCandidate;
  similarPlaybooks: readonly MemoryRecord[];
  similarIncidents: readonly MemoryRecord[];
}): PromotionAssessment {
  const { candidate, similarPlaybooks, similarIncidents } = input;
  const conflictReason = findConflicts(candidate, similarPlaybooks, similarIncidents);
  const normalizedTitle = normalizePlaybookTitle(candidate.title);
  const titleMatches = similarPlaybooks.filter(
    (memory) => normalizePlaybookTitle(memory.title) === normalizedTitle,
  );
  const version =
    titleMatches.length > 0
      ? Math.max(...titleMatches.map((memory) => parseVersionFromTitle(memory.title))) + 1
      : 1;
  const supportCount = similarIncidents.length + 1;
  const clusterKey = computeClusterKey(candidate);
  const supersedesId =
    titleMatches.sort((left, right) => parseVersionFromTitle(right.title) - parseVersionFromTitle(left.title))[0]
      ?.id ?? null;

  if (conflictReason) {
    return {
      approved: false,
      conflictReason,
      supportCount,
      version,
      reviewStatus: "rejected",
      clusterKey,
      supersedesId,
    };
  }

  const approved = candidate.confidence >= 0.75 && supportCount >= 2;
  const reviewStatus = approved
    ? "approved"
    : candidate.confidence >= 0.65
      ? "provisional"
      : "rejected";

  return {
    approved,
    conflictReason: reviewStatus === "rejected" ? "Candidate confidence is too low for promotion." : null,
    supportCount,
    version,
    reviewStatus,
    clusterKey,
    supersedesId,
  };
}

export function formatGovernedPlaybookTitle(candidate: PlaybookCandidate, version: number): string {
  return `${normalizePlaybookTitle(candidate.title)} (v${version})`;
}

export function formatGovernedPlaybookText(input: {
  candidate: PlaybookCandidate;
  assessment: PromotionAssessment;
}): string {
  const { candidate, assessment } = input;

  return [
    `Applies when: ${candidate.appliesWhen.join("; ")}`,
    `Prerequisites: ${candidate.prerequisites.join("; ")}`,
    `Steps: ${candidate.steps.join("; ")}`,
    `Stop conditions: ${candidate.stopConditions.join("; ")}`,
    `Limitations: ${candidate.limitations.join("; ")}`,
    `Governance: review_status=${assessment.reviewStatus}; support_count=${assessment.supportCount}; cluster_key=${assessment.clusterKey}; supersedes_id=${assessment.supersedesId ?? "none"}`,
  ].join("\n");
}
