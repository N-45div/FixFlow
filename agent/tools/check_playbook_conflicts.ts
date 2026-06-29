import { defineTool } from "eve/tools";
import { z } from "zod";
import { assessPlaybookPromotion } from "../lib/governed-learning.js";
import { recallMemories } from "../lib/memory-store.js";
import { PlaybookCandidateSchema } from "../lib/types.js";

export default defineTool({
  description: "Check whether a candidate playbook conflicts with existing playbooks or prior incidents.",
  inputSchema: z.object({
    candidateTitle: z.string().min(3),
    candidateText: z.string().min(10),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async execute({ candidateTitle, candidateText, limit }) {
    const query = `${candidateTitle}\n${candidateText}`;
    const playbooks = await recallMemories(query, { scope: "playbook", limit });
    const incidents = await recallMemories(query, { scope: "incident", limit });
    const candidate = PlaybookCandidateSchema.parse({
      title: candidateTitle,
      appliesWhen: [candidateTitle],
      prerequisites: [],
      steps: [candidateText],
      stopConditions: [],
      limitations: [],
      confidence: 0.7,
    });
    const assessment = assessPlaybookPromotion({
      candidate,
      similarPlaybooks: playbooks,
      similarIncidents: incidents,
    });
    const conflicting = [...playbooks, ...incidents].filter((memory) =>
      assessment.conflictReason ? memory.text.toLowerCase().includes("reset") : false,
    );

    return {
      conflicting,
      similarPlaybooks: playbooks,
      similarIncidents: incidents,
      safeToPromote: assessment.approved,
      governance: assessment,
    };
  },
});
