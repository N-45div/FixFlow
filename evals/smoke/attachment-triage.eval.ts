import { defineEval } from "eve/evals";
import { runTriageWorkflow } from "../../agent/lib/triage-engine.js";

export default defineEval({
  description:
    "Attachment evidence is persisted into the active case and can elevate safety-aware triage.",
  async test(t) {
    const result = await runTriageWorkflow({
      report: "The AC is not cooling and the tenant sent a unit label photo.",
      attachmentEvidence: [
        {
          id: "att-1",
          kind: "image",
          filename: "unit-label.jpg",
          mediaType: "image/jpeg",
          summary:
            "Equipment label appears to show model FX4DNF037, serial 2410A88, and a 208/230V marking.",
          extractedText: "MODEL FX4DNF037 SERIAL 2410A88 208/230V",
          detectedSignals: ["electrical"],
          facts: [
            { label: "model", value: "FX4DNF037" },
            { label: "serial", value: "2410A88" },
            { label: "voltage", value: "208/230V" },
          ],
          tags: ["image", "model", "serial", "hvac"],
          confidence: 0.91,
          source: "mock://unit-label",
        },
      ],
    });

    if (result.activeCase.attachments.length !== 1) {
      throw new Error("Expected attachment evidence to persist into the active case.");
    }
    if (!result.triage.safetySignals.includes("electrical")) {
      throw new Error("Expected electrical signal to appear in triage safety signals.");
    }
    if (result.activeCase.stage !== "dispatch") {
      throw new Error(`Expected case stage to be dispatch, got ${result.activeCase.stage}.`);
    }

    t.succeeded();
  },
});
