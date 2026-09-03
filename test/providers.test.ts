// End to end over the real corpus with the offline mocks: no key, no network.
// The oracle proves the harness can score a correct answer correct on every
// axis; the null model proves the abstain axis is not free points.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadItems, loadRetrievalParams } from "../src/corpus.js";
import { fieldAxis } from "../src/fields.js";
import { loadIndex } from "../src/index-io.js";
import { findModel } from "../src/models.js";
import { parseObject } from "../src/parse.js";
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

function contextFor(name: string, forVersion = version): RunItemContext {
  const entry = findModel(name);
  const versionIndex = forVersion === version ? index : loadIndex(forVersion);
  return {
    retriever: forVersion === version ? retriever : new Retriever(versionIndex.chunks, versionIndex.chunkVectors),
    queryVectors: versionIndex.queryVectors,
    aliases: forVersion === version ? aliases : loadAliases(forVersion),
    entry,
    params: runParamsFor(entry, loadRetrievalParams(forVersion, RETRIEVAL_DEFAULTS)),
    modelFor: createModelFactory(entry).forItem,
  };
}

// A cross-section rather than every item, so the suite stays fast. Both corpus
// versions are covered: v1 items carry one axis each, v2 cases carry one per
// field, and the mocks have to behave the same way on both.
function sampleOf(corpusVersion: string, perAxis: number) {
  const all = loadItems(corpusVersion);
  const seen = new Map<string, number>();
  const picked = [];
  for (const item of all) {
    for (const field of item.schema.required) {
      const axis = fieldAxis(item, field);
      const count = seen.get(axis) ?? 0;
      if (count >= perAxis) continue;
      seen.set(axis, count + 1);
      picked.push(item);
      break;
    }
  }
  return picked;
}

for (const corpusVersion of ["v1", "v2"]) {
  const sample = sampleOf(corpusVersion, 6);

  test(`the oracle model scores 100% on every field of every axis on ${corpusVersion}`, async () => {
    const context = contextFor("oracle", corpusVersion);
    for (const item of sample) {
      const result = await runItem(context, item);
      assert.equal(result.error, null, `${item.id} errored: ${result.error}`);
      assert.equal(result.retries, 0, `${item.id} needed a retry`);
      assert.equal(result.correct, true, `${item.id} scored incorrect against its own gold object`);
      for (const field of result.fields) {
        assert.equal(field.correct, true, `${item.id}.${field.field} (${field.axis}) is wrong for the gold answer`);
      }
    }
  });

  test(`the null model is right only on abstain fields on ${corpusVersion}`, async () => {
    const context = contextFor("null", corpusVersion);
    for (const item of sample) {
      const result = await runItem(context, item);
      assert.equal(result.error, null);
      for (const field of result.fields) {
        assert.equal(
          field.correct,
          field.axis === "abstain",
          `${item.id}.${field.field} (${field.axis}) should be ${field.axis === "abstain" ? "correct" : "incorrect"} for a null answer`,
        );
      }
    }
  });
}

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
