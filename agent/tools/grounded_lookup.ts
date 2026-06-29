import { defineTool } from "eve/tools";
import { z } from "zod";
import { groundedLookup } from "../lib/grounded-retrieval.js";

export default defineTool({
  description:
    "Run a grounded retrieval cascade over incident memory, playbooks, knowledge snippets, and trusted web sources, then rerank the evidence for maintenance triage.",
  inputSchema: z.object({
    query: z.string().min(3),
    limit: z.number().int().min(3).max(12).default(6),
  }),
  async execute({ query, limit }) {
    return groundedLookup(query, limit);
  },
});

