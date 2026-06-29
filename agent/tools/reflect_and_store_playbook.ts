import { defineTool } from "eve/tools";
import { z } from "zod";
import { distillPlaybookWithCerebras } from "../lib/cerebras.js";
import {
  assessPlaybookPromotion,
  formatGovernedPlaybookText,
  formatGovernedPlaybookTitle,
} from "../lib/governed-learning.js";
import { recallMemories, rememberMemory } from "../lib/memory-store.js";
import { PlaybookCandidateSchema } from "../lib/types.js";

function heuristicPlaybook(input: {
  incidentTitle: string;
  symptomSummary: string;
  resolutionSummary: string;
  outcome: string;
}) {
  return PlaybookCandidateSchema.parse({
    title: `${input.incidentTitle} - quick playbook`,
    appliesWhen: [input.symptomSummary],
    prerequisites: ["Symptoms verified by human report or technician notes"],
    steps: [input.resolutionSummary],
    stopConditions: ["Escalate if symptoms persist or safety risk increases"],
    limitations: ["Generated from a single case; verify against manuals and site conditions"],
    confidence: 0.62,
  });
}

export default defineTool({
  description: "Reflect on a resolved case, distill a reusable playbook, and store it if it passes conflict checks.",
  inputSchema: z.object({
    incidentTitle: z.string().min(3),
    symptomSummary: z.string().min(5),
    resolutionSummary: z.string().min(5),
    outcome: z.string().min(5),
    source: z.string().default("reflection"),
    evidence: z.array(z.string()).default([]),
  }),
  async execute(input) {
    const candidate =
      (await distillPlaybookWithCerebras({
        incidentTitle: input.incidentTitle,
        symptomSummary: input.symptomSummary,
        resolutionSummary: input.resolutionSummary,
        outcome: input.outcome,
        evidence: input.evidence,
      })) ?? heuristicPlaybook(input);

    const similarPlaybooks = await recallMemories(candidate.title, {
      scope: "playbook",
      limit: 5,
    });
    const similarIncidents = await recallMemories(
      `${input.symptomSummary}\n${input.resolutionSummary}\n${input.outcome}`,
      {
        scope: "incident",
        limit: 5,
      },
    );
    const assessment = assessPlaybookPromotion({
      candidate,
      similarPlaybooks,
      similarIncidents,
    });

    if (!assessment.approved) {
      return {
        candidate,
        stored: null,
        promoted: false,
        reason: assessment.conflictReason ?? "Candidate is not yet strong enough for automatic promotion.",
        conflicting: similarPlaybooks.filter((memory) =>
          assessment.conflictReason ? memory.text.toLowerCase().includes("reset") : false,
        ),
        governance: assessment,
      };
    }

    const stored = await rememberMemory({
      scope: "playbook",
      title: formatGovernedPlaybookTitle(candidate, assessment.version),
      text: formatGovernedPlaybookText({ candidate, assessment }),
      source: input.source,
      confidence: candidate.confidence,
      tags: [
        "generated-playbook",
        `review:${assessment.reviewStatus}`,
        `cluster:${assessment.clusterKey}`,
        `support:${assessment.supportCount}`,
      ],
      evidence: input.evidence.map((excerpt) => ({ source: input.source, excerpt })),
    });

    return {
      candidate,
      stored,
      promoted: true,
      conflicting: [],
      governance: assessment,
    };
  },
});
