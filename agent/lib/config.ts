export const VECTOR_DIMENSION = 64;

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getCerebrasConfig() {
  return {
    apiKey: env("CEREBRAS_API_KEY"),
    baseUrl: env("CEREBRAS_BASE_URL") ?? "https://api.cerebras.ai/v1",
    model: env("CEREBRAS_MODEL") ?? "gemma-4-31b",
    reasoningEffort:
      env("CEREBRAS_REASONING_EFFORT") ?? "medium",
    contextWindowTokens: Number(env("CEREBRAS_CONTEXT_WINDOW_TOKENS") ?? "32768"),
  };
}

export function getMilvusConfig() {
  return {
    address: env("MILVUS_ADDRESS"),
    token: env("MILVUS_TOKEN"),
    caseCollection: env("MILVUS_CASE_COLLECTION") ?? "fixflow_incidents",
    playbookCollection: env("MILVUS_PLAYBOOK_COLLECTION") ?? "fixflow_playbooks",
    knowledgeCollection: "fixflow_knowledge",
  };
}

export function getAllowedDomains(): string[] {
  const raw = env("ALLOWED_WEB_DOMAINS");
  if (!raw) {
    return ["carrier.com", "osha.gov", "energy.gov"];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
