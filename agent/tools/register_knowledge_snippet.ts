import { defineTool } from "eve/tools";
import { z } from "zod";
import { rememberMemory } from "../lib/memory-store.js";

export default defineTool({
  description: "Store an approved troubleshooting snippet, SOP excerpt, or manual note in long-term knowledge memory.",
  inputSchema: z.object({
    title: z.string().min(3),
    text: z.string().min(10),
    source: z.string().min(1),
    tags: z.array(z.string()).default([]),
  }),
  async execute(input) {
    return rememberMemory({
      scope: "knowledge",
      title: input.title,
      text: input.text,
      source: input.source,
      confidence: 0.95,
      tags: input.tags,
      evidence: [{ source: input.source, excerpt: input.text.slice(0, 240) }],
    });
  },
});

