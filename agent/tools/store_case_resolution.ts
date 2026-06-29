import { defineTool } from "eve/tools";
import { z } from "zod";
import { activeCaseState } from "../lib/state.js";
import { rememberMemory } from "../lib/memory-store.js";
import { EvidenceSchema, PrioritySchema } from "../lib/types.js";

export default defineTool({
  description: "Store a resolved or meaningfully updated maintenance incident as episodic case memory.",
  inputSchema: z.object({
    title: z.string().min(3),
    symptoms: z.string().min(5),
    diagnosis: z.string().min(5),
    actionTaken: z.string().min(5),
    outcome: z.string().min(5),
    source: z.string().default("session"),
    confidence: z.number().min(0).max(1).default(0.7),
    priority: PrioritySchema.default("medium"),
    tags: z.array(z.string()).default([]),
    evidence: z.array(EvidenceSchema).default([]),
  }),
  async execute(input) {
    const record = await rememberMemory({
      scope: "incident",
      title: input.title,
      text: [
        `Symptoms: ${input.symptoms}`,
        `Diagnosis: ${input.diagnosis}`,
        `Action: ${input.actionTaken}`,
        `Outcome: ${input.outcome}`,
        `Priority: ${input.priority}`,
      ].join("\n"),
      source: input.source,
      confidence: input.confidence,
      tags: input.tags,
      evidence: input.evidence,
    });

    activeCaseState.update((current) => ({
      ...current,
      summary: input.outcome,
      probableCause: input.diagnosis,
      nextStep: "Case stored for future recall.",
    }));

    return record;
  },
});

