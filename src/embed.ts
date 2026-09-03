// Embeddings, used only by `npm run build-index`. A bench run never embeds
// anything: both the chunk vectors and the per-item query vectors are committed
// with the corpus.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { requireKey } from "./env.js";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_KEY_VAR = "GEMINI_API_KEY";
export const EMBEDDING_DIMS = 768;
export const EMBEDDING_ENDPOINT = "google generative ai (@ai-sdk/google)";

const BATCH = 50;

/** Unit length, so cosine similarity is a plain dot product. */
export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  if (length === 0) return vector;
  return vector.map((value) => value / length);
}

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<EmbedResult> {
  const google = createGoogleGenerativeAI({ apiKey: requireKey(EMBEDDING_KEY_VAR) });
  const model = google.textEmbeddingModel(EMBEDDING_MODEL);
  const vectors: number[][] = [];
  let tokens = 0;
  for (let start = 0; start < texts.length; start += BATCH) {
    const slice = texts.slice(start, start + BATCH);
    const result = await embedMany({
      model,
      values: slice,
      maxRetries: 3,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMS, taskType } },
    });
    for (const embedding of result.embeddings) vectors.push(normalizeVector([...embedding]));
    tokens += result.usage?.tokens ?? 0;
  }
  return { vectors, tokens };
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}
