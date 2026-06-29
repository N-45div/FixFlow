import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
import { getCerebrasConfig } from "../../lib/config.js";
import { getCerebrasLanguageModel, hasCerebrasApiKey } from "../../lib/provider.js";

const explicitModel = process.env.EVE_AGENT_MODEL?.trim();
const useMock = process.env.EVE_USE_MOCK_MODEL === "1" || !hasCerebrasApiKey();
const config = getCerebrasConfig();

export default defineAgent({
  model: useMock
    ? mockModel(() => "Mock safety reviewer response.")
    : getCerebrasLanguageModel(explicitModel),
  modelContextWindowTokens: useMock ? 32768 : config.contextWindowTokens,
  description:
    "Review a proposed maintenance diagnosis or action plan for operational and safety risk, especially electrical, water, refrigerant, and escalation hazards.",
});
