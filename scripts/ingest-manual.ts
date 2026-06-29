import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { rememberMemory } from "../agent/lib/memory-store.js";

function chunkText(text: string, chunkSize = 1400, overlap = 200): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];

  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks.filter((chunk) => chunk.length > 80);
}

async function extractText(filePath: string): Promise<string> {
  if (filePath.toLowerCase().endsWith(".pdf")) {
    const bytes = await readFile(filePath);
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  const bytes = await readFile(filePath);
  return bytes.toString("utf8");
}

async function main() {
  const inputPath = process.argv[2];
  const sourceName = process.argv[3] ?? "manual-upload";
  const tagList = (process.argv[4] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!inputPath) {
    throw new Error("Usage: npm run ingest:manual -- <filePath> [sourceName] [comma,separated,tags]");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const titleBase = path.basename(absolutePath, path.extname(absolutePath));
  const text = await extractText(absolutePath);
  const chunks = chunkText(text);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    await rememberMemory({
      scope: "knowledge",
      title: `${titleBase} chunk ${index + 1}`,
      text: chunk,
      source: `${sourceName}:${absolutePath}`,
      confidence: 0.92,
      tags: [...tagList, "manual", titleBase],
      evidence: [
        {
          source: absolutePath,
          excerpt: chunk.slice(0, 260),
        },
      ],
    });
  }

  console.log(`Ingested ${chunks.length} chunks from ${absolutePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
