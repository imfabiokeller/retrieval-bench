// Reciprocal Rank Fusion with a soft recency boost and a per-document cap.
//
// Each arm contributes 1 / (k + rank) for every key it ranks, ranks being
// 1-based. k = 60. The recency boost adds recencyWeight / (k + 1) scaled by the
// candidate's position in the corpus timeline, so a newer chunk wins a tie
// without a newer chunk being able to outrank a much better lexical match.
// Deterministic throughout: ties break newest first, then by key.

export interface RankedList {
  name: string;
  /** Keys best first. */
  keys: string[];
}

export interface FusionOptions {
  rrfK: number;
  recencyWeight: number;
  maxPerDoc: number;
  topN: number;
  /** Milliseconds since epoch for the recency boost. */
  timeOf: (key: string) => number;
  docOf: (key: string) => string;
}

export interface Fused {
  key: string;
  rrf: number;
  score: number;
  ranks: Record<string, number>;
}

export function fuse(lists: RankedList[], options: FusionOptions): Fused[] {
  const { rrfK, recencyWeight, maxPerDoc, topN, timeOf, docOf } = options;

  const byKey = new Map<string, Fused>();
  for (const list of lists) {
    list.keys.forEach((key, index) => {
      let entry = byKey.get(key);
      if (entry === undefined) {
        entry = { key, rrf: 0, score: 0, ranks: {} };
        byKey.set(key, entry);
      }
      entry.rrf += 1 / (rrfK + index + 1);
      if (entry.ranks[list.name] === undefined) entry.ranks[list.name] = index + 1;
    });
  }

  const candidates = [...byKey.values()];
  if (candidates.length === 0) return [];

  const times = candidates.map((candidate) => timeOf(candidate.key));
  const oldest = Math.min(...times);
  const newest = Math.max(...times);
  const span = newest - oldest;
  for (const candidate of candidates) {
    const recency = span > 0 ? (timeOf(candidate.key) - oldest) / span : 1;
    candidate.score = candidate.rrf + (recencyWeight * recency) / (rrfK + 1);
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      timeOf(b.key) - timeOf(a.key) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );

  const perDoc = new Map<string, number>();
  const kept: Fused[] = [];
  for (const candidate of candidates) {
    const doc = docOf(candidate.key);
    const used = perDoc.get(doc) ?? 0;
    if (used >= maxPerDoc) continue;
    perDoc.set(doc, used + 1);
    kept.push(candidate);
    if (kept.length >= topN) break;
  }
  return kept;
}
