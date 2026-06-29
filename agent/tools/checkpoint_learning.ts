import { defineTool } from "eve/tools";
import { z } from "zod";
import { distillPlaybookWithCerebras } from "../lib/cerebras.js";
import {
  assessPlaybookPromotion,
  formatGovernedPlaybookText,
  formatGovernedPlaybookTitle,
} from "../lib/governed-learning.js";
import { recallMemories, rememberMemory } from "../lib/memory-store.js";
import { PlaybookCandidateSchema, EvidenceSchema, PrioritySchema } from "../lib/types.js";

function fallbackCandidate(input: {
  title: string;
  symptoms: string;
  actionTaken: string;
}) {
  return PlaybookCandidateSchema.parse({
    title: `${input.title} - distilled lesson`,
    appliesWhen: [input.symptoms],
    prerequisites: ["A human has confirmed the symptoms and the site context matches the original case."],
    steps: [input.actionTaken],
    stopConditions: ["Escalate if the observed symptoms diverge from the original case."],
    limitations: ["Fallback summary generated without Cerebras enrichment."],
    confidence: 0.6,
  });
}

export default defineTool({
  description:
    "Checkpoint a resolved case into memory: store the incident, distill a candidate playbook, compare it against existing guidance, and only promote it if the checkpoint is safe.",
  inputSchema: z.object({
    title: z.string().min(3),
    symptoms: z.string().min(5),
    diagnosis: z.string().min(5),
    actionTaken: z.string().min(5),
    outcome: z.string().min(5),
    source: z.string().default("checkpoint"),
    confidence: z.number().min(0).max(1).default(0.75),
    priority: PrioritySchema.default("medium"),
    tags: z.array(z.string()).default([]),
    evidence: z.array(EvidenceSchema).default([]),
  }),
  async execute(input) {
    const incident = await rememberMemory({
      scope: "incident",
      title: input.title,
      text: [
        `Symptoms: ${input.symptoms}`,
        `Diagnosis: ${input.diagnosis}`,
        `Action: ${input.actionTaken}`,
        `Outcome: ${input.outcome}`,
      ].join("\n"),
      source: input.source,
      confidence: input.confidence,
      tags: input.tags,
      evidence: input.evidence,
    });

    const candidate =
      (await distillPlaybookWithCerebras({
        incidentTitle: input.title,
        symptomSummary: input.symptoms,
        resolutionSummary: input.actionTaken,
        outcome: input.outcome,
        evidence: input.evidence.map((item) => `${item.source}: ${item.excerpt}`),
      })) ?? fallbackCandidate(input);

    const similarPlaybooks = await recallMemories(candidate.title, {
      scope: "playbook",
      limit: 5,
    });
    const similarIncidents = await recallMemories(`${input.symptoms}\n${input.diagnosis}`, {
      scope: "incident",
      limit: 5,
    });
    const assessment = assessPlaybookPromotion({
      candidate,
      similarPlaybooks,
      similarIncidents,
    });

    const playbook = assessment.approved
      ? await rememberMemory({
          scope: "playbook",
          title: formatGovernedPlaybookTitle(candidate, assessment.version),
          text: formatGovernedPlaybookText({ candidate, assessment }),
          source: input.source,
          confidence: candidate.confidence,
          tags: [
            ...input.tags,
            "checkpoint-promoted",
            `review:${assessment.reviewStatus}`,
            `cluster:${assessment.clusterKey}`,
            `support:${assessment.supportCount}`,
          ],
          evidence: input.evidence,
        })
      : null;

    return {
      incident,
      candidate,
      promoted: Boolean(playbook),
      playbook,
      similarPlaybooks,
      similarIncidents,
      governance: assessment,
    };
  },
});
