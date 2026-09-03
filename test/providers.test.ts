// End to end over the real corpus with the offline mocks: no key, no network.
// The oracle proves the harness can score a correct answer correct on every
// axis; the null model proves the abstain axis is not free points.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadItems } from "../src/corpus.js";
import { loadIndex } from "../src/index-io.js";
import { findModel } from "../src/models.js";
import { parseObject } from "../src/prompt.js";
import { createModelFactory } from "../src/providers/index.js";
import { mockAnswer } from "../src/providers/mock.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { runItem, runParamsFor } from "../src/run.js";
import type { RunItemContext } from "../src/run.js";

const version = "v1";
const items = loadItems(version);
const aliases = loadAliases(version);
const index = loadIndex(version);
const retriever = new Retriever(index.chunks, index.chunkVectors);

function contextFor(name: string): RunItemContext {
  const entry = findModel(name);
  return {
    retriever,
    queryVectors: index.queryVectors,
    aliases,
    entry,
    params: runParamsFor(entry, RETRIEVAL_DEFAULTS),
    modelFor: createModelFactory(entry).forItem,
  };
}

// A cross-section rather than all 204 items, so the suite stays fast.
const sample = [
  ...items.filter((item) => item.axis === "entities").slice(0, 6),
  ...items.filter((item) => item.axis === "facts").slice(0, 6),
  ...items.filter((item) => item.axis === "supersession").slice(0, 6),
  ...items.filter((item) => item.axis === "conflict").slice(0, 6),
  ...items.filter((item) => item.axis === "abstain").slice(0, 6),
];

test("the oracle model scores 100% on every axis", async () => {
  const context = contextFor("oracle");
  for (const item of sample) {
    const result = await runItem(context, item);
    assert.equal(result.error, null, `${item.id} errored: ${result.error}`);
    assert.equal(result.retries, 0, `${item.id} needed a retry`);
    assert.equal(result.correct, true, `${item.id} (${item.axis}) scored incorrect against its own gold object`);
  }
});

test("the null model scores 100% on abstain and 0% everywhere else", async () => {
  const context = contextFor("null");
  for (const item of sample) {
    const result = await runItem(context, item);
    assert.equal(result.error, null);
    assert.equal(
      result.correct,
      item.axis === "abstain",
      `${item.id} (${item.axis}) should be ${item.axis === "abstain" ? "correct" : "incorrect"} for an all-null answer`,
    );
  }
});

test("a run records the retrieved chunks, the prompt and the retrieval hit flag", async () => {
  const context = contextFor("oracle");
  const item = items.find((entry) => entry.axis === "supersession");
  assert.ok(item);
  const result = await runItem(context, item);
  assert.equal(result.retrieved_chunk_ids.length, RETRIEVAL_DEFAULTS.top_n);
  assert.ok(result.prompt.includes(item.question));
  assert.ok(result.prompt.includes("EVIDENCE"));
  assert.equal(typeof result.retrieval_hit, "boolean");

  const abstain = items.find((entry) => entry.axis === "abstain");
  assert.ok(abstain);
  const abstainResult = await runItem(context, abstain);
  assert.equal(abstainResult.retrieval_hit, null, "an item with no gold documents has no hit flag");
});

test("mockAnswer returns the gold object for oracle and all nulls for null", () => {
  const item = items[0];
  assert.ok(item);
  assert.deepEqual(mockAnswer("oracle", item), item.expected);
  const nulls = mockAnswer("null", item);
  assert.deepEqual(Object.keys(nulls), item.schema.required);
  assert.ok(Object.values(nulls).every((value) => value === null));
});

test("the parser survives code fences, prose and trailing text", () => {
  assert.deepEqual(parseObject('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseObject('Here you go:\n{"a": "b"}\nHope that helps.'), { a: "b" });
  assert.deepEqual(parseObject('{"a": {"b": 2}} trailing'), { a: { b: 2 } });
  assert.deepEqual(parseObject('{"a": "brace } inside a string"}'), { a: "brace } inside a string" });
  assert.equal(parseObject("no json at all"), null);
  assert.equal(parseObject('{"a": '), null, "an unterminated object is not usable");
  assert.deepEqual(parseObject('[{"a": 1}]'), { a: 1 }, "an object wrapped in a list is unwrapped");
  assert.equal(parseObject("[1, 2, 3]"), null, "a list with no object in it is not usable");
});
