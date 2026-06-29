import { VECTOR_DIMENSION } from "./config.js";

export function hashEmbedding(text: string, dimension = VECTOR_DIMENSION): number[] {
  const vector = Array.from({ length: dimension }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const slot = Math.abs(hash) % dimension;
    vector[slot] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  const size = Math.min(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
    leftNorm += (left[index] ?? 0) ** 2;
    rightNorm += (right[index] ?? 0) ** 2;
  }

  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1;
  return dot / denom;
}

