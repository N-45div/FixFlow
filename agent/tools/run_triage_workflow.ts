import { defineTool } from "eve/tools";
import { z } from "zod";
import { runTriageWorkflow } from "../lib/triage-engine.js";
import { AttachmentEvidenceSchema } from "../lib/types.js";

export default defineTool({
  description:
    "Turn a raw maintenance report into a grounded triage packet with dispatcher guidance, technician checklist, customer reply, and evidence bundle.",
  inputSchema: z.object({
    report: z.string().min(5),
    language: z.string().default("en"),
    location: z.string().optional(),
    equipment: z.string().optional(),
    attachmentEvidence: z.array(AttachmentEvidenceSchema).default([]),
  }),
  async execute(input) {
    return runTriageWorkflow(input);
  },
});
