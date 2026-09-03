import { strict as assert } from "node:assert";
import { test } from "node:test";
import { scoreItem } from "../src/score.js";
import type { Item } from "../src/types.js";

const aliases = { dan: "dan okonkwo" };

const item: Item = {
  id: "t-001",
  axis: "supersession",
  question: "What is the current GA date and who owns the rollout?",
  schema: {
    type: "object",
    properties: { ga_date: { type: "date" }, owner: { type: "string" } },
    required: ["ga_date", "owner"],
    additionalProperties: false,
  },
  expected: { ga_date: "2026-04-07", owner: "Dan Okonkwo" },
  gold_doc_ids: ["doc-1"],
  notes: "fixture",
};

const abstainItem: Item = {
  id: "t-002",
  axis: "abstain",
  question: "What is the ARR?",
  schema: { type: "object", properties: { arr_eur: { type: "number" } }, required: ["arr_eur"], additionalProperties: false },
  expected: { arr_eur: null },
  gold_doc_ids: [],
  notes: "fixture",
};

test("an item is correct only when every field is correct", () => {
  const both = scoreItem(item, { ga_date: "7 April 2026", owner: "dan" }, aliases);
  assert.equal(both.correct, true);
  assert.deepEqual(both.fields.map((field) => field.correct), [true, true]);

  const one = scoreItem(item, { ga_date: "2026-03-24", owner: "Dan Okonkwo" }, aliases);
  assert.equal(one.correct, false);
  assert.deepEqual(one.fields.map((field) => field.correct), [false, true]);
});

test("per-field results record the normalized expected and got values", () => {
  const scored = scoreItem(item, { ga_date: "April 7, 2026", owner: "  DAN  " }, aliases);
  assert.equal(scored.fields[0]?.expected, "2026-04-07");
  assert.equal(scored.fields[0]?.got, "2026-04-07");
  assert.equal(scored.fields[1]?.got, "dan okonkwo");
});

test("a missing field counts as null and is wrong when a value was expected", () => {
  const scored = scoreItem(item, { ga_date: "2026-04-07" }, aliases);
  assert.equal(scored.correct, false);
  assert.equal(scored.fields[1]?.correct, false);
  assert.equal(scored.fields[1]?.got, null);
});

test("null is correct on an abstain item and a guess is not", () => {
  assert.equal(scoreItem(abstainItem, { arr_eur: null }, aliases).correct, true);
  assert.equal(scoreItem(abstainItem, {}, aliases).correct, true, "an omitted field is null");
  assert.equal(scoreItem(abstainItem, { arr_eur: 0 }, aliases).correct, false);
  assert.equal(scoreItem(abstainItem, { arr_eur: 4000000 }, aliases).correct, false);
});

test("an unparseable reply is wrong everywhere, including on abstain items", () => {
  const scored = scoreItem(abstainItem, null, aliases);
  assert.equal(scored.correct, false);
  assert.equal(scored.fields[0]?.correct, false);
});

test("extra fields the schema did not ask for are ignored", () => {
  const scored = scoreItem(item, { ga_date: "2026-04-07", owner: "Dan Okonkwo", confidence: "high" }, aliases);
  assert.equal(scored.correct, true);
  assert.equal(scored.fields.length, 2);
});
