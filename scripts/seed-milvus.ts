import seedPlaybooks from "../data/seed-playbooks.json" with { type: "json" };
import { rememberMemory } from "../agent/lib/memory-store.js";

async function main() {
  for (const item of seedPlaybooks) {
    await rememberMemory({
      scope: "knowledge",
      title: item.title,
      text: item.text,
      source: item.source,
      confidence: 0.98,
      tags: item.tags,
      evidence: [{ source: item.source, excerpt: item.text }],
    });
  }

  console.log(`Seeded ${seedPlaybooks.length} knowledge snippets.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
