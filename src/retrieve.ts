// The fixed read arm. Two independent ranked lists over the same chunks:
//
//   bm25    Okapi BM25 over the chunk text, which is the contextual prefix plus the body
//   vector  cosine over the committed gemini-embedding-001 vectors of that same text
//
// The two lists are fused with Reciprocal Rank Fusion at k = 60, given a soft
// recency boost, capped at 2 chunks per document, and cut to the top N of the
// corpus version being run (8 for v1, 12 for v2). That is the entire retrieval
// stage. There is no LLM rerank: selection among the 8 is
// folded into the single extraction call, so the model under test stays the
// only variable in the benchmark.

import { buildBm25Index, bm25Rank } from "./bm25.js";
import type { Bm25Index } from "./bm25.js";
import { cosine } from "./embed.js";
import { fuse } from "./rrf.js";
import type { Chunk, RetrievalParams, Retrieved } from "./types.js";

/**
 * The v1 parameters, and the fallback for a corpus version that ships no
 * params.json. A published corpus states its own in corpus/<version>/params.json
 * and the runner reads them from there.
 */
export const RETRIEVAL_DEFAULTS: RetrievalParams = {
  top_n: 8,
  rrf_k: 60,
  recency_weight: 0.1,
  max_chunks_per_doc: 2,
};

export class Retriever {
  private readonly chunks: Chunk[];
  private readonly byId = new Map<string, Chunk>();
  private readonly vectorById = new Map<string, ArrayLike<number>>();
  private readonly timeById = new Map<string, number>();
  private readonly index: Bm25Index;

  constructor(chunks: Chunk[], vectors: ArrayLike<number>[]) {
    this.chunks = chunks;
    chunks.forEach((chunk, row) => {
      this.byId.set(chunk.id, chunk);
      this.timeById.set(chunk.id, Date.parse(chunk.created_at));
      const vector = vectors[row];
      if (vector) this.vectorById.set(chunk.id, vector);
    });
    this.index = buildBm25Index(chunks.map((chunk) => ({ key: chunk.id, text: chunk.text })));
  }

  private vectorRank(queryVector: ArrayLike<number> | undefined): string[] {
    if (!queryVector) return [];
    const scored: Array<{ key: string; score: number }> = [];
    for (const chunk of this.chunks) {
      const vector = this.vectorById.get(chunk.id);
      if (!vector) continue;
      const score = cosine(queryVector, vector);
      if (score > 0) scored.push({ key: chunk.id, score });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (this.timeById.get(b.key) ?? 0) - (this.timeById.get(a.key) ?? 0) ||
        (a.key < b.key ? -1 : 1),
    );
    return scored.map((entry) => entry.key);
  }

  retrieve(query: string, queryVector: ArrayLike<number> | undefined, params: RetrievalParams): Retrieved[] {
    const bm25 = bm25Rank(this.index, query).map((entry) => entry.key);
    const vector = this.vectorRank(queryVector);
    const fused = fuse(
      [
        { name: "bm25", keys: bm25 },
        { name: "vector", keys: vector },
      ],
      {
        rrfK: params.rrf_k,
        recencyWeight: params.recency_weight,
        maxPerDoc: params.max_chunks_per_doc,
        topN: params.top_n,
        timeOf: (key) => this.timeById.get(key) ?? 0,
        docOf: (key) => this.byId.get(key)?.doc_id ?? key,
      },
    );
    const results: Retrieved[] = [];
    for (const entry of fused) {
      const chunk = this.byId.get(entry.key);
      if (!chunk) continue;
      results.push({
        chunk,
        rrf: entry.rrf,
        score: entry.score,
        bm25_rank: entry.ranks.bm25 ?? null,
        vector_rank: entry.ranks.vector ?? null,
      });
    }
    return results;
  }
}

/** True when at least one retrieved chunk comes from a gold document. Null when the item has no gold documents. */
export function retrievalHit(retrieved: Retrieved[], goldDocIds: string[]): boolean | null {
  if (goldDocIds.length === 0) return null;
  const gold = new Set(goldDocIds);
  return retrieved.some((entry) => gold.has(entry.chunk.doc_id));
}
