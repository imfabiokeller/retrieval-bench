// Corpus v2 has to keep satisfying its own rules and keep its own difficulty. If
// one of these fails the corpus changed, and a changed corpus is a new version,
// not an edit.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadDocs, loadItems, loadRetrievalParams } from "../src/corpus.js";
import { chunkCorpus } from "../src/chunk.js";
import { fieldAxis, fieldGoldDocIds, fieldRetrievalHit } from "../src/fields.js";
import { loadIndex } from "../src/index-io.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { validateCorpus } from "../src/validate.js";
import type { Axis } from "../src/types.js";

const version = "v2";
const docs = loadDocs(version);
const items = loadItems(version);
const aliases = loadAliases(version);
const cases = items.filter((item) => item.twin_of === undefined);
const twins = items.filter((item) => item.twin_of !== undefined);

const AXES: Axis[] = [
  "entities",
  "facts",
  "supersession",
  "conflict",
  "abstain",
  "asof",
  "join",
  "exhaustive",
  "aggregation",
];

test("corpus v2 passes every structural rule", () => {
  assert.deepEqual(validateCorpus(docs, items), []);
});

test("corpus v2 has the counts its README states", () => {
  assert.equal(docs.length, 449);
  assert.equal(items.length, 123);
  assert.equal(cases.length, 90);
  assert.equal(twins.length, 33);
  const characters = docs.reduce((total, doc) => total + doc.text.length, 0);
  assert.ok(characters > 60_000 && characters < 95_000, `${characters} characters is outside the published range`);
});

test("every axis carries at least forty scored fields", () => {
  const perAxis = new Map<Axis, number>();
  for (const item of items) {
    for (const field of item.schema.required) {
      const axis = fieldAxis(item, field);
      perAxis.set(axis, (perAxis.get(axis) ?? 0) + 1);
    }
  }
  const total = [...perAxis.values()].reduce((sum, count) => sum + count, 0);
  assert.ok(total >= 400, `${total} scored fields is under the 400 the leaderboard needs`);
  for (const axis of AXES) {
    assert.ok((perAxis.get(axis) ?? 0) >= 40, `${axis} has ${perAxis.get(axis) ?? 0} fields, fewer than 40`);
  }
});

test("a case asks three to six fields and a twin asks exactly one", () => {
  for (const item of cases) {
    const count = item.schema.required.length;
    assert.ok(count >= 3 && count <= 6, `${item.id} has ${count} fields`);
  }
  for (const twin of twins) {
    assert.equal(twin.schema.required.length, 1, `${twin.id} is a twin and must ask one field`);
  }
});

test("most cases mix answerable fields with unanswerable ones", () => {
  const mixed = cases.filter(
    (item) =>
      item.schema.required.some((field) => fieldAxis(item, field) === "abstain") &&
      item.schema.required.some((field) => fieldAxis(item, field) !== "abstain"),
  );
  assert.ok(mixed.length > cases.length / 2, `only ${mixed.length} of ${cases.length} cases mix the two`);
});

test("item ids are stable and follow the versioned scheme", () => {
  for (const item of items) {
    assert.match(item.id, /^v2-(case|twin)-\d{3}$/, `${item.id} is not a stable versioned id`);
  }
});

test("the retrieval parameters belong to the corpus version", () => {
  const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);
  assert.equal(params.top_n, 12, "v2 reads twelve chunks");
  assert.equal(params.rrf_k, 60);
  assert.equal(params.recency_weight, 0.1);
  assert.equal(params.max_chunks_per_doc, 2);
  assert.equal(loadRetrievalParams("v1", RETRIEVAL_DEFAULTS).top_n, 8, "v1 keeps the eight it ran with");
});

test("aliases map to canonical values, never chain, and leave the ambiguous words alone", () => {
  for (const [alias, canonical] of Object.entries(aliases)) {
    assert.equal(alias, alias.toLowerCase().trim(), `alias "${alias}" is not normalized`);
    assert.notEqual(alias, canonical, `alias "${alias}" points at itself`);
    assert.ok(!(canonical in aliases), `alias "${alias}" points at "${canonical}", which is itself an alias`);
  }
  assert.equal(aliases["ravi"], undefined, "two people are called Ravi, so the bare first name resolves to neither");
  assert.equal(aliases["relay"], undefined, "relay is also an issue label, so the bare word resolves to no product");
  assert.equal(aliases["menon"], "ravi menon");
  assert.equal(aliases["sundaram"], "ravi sundaram");
});

test("the renamed product keeps two canonical names, one for each period", () => {
  assert.equal(aliases["the ledger"], "palisade ledger");
  assert.equal(aliases["audit vault"], "wrenfield audit vault");
  assert.notEqual(aliases["the ledger"], aliases["audit vault"], "the rename is a question, not an alias");
});

test("the committed index matches the corpus and the chunker", () => {
  const index = loadIndex(version);
  const chunks = chunkCorpus(docs);
  assert.equal(index.meta.corpus_version, version);
  assert.equal(index.meta.doc_count, docs.length);
  assert.equal(index.chunks.length, chunks.length, "the committed index is stale, rebuild it as a new version");
  assert.ok(chunks.length > docs.length, "the long digests are meant to pack into more than one chunk");
  assert.deepEqual(index.chunks.map((chunk) => chunk.id), chunks.map((chunk) => chunk.id));
  assert.equal(index.chunkVectors.length, chunks.length);
  assert.equal(index.queryVectors.size, items.length);
  for (const item of items) {
    assert.ok(index.queryVectors.has(item.id), `${item.id} has no committed query vector`);
  }
});

test("the retrieval hit rate is hard enough to separate reading from retrieving", () => {
  const index = loadIndex(version);
  const retriever = new Retriever(index.chunks, index.chunkVectors);
  const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);
  let hits = 0;
  let scored = 0;
  for (const item of items) {
    const retrieved = retriever.retrieve(item.question, index.queryVectors.get(item.id), params);
    const retrievedDocIds = [...new Set(retrieved.map((entry) => entry.chunk.doc_id))];
    assert.equal(retrieved.length, params.top_n, `${item.id} retrieved ${retrieved.length} chunks`);
    for (const field of item.schema.required) {
      const hit = fieldRetrievalHit(item, field, retrievedDocIds);
      if (hit === null) {
        assert.equal(fieldGoldDocIds(item, field).length, 0);
        continue;
      }
      scored += 1;
      if (hit) hits += 1;
    }
  }
  const rate = hits / scored;
  assert.ok(rate >= 0.85 && rate <= 0.9, `the hit rate is ${(rate * 100).toFixed(1)}%, outside the 85% to 90% band`);
});
