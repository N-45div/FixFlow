import { generateObject } from "ai";
import { PlaybookCandidateSchema, type PlaybookCandidate } from "./types.js";
import {
  getCerebrasLanguageModel,
  getCerebrasProviderOptions,
  hasCerebrasApiKey,
} from "./provider.js";

export async function distillPlaybookWithCerebras(input: {
  incidentTitle: string;
  symptomSummary: string;
  resolutionSummary: string;
  outcome: string;
  evidence: string[];
}): Promise<PlaybookCandidate | null> {
  if (!hasCerebrasApiKey()) {
    return null;
  }

  const { object } = await generateObject({
    model: getCerebrasLanguageModel(),
    providerOptions: getCerebrasProviderOptions(),
    schema: PlaybookCandidateSchema,
    temperature: 0.1,
    system:
      "You extract safe reusable maintenance playbooks. Return only a grounded playbook when the incident details support reuse without inventing missing steps.",
    prompt: JSON.stringify(input),
  });

  return object as PlaybookCandidate;
}
