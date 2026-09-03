// The fixed read arm. It is deterministic, it is the same for every model, and
// its output is what the prompt is built from.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BM25_B, BM25_K1, bm25Rank, buildBm25Index, documentTokens, idf, queryTerms } from "../src/bm25.js";
import { CHUNK_TARGET_CHARS, chunkCorpus, chunkDoc, contextPrefix, splitBody } from "../src/chunk.js";
import { loadDocs, loadQuestions, loadRetrievalParams } from "../src/corpus.js";
import { loadIndex } from "../src/index-io.js";
import { renderEvidence } from "../src/prompt.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { fuse } from "../src/rrf.js";
import type { Doc } from "../src/types.js";

const version = "v1";
const index = loadIndex(version);
const retriever = new Retriever(index.chunks, index.chunkVectors);
const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);
const questions = loadQuestions(version);

const doc: Doc = {
  id: "slack-eng-core-003",
  type: "slack",
  author: "Priya Raman",
  created_at: "2027-03-24T10:41:00+01:00",
  channel: "eng-core",
  text: "The p99 latency budget is 165 ms from today.",
};

test("the contextual prefix leads with the document id", () => {
  const prefix = contextPrefix(doc);
  assert.ok(prefix.startsWith("[id=slack-eng-core-003 |"), prefix);
  assert.ok(prefix.includes("slack message in #eng-core"));
  assert.ok(prefix.includes("by Priya Raman"));
  assert.ok(prefix.includes("on 2027-03-24"));
});

test("a slack message is one chunk and the prefix is part of the indexed text", () => {
  const chunks = chunkDoc(doc);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.id, "slack-eng-core-003#0");
  assert.equal(chunks[0]?.text, `${contextPrefix(doc)}\n${doc.text}`);
  assert.equal(chunks[0]?.body, doc.text);
});

test("a long document is packed on sentence boundaries", () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} says something short.`).join(" ");
  const parts = splitBody(sentences, CHUNK_TARGET_CHARS);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(part.length <= CHUNK_TARGET_CHARS || !part.includes(". "), part.slice(0, 40));
  assert.equal(parts.join(" "), sentences);
});

test("bm25 is a plain lexical arm with stopwords removed", () => {
  assert.deepEqual(queryTerms("What is the p99 latency budget?"), ["p99", "latency", "budget"]);
  assert.ok(documentTokens("EUR 2,900 and 0.05%").includes("0.05"), "a decimal survives tokenization");
  assert.ok(documentTokens("issue WRN-4102 is open").includes("wrn-4102"), "an issue key is one token");
  assert.ok(idf(100, 1) > idf(100, 50), "a rarer term carries more weight");
  assert.equal(BM25_K1, 1.5);
  assert.equal(BM25_B, 0.75);
  const built = buildBm25Index([
    { key: "a", text: "the p99 latency budget is 165 ms" },
    { key: "b", text: "the coffee machine is broken again" },
  ]);
  assert.equal(bm25Rank(built, "p99 latency budget")[0]?.key, "a");
});

test("fusion caps a document and cuts to top_n, deterministically", () => {
  const keys = ["d1#0", "d1#1", "d1#2", "d2#0", "d3#0"];
  const fused = fuse([{ name: "bm25", keys }], {
    rrfK: 60,
    recencyWeight: 0,
    maxPerDoc: 2,
    topN: 3,
    timeOf: () => 0,
    docOf: (key) => key.split("#")[0] ?? key,
  });
  assert.deepEqual(fused.map((entry) => entry.key), ["d1#0", "d1#1", "d2#0"]);
});

test("the pipeline returns exactly top_n chunks and the same ones every time", () => {
  const question = questions[0];
  assert.ok(question);
  const once = retriever.retrieve(question.question, index.queryVectors.get(question.id), params);
  const twice = retriever.retrieve(question.question, index.queryVectors.get(question.id), params);
  assert.equal(once.length, params.top_n);
  assert.deepEqual(once.map((entry) => entry.chunk.id), twice.map((entry) => entry.chunk.id));
  assert.ok(once.every((entry) => entry.bm25_rank !== null || entry.vector_rank !== null));
});

test("no document contributes more than max_chunks_per_doc to a window", () => {
  for (const question of questions.slice(0, 30)) {
    const retrieved = retriever.retrieve(question.question, index.queryVectors.get(question.id), params);
    const perDoc = new Map<string, number>();
    for (const entry of retrieved) perDoc.set(entry.chunk.doc_id, (perDoc.get(entry.chunk.doc_id) ?? 0) + 1);
    for (const [id, count] of perDoc) assert.ok(count <= params.max_chunks_per_doc, `${question.id}: ${id} contributed ${count} chunks`);
  }
});

test("the rendered evidence numbers every extract and keeps its header", () => {
  const question = questions[0];
  assert.ok(question);
  const rendered = renderEvidence(retriever.retrieve(question.question, index.queryVectors.get(question.id), params));
  assert.ok(rendered.startsWith("[1] [id="));
  assert.equal(rendered.match(/^\[\d+\] \[id=/gm)?.length, params.top_n);
  assert.equal(renderEvidence([]), "(no evidence retrieved)");
});

test("chunking the frozen corpus reproduces the committed index exactly", () => {
  const rebuilt = chunkCorpus(loadDocs(version));
  assert.equal(rebuilt.length, index.chunks.length);
  assert.deepEqual(
    rebuilt.map((chunk) => chunk.id),
    index.chunks.map((chunk) => chunk.id),
    "the committed chunks are not what this chunker produces from docs.jsonl",
  );
  assert.deepEqual(rebuilt.map((chunk) => chunk.text), index.chunks.map((chunk) => chunk.text));
});
