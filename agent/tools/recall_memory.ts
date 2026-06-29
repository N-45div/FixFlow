import { defineTool } from "eve/tools";
import { z } from "zod";
import { recallMemories } from "../lib/memory-store.js";
import { MemoryScopeSchema } from "../lib/types.js";

export default defineTool({
  description: "Recall similar incidents, playbooks, or knowledge snippets from long-term memory.",
  inputSchema: z.object({
    query: z.string().min(3),
    scope: MemoryScopeSchema.or(z.literal("all")).default("all"),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async execute({ query, scope, limit }) {
    return recallMemories(query, { scope, limit });
  },
});

