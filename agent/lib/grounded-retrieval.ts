import { getAllowedDomains } from "./config.js";
import { recallMemories } from "./memory-store.js";
import type { MemoryScope } from "./types.js";

export interface EvidenceHit {
  id: string;
  citationId: string;
  title: string;
  excerpt: string;
  source: string;
  url?: string;
  domain?: string;
  publishedDate?: string;
  sourceType: "memory" | "web";
  scope?: MemoryScope;
  confidence: number;
  score: number;
  trustScore: number;
  freshnessScore: number;
  rationale: string;
  tags: string[];
}

export interface EvidenceConflict {
  summary: string;
  severity: "low" | "medium" | "high";
  citations: string[];
}

export interface GroundedLookupBundle {
  query: string;
  queryVariants: string[];
  safetySignals: string[];
  memoryHits: EvidenceHit[];
  webHits: EvidenceHit[];
  recommended: EvidenceHit[];
  conflicts: EvidenceConflict[];
  coverage: {
    hasMemoryEvidence: boolean;
    hasWebEvidence: boolean;
    hasOperationalGuidance: boolean;
  };
}

interface ExaSearchResult {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
  publishedDate?: string;
}

const HVAC_PATTERNS: Array<{ match: RegExp; expansion: string }> = [
  { match: /\b(leak|water|drip|overflow)\b/i, expansion: "condensate drain overflow indoor unit water leak hvac" },
  { match: /\b(no cooling|not cooling|warm air|hot air)\b/i, expansion: "thermostat powered no cooling hvac low airflow filter breaker compressor" },
  { match: /\b(no power|won't turn on|wont turn on|dead unit)\b/i, expansion: "hvac no power breaker disconnect thermostat transformer" },
  { match: /\b(smell|burning|smoke)\b/i, expansion: "electrical burning smell hvac urgent escalation safety" },
  { match: /\b(noisy|buzzing|clicking|humming)\b/i, expansion: "hvac unusual noise condenser fan contactor motor diagnosis" },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function keywordScore(query: string, candidate: string): number {
  const queryTokens = unique(tokenize(query));
  const candidateTokens = new Set(tokenize(candidate));
  if (queryTokens.length === 0) {
    return 0;
  }

  const matched = queryTokens.filter((token) => candidateTokens.has(token)).length;
  return matched / queryTokens.length;
}

function buildQueryVariants(query: string): string[] {
  const variants = [query.trim()];
  const compact = unique(tokenize(query)).join(" ");
  if (compact && compact !== query.trim().toLowerCase()) {
    variants.push(compact);
  }

  for (const pattern of HVAC_PATTERNS) {
    if (pattern.match.test(query)) {
      variants.push(`${query} ${pattern.expansion}`);
    }
  }

  return unique(variants).slice(0, 6);
}

function detectSafetySignals(query: string): string[] {
  const lower = query.toLowerCase();
  const signals: string[] = [];

  if (/\bburning|smoke|sparks?\b/.test(lower)) signals.push("electrical-hazard");
  if (/\bwater\b/.test(lower) && /\bpanel|power|breaker|electrical\b/.test(lower)) {
    signals.push("water-near-electric");
  }
  if (/\brefrigerant|chemical smell|gas smell\b/.test(lower)) signals.push("possible-refrigerant-risk");
  if (/\bmedical|server room|freezer|food\b/.test(lower)) signals.push("high-impact-environment");

  return signals;
}

function rankMemoryHit(
  query: string,
  candidate: {
    id: string;
    title: string;
    text: string;
    source: string;
    confidence: number;
    tags: string[];
    scope: MemoryScope;
  },
): EvidenceHit {
  const lexical = keywordScore(query, `${candidate.title}\n${candidate.text}\n${candidate.tags.join(" ")}`);
  const trustScore = candidate.scope === "playbook" ? 0.92 : candidate.scope === "knowledge" ? 0.86 : 0.8;
  const freshnessScore = 0.75;
  const score = candidate.confidence * 0.3 + lexical * 0.35 + trustScore * 0.2 + freshnessScore * 0.15;

  return {
    id: candidate.id,
    citationId: "",
    title: candidate.title,
    excerpt: candidate.text.slice(0, 420),
    source: candidate.source,
    sourceType: "memory",
    scope: candidate.scope,
    confidence: candidate.confidence,
    score,
    trustScore,
    freshnessScore,
    rationale: "Ranked from historical memory using lexical overlap, scope trust, and stored confidence.",
    tags: candidate.tags,
  };
}

function trustedDomainBoost(url: string | undefined, allowedDomains: string[]): number {
  if (!url) return 0;

  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`)) ? 0.15 : 0;
  } catch {
    return 0;
  }
}

function domainTrust(url: string | undefined, allowedDomains: string[]): number {
  if (!url) return 0.45;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))) {
      if (domain.endsWith(".gov") || domain.endsWith(".edu")) return 0.96;
      if (domain.includes("carrier") || domain.includes("trane") || domain.includes("daikin")) return 0.93;
      return 0.88;
    }
  } catch {
    return 0.45;
  }

  return 0.5;
}

function freshnessScoreFromDate(publishedDate: string | undefined): number {
  if (!publishedDate) return 0.55;
  const then = Date.parse(publishedDate);
  if (!Number.isFinite(then)) return 0.55;
  const ageDays = Math.max(0, (Date.now() - then) / (1000 * 60 * 60 * 24));
  if (ageDays <= 30) return 0.95;
  if (ageDays <= 180) return 0.85;
  if (ageDays <= 365) return 0.75;
  if (ageDays <= 730) return 0.65;
  return 0.5;
}

function rankWebHit(
  query: string,
  result: ExaSearchResult,
  index: number,
  allowedDomains: string[],
): EvidenceHit {
  const excerpt =
    result.highlights?.[0]?.trim() ||
    result.summary?.trim() ||
    result.text?.slice(0, 420).trim() ||
    "No excerpt available.";

  const lexical = keywordScore(query, `${result.title ?? ""}\n${excerpt}`);
  const rankBoost = Math.max(0, (10 - index) / 10) * 0.2;
  const trustScore = domainTrust(result.url, allowedDomains);
  const freshnessScore = freshnessScoreFromDate(result.publishedDate);
  const score =
    lexical * 0.35 +
    rankBoost +
    trustScore * 0.18 +
    freshnessScore * 0.12 +
    trustedDomainBoost(result.url, allowedDomains);

  return {
    id: result.url ?? `${result.title ?? "web"}-${index}`,
    citationId: "",
    title: result.title ?? "Untitled",
    excerpt,
    source: result.url ?? "web-search",
    url: result.url,
    domain: result.url ? new URL(result.url).hostname.replace(/^www\./, "") : undefined,
    publishedDate: result.publishedDate,
    sourceType: "web",
    confidence: 0.7,
    score,
    trustScore,
    freshnessScore,
    rationale: "Ranked from web evidence using lexical overlap, trusted-domain weighting, freshness, and search rank.",
    tags: [],
  };
}

function assignCitationIds(hits: EvidenceHit[]): EvidenceHit[] {
  return hits.map((hit, index) => ({
    ...hit,
    citationId: `${hit.sourceType === "memory" ? "M" : "W"}${index + 1}`,
  }));
}

function detectEvidenceConflicts(hits: readonly EvidenceHit[]): EvidenceConflict[] {
  const conflicts: EvidenceConflict[] = [];
  const joined = hits.map((hit) => ({
    citationId: hit.citationId,
    text: `${hit.title}\n${hit.excerpt}`.toLowerCase(),
  }));

  const hasResetConflict =
    joined.some((hit) => /\breset\b/.test(hit.text)) &&
    joined.some((hit) => /\bdo not reset\b/.test(hit.text));

  if (hasResetConflict) {
    conflicts.push({
      summary: "Evidence disagrees on whether a reset is appropriate.",
      severity: "high",
      citations: joined
        .filter((hit) => /\breset\b/.test(hit.text))
        .map((hit) => hit.citationId)
        .slice(0, 4),
    });
  }

  return conflicts;
}

async function memoryCascade(queryVariants: string[], limit: number): Promise<EvidenceHit[]> {
  const deduped = new Map<string, EvidenceHit>();

  for (const variant of queryVariants) {
    const hits = await recallMemories(variant, { scope: "all", limit: Math.max(limit, 6) });
    for (const hit of hits) {
      const ranked = rankMemoryHit(variant, hit);
      const key = `${ranked.scope ?? "unknown"}:${ranked.title}:${ranked.source}`;
      const current = deduped.get(key);
      if (!current || ranked.score > current.score) {
        deduped.set(key, ranked);
      }
    }
  }

  return [...deduped.values()].sort((left, right) => right.score - left.score).slice(0, limit);
}

async function webCascade(
  query: string,
  queryVariants: string[],
  limit: number,
): Promise<EvidenceHit[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return [];
  }

  const allowedDomains = getAllowedDomains();
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      includeDomains: allowedDomains,
      numResults: Math.max(limit, 5),
      type: process.env.WEB_SEARCH_MODE ?? "fast",
      contents: {
        highlights: true,
        summary: true,
        text: true,
      },
      systemPrompt:
        "Prefer official sources, manuals, safety guidance, and operational troubleshooting pages. Avoid duplicate or low-authority results.",
      additionalQueries: queryVariants.slice(1, 4),
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa grounded search failed with status ${response.status}`);
  }

  const json = (await response.json()) as { results?: ExaSearchResult[] };
  const results = json.results ?? [];

  return results
    .map((item, index) => rankWebHit(query, item, index, allowedDomains))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function groundedLookup(query: string, limit = 6): Promise<GroundedLookupBundle> {
  const queryVariants = buildQueryVariants(query);
  const safetySignals = detectSafetySignals(query);
  const memoryHits = await memoryCascade(queryVariants, limit);
  const webHits = await webCascade(query, queryVariants, limit);

  const recommended = assignCitationIds(
    [...memoryHits, ...webHits]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(limit, 6)),
  );
  const conflicts = detectEvidenceConflicts(recommended);

  return {
    query,
    queryVariants,
    safetySignals,
    memoryHits,
    webHits,
    recommended,
    conflicts,
    coverage: {
      hasMemoryEvidence: memoryHits.length > 0,
      hasWebEvidence: webHits.length > 0,
      hasOperationalGuidance: recommended.length > 0,
    },
  };
}
