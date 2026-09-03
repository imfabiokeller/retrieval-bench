// Okapi BM25 over chunk text. Written by hand so the benchmark has no search
// dependency and so the exact ranking is part of the versioned pipeline.
// Deterministic: no clock, no randomness, ties broken by chunk id.
//
// The lexical arm is what makes a rare literal token win: a bare "0.05%", a
// CVE identifier or a surname is rare in the corpus, so its IDF is high and it
// dominates the ranking, which is exactly the signal a dense vector smooths
// away.

export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "from", "by", "as", "is", "are", "was", "were", "be", "been", "being",
  "it", "its", "this", "that", "these", "those", "we", "you", "he", "she",
  "they", "our", "your", "their", "my", "me", "us", "them", "his", "her",
  "do", "does", "did", "have", "has", "had", "will", "would", "should", "could",
  "can", "may", "might", "must", "about", "into", "over", "up", "out", "if",
  "so", "no", "not", "what", "which", "who", "whom", "when", "where", "why",
  "how", "any", "all", "some", "more", "most", "other", "than", "then", "there",
  "here", "get", "got",
]);

/** Content tokens, with repeats, because BM25 needs term frequency. */
export function documentTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}.%-]+/gu)) {
    const token = raw.replace(/^[.%-]+|[.%-]+$/g, "");
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/** Distinct salient query tokens, in order of first appearance. */
export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of documentTokens(query)) {
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  return terms;
}

export interface Bm25Document {
  key: string;
  text: string;
}

export interface Bm25Index {
  postings: Map<string, Map<string, number>>;
  docLength: Map<string, number>;
  n: number;
  avgdl: number;
}

export function buildBm25Index(documents: Bm25Document[]): Bm25Index {
  const postings = new Map<string, Map<string, number>>();
  const docLength = new Map<string, number>();
  let totalLength = 0;
  for (const { key, text } of documents) {
    const tokens = documentTokens(text);
    docLength.set(key, tokens.length);
    totalLength += tokens.length;
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [token, tf] of counts) {
      let byDoc = postings.get(token);
      if (byDoc === undefined) {
        byDoc = new Map<string, number>();
        postings.set(token, byDoc);
      }
      byDoc.set(key, tf);
    }
  }
  const n = documents.length;
  return { postings, docLength, n, avgdl: n > 0 ? totalLength / n : 0 };
}

/** IDF = ln(1 + (N - df + 0.5) / (df + 0.5)), always at least 0. */
export function idf(n: number, df: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

export interface RankedKey {
  key: string;
  score: number;
}

/** Rank documents best first. Only documents with a positive score come back. */
export function bm25Rank(index: Bm25Index, query: string): RankedKey[] {
  const { postings, docLength, n, avgdl } = index;
  const scores = new Map<string, number>();
  for (const term of queryTerms(query)) {
    const byDoc = postings.get(term);
    if (byDoc === undefined) continue;
    const termIdf = idf(n, byDoc.size);
    if (termIdf <= 0) continue;
    for (const [key, tf] of byDoc) {
      const dl = docLength.get(key) ?? 0;
      const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / (avgdl || 1));
      scores.set(key, (scores.get(key) ?? 0) + termIdf * ((tf * (BM25_K1 + 1)) / (denom || 1)));
    }
  }
  return [...scores.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
