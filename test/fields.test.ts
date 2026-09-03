// Per-field axes and gold documents, and the inheritance that keeps v1 valid.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fieldAxis, fieldGoldDocIds, fieldMeta, fieldRetrievalHit, goldDocIdsOf } from "../src/fields.js";
import { scoreItem } from "../src/score.js";
import { validateCorpus } from "../src/validate.js";
import type { Doc, Item } from "../src/types.js";

const v1Item: Item = {
  id: "v1-sup-001",
  axis: "supersession",
  question: "What is the current GA date?",
  schema: {
    type: "object",
    properties: { ga_date: { type: "date" }, owner: { type: "string" } },
    required: ["ga_date", "owner"],
    additionalProperties: false,
  },
  expected: { ga_date: "2026-04-07", owner: "Dan Okonkwo" },
  gold_doc_ids: ["doc-1", "doc-2"],
  notes: "fixture",
};

const v2Case: Item = {
  id: "v2-case-001",
  axis: "asof",
  question: "Summarize the outage.",
  schema: {
    type: "object",
    properties: {
      p99_ms: { type: "number" },
      owner: { type: "string" },
      credits_eur: { type: "number" },
    },
    required: ["p99_ms", "owner", "credits_eur"],
    additionalProperties: false,
  },
  expected: { p99_ms: 180, owner: "Dan Okonkwo", credits_eur: null },
  gold_doc_ids: ["doc-1", "doc-2", "doc-3"],
  notes: "fixture",
  fields: {
    p99_ms: { axis: "asof", gold_doc_ids: ["doc-1"] },
    owner: { axis: "join", gold_doc_ids: ["doc-2", "doc-3"] },
    credits_eur: { axis: "abstain", gold_doc_ids: [] },
  },
};

test("a v1 field inherits the item axis and the item gold documents", () => {
  assert.deepEqual(fieldMeta(v1Item, "ga_date"), { axis: "supersession", gold_doc_ids: ["doc-1", "doc-2"] });
  assert.equal(fieldAxis(v1Item, "owner"), "supersession");
  assert.deepEqual(goldDocIdsOf(v1Item), ["doc-1", "doc-2"]);
});

test("a v2 field carries its own axis and its own gold documents", () => {
  assert.equal(fieldAxis(v2Case, "p99_ms"), "asof");
  assert.equal(fieldAxis(v2Case, "owner"), "join");
  assert.deepEqual(fieldGoldDocIds(v2Case, "owner"), ["doc-2", "doc-3"]);
  assert.deepEqual(goldDocIdsOf(v2Case), ["doc-1", "doc-2", "doc-3"], "the item gold is the union");
});

test("the retrieval hit flag is per field, and null for a field with no gold documents", () => {
  assert.equal(fieldRetrievalHit(v2Case, "p99_ms", ["doc-9", "doc-1"]), true);
  assert.equal(fieldRetrievalHit(v2Case, "p99_ms", ["doc-2", "doc-3"]), false, "another field's gold is not this one's");
  assert.equal(fieldRetrievalHit(v2Case, "owner", ["doc-3"]), true, "one of the two is enough");
  assert.equal(fieldRetrievalHit(v2Case, "credits_eur", ["doc-1"]), null);
});

test("scoring puts the field axis and the field hit flag on every field row", () => {
  const scored = scoreItem(v2Case, { p99_ms: 180, owner: "dan", credits_eur: null }, { dan: "dan okonkwo" }, ["doc-1"]);
  assert.equal(scored.correct, true);
  assert.deepEqual(scored.fields.map((field) => field.axis), ["asof", "join", "abstain"]);
  assert.deepEqual(scored.fields.map((field) => field.retrieval_hit), [true, false, null]);
});

const docs: Doc[] = ["doc-1", "doc-2", "doc-3"].map((id) => ({
  id,
  type: "slack",
  author: "Dan Okonkwo",
  created_at: "2027-01-01T09:00:00+01:00",
  channel: "eng-core",
  text: "something",
}));

test("the validator checks a field against its own axis, not the item's", () => {
  assert.deepEqual(validateCorpus(docs, [v2Case]), []);

  const abstainWithGold: Item = {
    ...v2Case,
    id: "v2-case-002",
    fields: { ...v2Case.fields, credits_eur: { axis: "abstain", gold_doc_ids: ["doc-1"] } },
  };
  assert.deepEqual(validateCorpus(docs, [abstainWithGold]), [
    "v2-case-002.credits_eur: an abstain field must have no gold documents",
  ]);

  const joinWithOneDoc: Item = {
    ...v2Case,
    id: "v2-case-003",
    gold_doc_ids: ["doc-1", "doc-2"],
    fields: { ...v2Case.fields, owner: { axis: "join", gold_doc_ids: ["doc-2"] } },
  };
  assert.deepEqual(validateCorpus(docs, [joinWithOneDoc]), [
    "v2-case-003.owner: a join field needs at least two gold documents",
  ]);
});

test("the validator refuses gold_doc_ids that are not the union of the field gold", () => {
  const wrongUnion: Item = { ...v2Case, id: "v2-case-004", gold_doc_ids: ["doc-1"] };
  assert.deepEqual(validateCorpus(docs, [wrongUnion]), [
    "v2-case-004: gold_doc_ids is not the union of the per-field gold documents",
  ]);
});

test("a twin has to ask one field of a real case, on the same axis and the same gold", () => {
  const twin: Item = {
    id: "v2-twin-001",
    axis: "asof",
    question: "What was the p99 on that date?",
    schema: { type: "object", properties: { p99_ms: { type: "number" } }, required: ["p99_ms"], additionalProperties: false },
    expected: { p99_ms: 180 },
    gold_doc_ids: ["doc-1"],
    notes: "fixture",
    fields: { p99_ms: { axis: "asof", gold_doc_ids: ["doc-1"] } },
    twin_of: "v2-case-001",
  };
  assert.deepEqual(validateCorpus(docs, [v2Case, twin]), []);

  const drifted: Item = { ...twin, id: "v2-twin-002", expected: { p99_ms: 165 } };
  assert.deepEqual(validateCorpus(docs, [v2Case, drifted]), [
    "v2-twin-002.p99_ms: expected value differs from v2-case-001.p99_ms",
  ]);

  const orphan: Item = { ...twin, id: "v2-twin-003", twin_of: "v2-case-999" };
  assert.deepEqual(validateCorpus(docs, [v2Case, orphan]), ["v2-twin-003: twin_of v2-case-999 does not exist"]);
});
