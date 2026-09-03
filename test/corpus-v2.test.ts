// Corpus v2 has to keep satisfying its own rules and keep its own difficulty. If
// one of these fails the corpus changed, and a changed corpus is a new version,
// not an edit.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadDocs, loadItems, loadRetrievalParams } from "../src/corpus.js";
import { chunkCorpus } from "../src/chunk.js";
import { fieldAxis, fieldGoldDocIds, fieldRetrievalFull, fieldRetrievalHit } from "../src/fields.js";
import { loadIndex } from "../src/index-io.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { scoreItem } from "../src/score.js";
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
  assert.equal(params.top_n, 32, "v2 reads thirty-two chunks, set against the full-retrieval rate");
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

// A question that asks which issue tracks something expects the id. Slack names
// the issue by its title and never by its id, so the title is the answer the
// evidence hands the model, and it has to resolve. The 14 decoy issues are gold
// for nothing and must NOT resolve: answering with a near-duplicate title is a
// wrong answer, not a phrasing difference.
test("every real issue title aliases to its id, and no decoy title does", () => {
  const goldDocIds = new Set(items.flatMap((item) => item.gold_doc_ids));
  const issues = docs.filter((doc) => doc.type === "issue");
  const real = issues.filter((doc) => goldDocIds.has(doc.id));
  const decoys = issues.filter((doc) => !goldDocIds.has(doc.id));
  assert.equal(real.length, 22);
  assert.equal(decoys.length, 14);

  for (const issue of real) {
    const title = (issue.title ?? "").toLowerCase();
    assert.equal(aliases[title], issue.id.toLowerCase(), `"${title}" must resolve to ${issue.id}`);
  }
  for (const issue of decoys) {
    const title = (issue.title ?? "").toLowerCase();
    assert.equal(aliases[title], undefined, `the decoy "${title}" must not resolve to anything`);
  }
});

test("an issue answered by its title scores the same as one answered by its id", () => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const item = byId.get("v2-case-011")!;
  const title = docs.find((doc) => doc.id === "WRN-204")?.title ?? "";
  const scored = scoreItem(item, { ...item.expected, root_cause_issue: title }, aliases, item.gold_doc_ids);
  const field = scored.fields.find((entry) => entry.field === "root_cause_issue");
  assert.equal(field?.correct, true, `answering "${title}" is answering WRN-204`);

  const decoy = docs.find((doc) => doc.id === "WRN-253")?.title ?? "";
  const wrong = scoreItem(item, { ...item.expected, root_cause_issue: decoy }, aliases, item.gold_doc_ids);
  assert.equal(wrong.fields.find((entry) => entry.field === "root_cause_issue")?.correct, false, decoy);
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

// The band is on FULL retrieval, not on the any-document hit rate. A join field
// whose two gold documents were half retrieved is a hit and is still
// unanswerable, so the any-document rate reads 100% on the join axis while two
// thirds of its fields were handed half the evidence. Reading is measured over
// the fields that had all of theirs, so that is the number the corpus is tuned
// against and the number this test defends.
test("the full-retrieval rate is high enough that the leaderboard measures reading", () => {
  const index = loadIndex(version);
  const retriever = new Retriever(index.chunks, index.chunkVectors);
  const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);
  const perAxis = new Map<Axis, { full: number; any: number; n: number }>();
  let full = 0;
  let any = 0;
  let scored = 0;
  for (const item of items) {
    const retrieved = retriever.retrieve(item.question, index.queryVectors.get(item.id), params);
    const retrievedDocIds = [...new Set(retrieved.map((entry) => entry.chunk.doc_id))];
    assert.equal(retrieved.length, params.top_n, `${item.id} retrieved ${retrieved.length} chunks`);
    for (const field of item.schema.required) {
      const complete = fieldRetrievalFull(item, field, retrievedDocIds);
      if (complete === null) {
        assert.equal(fieldGoldDocIds(item, field).length, 0);
        assert.equal(fieldRetrievalHit(item, field, retrievedDocIds), null);
        continue;
      }
      const axis = fieldAxis(item, field);
      const tally = perAxis.get(axis) ?? { full: 0, any: 0, n: 0 };
      tally.n += 1;
      scored += 1;
      if (complete) {
        tally.full += 1;
        full += 1;
      }
      if (fieldRetrievalHit(item, field, retrievedDocIds) === true) {
        tally.any += 1;
        any += 1;
      }
      perAxis.set(axis, tally);
    }
  }
  const rate = full / scored;
  assert.ok(
    rate >= 0.83 && rate <= 0.87,
    `the full-retrieval rate is ${(rate * 100).toFixed(1)}%, outside the 83% to 87% band`,
  );
  assert.ok(full < any, "the any-document rate is the looser flag and has to stay looser");

  // Every axis clears 70% except the two that need a second hop retrieval cannot
  // make: a join names its issue by title and the id is on a record the question
  // never mentions, and an exhaustive set is spread over documents that share no
  // wording. Both have a floor of their own so they cannot quietly regress.
  const SECOND_HOP = new Set<Axis>(["join", "exhaustive"]);
  const floors: Partial<Record<Axis, number>> = { join: 0.45, exhaustive: 0.55 };
  for (const [axis, tally] of perAxis) {
    const axisRate = tally.full / tally.n;
    const floor = SECOND_HOP.has(axis) ? floors[axis]! : 0.7;
    assert.ok(
      axisRate >= floor,
      `${axis} full-retrieval is ${(axisRate * 100).toFixed(1)}%, under its ${(floor * 100).toFixed(0)}% floor`,
    );
  }
  for (const axis of SECOND_HOP) {
    const tally = perAxis.get(axis)!;
    assert.ok(tally.any > tally.full, `${axis} is the axis where the any-document flag overstates retrieval`);
  }
});
