import { defineEval } from "eve/evals";
import { extractAttachmentEvidence } from "../../agent/lib/attachments.js";

export default defineEval({
  description:
    "Text-like attachment extraction can surface model and fault-code facts for later triage.",
  async test(t) {
    const result = await extractAttachmentEvidence([
      {
        bytes: Buffer.from(
          "Carrier service manual. Model FX4DNF037. Fault code E23. Warning high voltage.",
          "utf8",
        ),
        filename: "carrier-note.txt",
        mediaType: "text/plain",
        source: "mock://carrier-note",
      },
    ]);

    if (result.evidence.length !== 1) {
      throw new Error("Expected one extracted attachment evidence item.");
    }
    if (!result.evidence[0]?.facts.some((fact) => fact.label === "model")) {
      throw new Error("Expected extracted text attachment to include a model fact.");
    }
    if (
      !result.evidence[0]?.facts.some(
        (fact) => fact.label === "fault code" && fact.value === "E23",
      )
    ) {
      throw new Error("Expected extracted text attachment to include fault code E23.");
    }

    t.succeeded();
  },
});
