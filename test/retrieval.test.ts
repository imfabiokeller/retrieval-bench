import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bm25Rank, buildBm25Index, documentTokens, idf, queryTerms } from "../src/bm25.js";
import { chunkDoc, contextPrefix, splitBody } from "../src/chunk.js";
import { fuse } from "../src/rrf.js";
import type { Doc } from "../src/types.js";

const documents = [
  { key: "a", text: "The gateway p99 latency target is 180 ms after the February tightening." },
  { key: "b", text: "Palisade Edge is held to a p99 of 400 ms because of the regional proxy." },
  { key: "c", text: "Ticket volume in March was 218, up from 174 in February." },
  { key: "d", text: "The advisory identifier is CVE-2026-1881, not CVE-2026-1188." },
];

test("tokenizer drops stopwords and keeps rare literal tokens", () => {
  const tokens = documentTokens("The advisory is CVE-2026-1881 in #eng-palisade and 0.05% of requests");
  assert.ok(tokens.includes("cve-2026-1881"), "a hyphenated identifier stays one rare token");
  assert.ok(tokens.includes("eng-palisade"), "a channel name stays one rare token");
  assert.ok(tokens.includes("0.05"), "a percentage keeps its decimal and drops the sign");
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("is"));
});

test("query terms are deduplicated in order of first appearance", () => {
  assert.deepEqual(queryTerms("latency latency target latency"), ["latency", "target"]);
});

test("idf is never negative and rewards rare terms", () => {
  assert.ok(idf(100, 1) > idf(100, 50));
  assert.ok(idf(100, 100) >= 0);
});

test("BM25 ranks the document holding the rare token first", () => {
  const index = buildBm25Index(documents);
  assert.equal(bm25Rank(index, "CVE-2026-1881")[0]?.key, "d");
  assert.equal(bm25Rank(index, "ticket volume in March")[0]?.key, "c");
});

test("BM25 returns nothing when no query term appears", () => {
  assert.deepEqual(bm25Rank(buildBm25Index(documents), "kubernetes helm chart"), []);
});

test("BM25 is deterministic and breaks ties by key", () => {
  const index = buildBm25Index([
    { key: "z", text: "dublin dublin" },
    { key: "a", text: "dublin dublin" },
  ]);
  assert.deepEqual(bm25Rank(index, "dublin").map((entry) => entry.key), ["a", "z"]);
});

const time = (key: string): number => ({ a: 100, b: 200, c: 300, d: 400 })[key] ?? 0;
const sameDoc = (): string => "one-doc";

test("RRF sums 1/(k+rank) across the arms, so agreement wins", () => {
  const fused = fuse(
    [
      { name: "bm25", keys: ["a", "b", "c"] },
      { name: "vector", keys: ["b", "a", "c"] },
    ],
    { rrfK: 60, recencyWeight: 0, maxPerDoc: 10, topN: 10, timeOf: time, docOf: (key) => key },
  );
  assert.equal(fused.length, 3);
  const byKey = new Map(fused.map((entry) => [entry.key, entry]));
  assert.ok(Math.abs((byKey.get("a")?.rrf ?? 0) - (1 / 61 + 1 / 62)) < 1e-12);
  assert.ok(Math.abs((byKey.get("b")?.rrf ?? 0) - (1 / 62 + 1 / 61)) < 1e-12);
  assert.equal(fused[2]?.key, "c", "the key both arms rank last stays last");
});

test("RRF records the rank each arm gave, and null for an arm that missed", () => {
  const fused = fuse(
    [
      { name: "bm25", keys: ["a"] },
      { name: "vector", keys: ["b", "a"] },
    ],
    { rrfK: 60, recencyWeight: 0, maxPerDoc: 10, topN: 10, timeOf: time, docOf: (key) => key },
  );
  const a = fused.find((entry) => entry.key === "a");
  const b = fused.find((entry) => entry.key === "b");
  assert.deepEqual(a?.ranks, { bm25: 1, vector: 2 });
  assert.deepEqual(b?.ranks, { vector: 1 });
});

test("the recency boost breaks a tie toward the newer chunk", () => {
  const options = { rrfK: 60, maxPerDoc: 10, topN: 10, timeOf: time, docOf: (key: string) => key };
  const lists = [
    { name: "bm25", keys: ["a", "d"] },
    { name: "vector", keys: ["d", "a"] },
  ];
  const withBoost = fuse(lists, { ...options, recencyWeight: 0.1 });
  assert.equal(withBoost[0]?.key, "d", "d is newer and wins the tie");
  const withoutBoost = fuse(lists, { ...options, recencyWeight: 0 });
  assert.equal(withoutBoost[0]?.key, "d", "with no boost the newest-first tiebreak still applies");
});

test("the per-document cap limits how many chunks one document contributes", () => {
  const fused = fuse(
    [{ name: "bm25", keys: ["a", "b", "c", "d"] }],
    { rrfK: 60, recencyWeight: 0, maxPerDoc: 2, topN: 10, timeOf: time, docOf: sameDoc },
  );
  assert.equal(fused.length, 2);
  assert.deepEqual(fused.map((entry) => entry.key), ["a", "b"]);
});

test("topN cuts the fused list", () => {
  const fused = fuse(
    [{ name: "bm25", keys: ["a", "b", "c", "d"] }],
    { rrfK: 60, recencyWeight: 0, maxPerDoc: 10, topN: 2, timeOf: time, docOf: (key) => key },
  );
  assert.equal(fused.length, 2);
});

const slack: Doc = {
  id: "slack-eng-017",
  type: "slack",
  author: "Dan Okonkwo",
  created_at: "2026-02-11T15:33:00+01:00",
  channel: "eng-palisade",
  text: "Tightening the gateway SLO: p99 latency is now 180 ms.",
};

test("the contextual prefix carries type, channel, author and date", () => {
  const prefix = contextPrefix(slack);
  assert.ok(prefix.includes("slack message in #eng-palisade"));
  assert.ok(prefix.includes("by Dan Okonkwo"));
  assert.ok(prefix.includes("on 2026-02-11"));
});

test("a slack message is always exactly one chunk, prefix included in the indexed text", () => {
  const chunks = chunkDoc(slack);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.id, "slack-eng-017#0");
  assert.ok(chunks[0]?.text.startsWith(chunks[0]?.prefix ?? ""));
  assert.ok(chunks[0]?.text.includes("180 ms"));
});

test("a long document splits on sentence boundaries under the target", () => {
  const body = "One sentence here. Two sentences here. Three sentences here. Four sentences here.";
  const parts = splitBody(body, 40);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(part.length <= 40, `"${part}" is over the target`);
  assert.equal(parts.join(" "), body);
});

test("a long document keeps the same prefix on every chunk", () => {
  const doc: Doc = { ...slack, id: "doc-x", type: "doc", title: "Runbook", text: "A. ".repeat(400) };
  const chunks = chunkDoc(doc, 100);
  assert.ok(chunks.length > 1);
  const prefixes = new Set(chunks.map((chunk) => chunk.prefix));
  assert.equal(prefixes.size, 1);
  assert.deepEqual(chunks.map((chunk) => chunk.ordinal), chunks.map((_, index) => index));
});
