// End to end over the real corpus with the offline mocks: no key, no network.
// The oracle proves the harness can score a correct pack correct on every
// channel and every family; the null model proves abstain is not free points.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadQuestions, loadRetrievalParams } from "../src/corpus.js";
import { loadIndex } from "../src/index-io.js";
import { findModel } from "../src/models.js";
import { createModelFactory } from "../src/providers/index.js";
import { mockAnswer } from "../src/providers/mock.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { runItem, runParamsFor } from "../src/run.js";
import type { RunItemContext } from "../src/run.js";
import { FAMILIES } from "../src/types.js";

const version = "v1";
const questions = loadQuestions(version);
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
    params: runParamsFor(entry, loadRetrievalParams(version, RETRIEVAL_DEFAULTS)),
    modelFor: createModelFactory(entry).forItem,
  };
}

/** A cross-section rather than every question, so the suite stays fast. */
const sample = FAMILIES.flatMap((family) => questions.filter((question) => question.family === family).slice(0, 4));

test("the oracle scores every channel of every family correct", async () => {
  const context = contextFor("oracle");
  for (const question of sample) {
    const result = await runItem(context, question);
    assert.equal(result.error, null, `${question.id} errored: ${result.error}`);
    assert.equal(result.retries, 0, `${question.id} needed a retry`);
    assert.equal(result.scored.value.correct, true, `${question.id}: value`);
    assert.equal(result.scored.status.correct, true, `${question.id}: status`);
    assert.equal(result.scored.sources.correct, true, `${question.id}: sources`);
    if (result.scored.history.scored) assert.equal(result.scored.history.correct, true, `${question.id}: history`);
    assert.equal(result.scored.fully_correct, true, `${question.id} is not fully correct against its own gold pack`);
  }
});

test("the null model is right on abstain and wrong everywhere else", async () => {
  const context = contextFor("null");
  for (const question of sample) {
    const result = await runItem(context, question);
    assert.equal(result.error, null);
    const abstain = question.family === "abstain";
    assert.equal(result.scored.fully_correct, abstain, `${question.id} (${question.family})`);
    assert.equal(result.scored.value.correct, abstain, `${question.id}: value`);
  }
});

test("a run records the window, the prompt and the guarantee flag", async () => {
  const context = contextFor("oracle");
  const answered = questions.find((question) => question.family === "current");
  assert.ok(answered);
  const result = await runItem(context, answered);
  assert.equal(result.retrieved_chunk_ids.length, context.params.top_n);
  assert.ok(result.prompt.includes(answered.question));
  assert.ok(result.prompt.includes("EVIDENCE"));
  assert.ok(result.prompt.includes("ANSWER TYPE"));
  assert.equal(result.guarantee_met, true);

  const abstain = questions.find((question) => question.family === "abstain");
  assert.ok(abstain);
  const abstainResult = await runItem(context, abstain);
  assert.equal(abstainResult.guarantee_met, null, "a question with no gold sources has nothing to guarantee");
});

test("the evidence carries the document id the sources channel asks for", async () => {
  const context = contextFor("oracle");
  const question = questions.find((entry) => entry.gold.sources.length > 0);
  assert.ok(question);
  const result = await runItem(context, question);
  for (const source of question.gold.sources) {
    assert.ok(result.prompt.includes(`id=${source}`), `${source} is not citable from the prompt`);
  }
});

test("mockAnswer returns the gold pack for oracle and the abstain pack for null", () => {
  const question = questions[0];
  assert.ok(question);
  const { status, value, history, sources } = question.gold;
  assert.deepEqual(mockAnswer("oracle", question), { status, value, history, sources });
  assert.deepEqual(mockAnswer("null", question), { status: "not_in_evidence", value: null, history: [], sources: [] });
});
