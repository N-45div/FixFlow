import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DataType, MetricType, MilvusClient } from "@zilliz/milvus2-sdk-node";
import { VECTOR_DIMENSION, getMilvusConfig } from "./config.js";
import { cosineSimilarity, hashEmbedding } from "./hash-embedding.js";
import {
  MemoryRecordSchema,
  type MemoryRecord,
  type MemoryScope,
} from "./types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

interface SearchOptions {
  limit?: number;
  scope?: MemoryScope | "all";
}

interface StoredMemoriesFile {
  memories: MemoryRecord[];
}

class LocalMemoryStore {
  async remember(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
    const current = await this.readAll();
    const created = MemoryRecordSchema.parse({
      ...record,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    current.memories.push(created);
    await this.writeAll(current);
    return created;
  }

  async search(query: string, options: SearchOptions = {}): Promise<MemoryRecord[]> {
    const current = await this.readAll();
    const scope = options.scope ?? "all";
    const embedding = hashEmbedding(query);

    return current.memories
      .filter((record) => (scope === "all" ? true : record.scope === scope))
      .map((record) => ({
        record,
        score: cosineSimilarity(embedding, hashEmbedding(`${record.title}\n${record.text}`)),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 5)
      .map((entry) => entry.record);
  }

  private async readAll(): Promise<StoredMemoriesFile> {
    try {
      const raw = await readFile(MEMORY_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoredMemoriesFile;
      return {
        memories: parsed.memories.map((record) => MemoryRecordSchema.parse(record)),
      };
    } catch {
      await mkdir(DATA_DIR, { recursive: true });
      return { memories: [] };
    }
  }

  private async writeAll(data: StoredMemoriesFile): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
  }
}

class HybridMemoryStore {
  private readonly local = new LocalMemoryStore();
  private milvusClientPromise: Promise<MilvusClient | null> | null = null;

  async remember(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
    const created = await this.local.remember(record);

    try {
      const client = await this.getMilvusClient();
      if (client) {
        await this.insertMilvusRecord(client, created);
      }
    } catch {
      // Fall back to local memory if Milvus is unavailable.
    }

    return created;
  }

  async search(query: string, options: SearchOptions = {}): Promise<MemoryRecord[]> {
    try {
      const client = await this.getMilvusClient();
      if (client) {
        const remote = await this.searchMilvus(client, query, options);
        if (remote.length > 0) {
          return remote;
        }
      }
    } catch {
      // Fall back to local memory if Milvus search fails.
    }

    return this.local.search(query, options);
  }

  private async getMilvusClient(): Promise<MilvusClient | null> {
    if (!this.milvusClientPromise) {
      this.milvusClientPromise = this.connectMilvus();
    }
    return this.milvusClientPromise;
  }

  private async connectMilvus(): Promise<MilvusClient | null> {
    const config = getMilvusConfig();
    if (!config.address) {
      return null;
    }

    const client = new MilvusClient({
      address: config.address,
      token: config.token,
    });

    await client.connectPromise;
    await this.ensureCollection(client, config.caseCollection);
    await this.ensureCollection(client, config.playbookCollection);
    await this.ensureCollection(client, config.knowledgeCollection);
    return client;
  }

  private collectionName(scope: MemoryScope): string {
    const config = getMilvusConfig();
    if (scope === "incident") {
      return config.caseCollection;
    }
    if (scope === "playbook") {
      return config.playbookCollection;
    }
    return config.knowledgeCollection;
  }

  private async ensureCollection(client: MilvusClient, collectionName: string): Promise<void> {
    const exists = await client.hasCollection({ collection_name: collectionName });
    if (!exists.value) {
      await client.createCollection({
        collection_name: collectionName,
        fields: [
          { name: "id", data_type: DataType.VarChar, is_primary_key: true, autoID: false, max_length: 128 },
          { name: "title", data_type: DataType.VarChar, max_length: 512 },
          { name: "source", data_type: DataType.VarChar, max_length: 1024 },
          { name: "text", data_type: DataType.VarChar, max_length: 8192 },
          { name: "confidence", data_type: DataType.Float },
          { name: "createdAt", data_type: DataType.VarChar, max_length: 64 },
          { name: "tagsText", data_type: DataType.VarChar, max_length: 2048 },
          { name: "evidenceText", data_type: DataType.VarChar, max_length: 8192 },
          { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIMENSION },
        ],
        index_params: [
          {
            field_name: "vector",
            index_type: "HNSW",
            metric_type: MetricType.COSINE,
            params: { M: 16, efConstruction: 200 },
          },
        ],
      });
    }

    await client.loadCollection({ collection_name: collectionName });
  }

  private async insertMilvusRecord(client: MilvusClient, record: MemoryRecord): Promise<void> {
    await client.insert({
      collection_name: this.collectionName(record.scope),
      data: [
        {
          id: record.id,
          title: record.title,
          source: record.source,
          text: record.text,
          confidence: record.confidence,
          createdAt: record.createdAt,
          tagsText: record.tags.join(", "),
          evidenceText: record.evidence
            .map((item) => `${item.source}: ${item.excerpt}`)
            .join("\n"),
          vector: hashEmbedding(`${record.title}\n${record.text}`),
        },
      ],
    });
  }

  private async searchMilvus(
    client: MilvusClient,
    query: string,
    options: SearchOptions,
  ): Promise<MemoryRecord[]> {
    const embedding = hashEmbedding(query);
    const scopes =
      options.scope && options.scope !== "all"
        ? [options.scope]
        : (["incident", "playbook", "knowledge"] as MemoryScope[]);

    const results: MemoryRecord[] = [];
    for (const scope of scopes) {
      const response = await client.search({
        collection_name: this.collectionName(scope),
        data: [embedding],
        limit: options.limit ?? 5,
        output_fields: ["title", "source", "text", "confidence", "createdAt", "tagsText", "evidenceText"],
      });

      for (const hit of response.results ?? []) {
        const entity = hit as Record<string, unknown>;
        results.push(
          MemoryRecordSchema.parse({
            id: String(entity.id ?? randomUUID()),
            scope,
            title: String(entity.title ?? ""),
            source: String(entity.source ?? "milvus"),
            text: String(entity.text ?? ""),
            confidence: Number(entity.confidence ?? 0.5),
            createdAt: String(entity.createdAt ?? new Date().toISOString()),
            tags: String(entity.tagsText ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            evidence: String(entity.evidenceText ?? "")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [sourcePart, ...rest] = line.split(":");
                return {
                  source: sourcePart?.trim() || "milvus",
                  excerpt: rest.join(":").trim(),
                };
              }),
          }),
        );
      }
    }

    return results.slice(0, options.limit ?? 5);
  }
}

const memoryStore = new HybridMemoryStore();

export async function rememberMemory(record: Omit<MemoryRecord, "id" | "createdAt">) {
  return memoryStore.remember(record);
}

export async function recallMemories(query: string, options: SearchOptions = {}) {
  return memoryStore.search(query, options);
}

