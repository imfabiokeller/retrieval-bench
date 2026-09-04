// Re-scoring. items.jsonl keeps the raw reply, so a scoring fix reaches every
// run that has ever been made without a paid re-run.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadQuestions } from "../src/corpus.js";
import { packAccuracyOf, rescoreItems } from "../src/report/rescore.js";
import type { ItemResult, Question } from "../src/types.js";

const aliases = loadAliases("v1");
const corpusQuestions = loadQuestions("v1");

const question: Question = {
  id: "q-x",
  family: "current",
  question: "What is the p99 latency budget now, in ms?",
  answer_type: "number",
  traps: ["superseded"],
  gold: {
    status: "answered",
    value: 150,
    history: [
      { value: 190, from: "2027-01-12" },
      { value: 165, from: "2027-03-24" },
      { value: 150, from: "2027-05-04" },
    ],
    history_scored: true,
    sources: ["a", "b", "c"],
  },
  notes: "",
};

function stored(raw: string, overrides: Partial<ItemResult> = {}): ItemResult {
  return {
    item_id: "q-x",
    family: "lookup",
    traps: [],
    question: "stale question text",
    served_model_id: null,
    answer_type: "string",
    retrieved_chunk_ids: ["a#0"],
    retrieved_doc_ids: ["a", "b", "c"],
    guarantee_met: false,
    prompt: "EVIDENCE",
    raw_output: raw,
    parsed: null,
    gold: { status: "answered", value: 999, history: [], history_scored: false, sources: [] },
    scored: {
      value: { scored: true, correct: false },
      status: { scored: true, correct: false },
      history: { scored: false, correct: false },
      sources: { scored: true, correct: false },
      sources_recall: 0,
      fully_correct: false,
    },
    latency_ms: 1,
    ttft_ms: 1,
    tokens_in: 1,
    tokens_out: 1,
    tokens_reasoning: 0,
    tokens_cached: 0,
    cost_usd: 0,
    retries: 0,
    finish_reason: "stop",
    error: null,
    ...overrides,
  };
}

const corpus = new Map<string, Question>([[question.id, question]]);

const rightAnswer = JSON.stringify({
  status: "answered",
  value: 150,
  history: question.gold.history,
  sources: ["a", "b", "c"],
});

test("a stored reply is re-scored against the corpus, not against what the run recorded", () => {
  const result = rescoreItems([stored(rightAnswer)], corpus, aliases);
  const item = result.items[0];
  assert.ok(item);
  assert.equal(item.scored.fully_correct, true);
  assert.equal(item.family, "current", "the family comes from the corpus");
  assert.deepEqual(item.traps, ["superseded"]);
  assert.deepEqual(item.gold, question.gold);
  assert.equal(item.guarantee_met, true, "the guarantee flag is recomputed from the stored window");
  assert.equal(result.changed, 1);
  assert.equal(packAccuracyOf(result.items), 1);
});

test("a call that errored has no answer to parse, whatever text it left behind", () => {
  const result = rescoreItems([stored(rightAnswer, { error: "timeout" })], corpus, aliases);
  assert.equal(result.items[0]?.parsed, null);
  assert.equal(result.items[0]?.scored.fully_correct, false);
});

test("a question the corpus no longer holds keeps its stored score and is reported", () => {
  const result = rescoreItems([stored(rightAnswer, { item_id: "q-gone" })], corpus, aliases);
  assert.deepEqual(result.unknown, ["q-gone"]);
  assert.equal(result.items[0]?.scored.fully_correct, false);
});

test("re-scoring the real corpus with its own gold packs is a perfect run", () => {
  const map = new Map(corpusQuestions.map((entry) => [entry.id, entry]));
  const items = corpusQuestions.slice(0, 40).map((entry) =>
    stored(JSON.stringify({ status: entry.gold.status, value: entry.gold.value, history: entry.gold.history, sources: entry.gold.sources }), {
      item_id: entry.id,
      retrieved_doc_ids: entry.gold.sources,
    }),
  );
  const result = rescoreItems(items, map, aliases);
  assert.equal(packAccuracyOf(result.items), 1);
});
