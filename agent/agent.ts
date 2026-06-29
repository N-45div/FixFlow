import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
import { getCerebrasConfig } from "./lib/config.js";
import { getCerebrasLanguageModel, hasCerebrasApiKey } from "./lib/provider.js";

function resolveModelConfig() {
  const explicitModel = process.env.EVE_AGENT_MODEL?.trim();
  const useMock = process.env.EVE_USE_MOCK_MODEL === "1" || !hasCerebrasApiKey();
  const config = getCerebrasConfig();

  if (!useMock) {
    return {
      model: getCerebrasLanguageModel(explicitModel),
      modelContextWindowTokens: config.contextWindowTokens,
    };
  }

  return {
    modelContextWindowTokens: 32768,
    model: mockModel(({ lastUserMessage, toolResults }) => {
      const message = (lastUserMessage ?? "").toLowerCase();

      if (toolResults.length > 0) {
        return "Mock FixFlow completed the requested tool workflow.";
      }

      if (message.includes("remember leak case")) {
        return {
          toolCalls: [
            {
              name: "store_case_resolution",
              input: {
                title: "Indoor unit leak case",
                symptoms: "Water pooling near the indoor HVAC closet.",
                diagnosis: "Likely condensate drain blockage.",
                actionTaken:
                  "Clear the drain line and verify the drain pan is not overflowing.",
                outcome: "Leak risk reduced and unit can be inspected safely.",
                source: "mock",
                confidence: 0.82,
                priority: "high",
                tags: ["hvac", "leak"],
                evidence: [
                  {
                    source: "mock",
                    excerpt: "Caller reports water under the indoor unit.",
                  },
                ],
              },
            },
          ],
        };
      }

      if (message.includes("find leak knowledge")) {
        return {
          toolCalls: [
            {
              name: "recall_memory",
              input: {
                query: "water near indoor hvac equipment condensate drain blockage",
                scope: "knowledge",
                limit: 2,
              },
            },
          ],
        };
      }

      return "Mock FixFlow is ready. Ask it to find leak knowledge or remember leak case.";
    }),
  };
}

const { model, modelContextWindowTokens } = resolveModelConfig();

export default defineAgent({
  model,
  modelContextWindowTokens,
  description:
    "Bilingual maintenance copilot for HVAC and facility teams that triages issues, recalls similar incidents, checks safety, and learns durable playbooks over time.",
});
