import { createCerebras } from "@ai-sdk/cerebras";
import { getCerebrasConfig } from "./config.js";

export function hasCerebrasApiKey(): boolean {
  return Boolean(getCerebrasConfig().apiKey);
}

export function getCerebrasLanguageModel(modelId?: string) {
  const config = getCerebrasConfig();
  if (!config.apiKey) {
    throw new Error("CEREBRAS_API_KEY is required to create a Cerebras model.");
  }

  const cerebras = createCerebras({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return cerebras(modelId ?? config.model);
}

export function getCerebrasProviderOptions() {
  const config = getCerebrasConfig();

  return {
    cerebras: {
      reasoningEffort: config.reasoningEffort,
    },
  };
}
