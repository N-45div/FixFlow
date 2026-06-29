import { defineTool } from "eve/tools";
import { z } from "zod";
import { getAllowedDomains } from "../lib/config.js";

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
}

export default defineTool({
  description: "Search trusted external web sources when memory and playbooks are insufficient.",
  inputSchema: z.object({
    query: z.string().min(3),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async execute({ query, limit }) {
    const allowedDomains = getAllowedDomains();
    const apiKey = process.env.EXA_API_KEY;

    if (!apiKey) {
      return {
        configured: false,
        allowedDomains,
        results: [],
        message: "No web search provider key configured yet.",
      };
    }

    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: limit,
        includeDomains: allowedDomains,
      }),
    });

    if (!response.ok) {
      throw new Error(`Web search failed with status ${response.status}`);
    }

    const json = (await response.json()) as { results?: ExaResult[] };

    return {
      configured: true,
      allowedDomains,
      results: (json.results ?? []).map((item) => ({
        title: item.title ?? "Untitled",
        url: item.url ?? "",
        excerpt: item.text?.slice(0, 400) ?? "",
      })),
    };
  },
});

