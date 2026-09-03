// Re-scoring at report time. items.jsonl stores the raw model reply, so a fix to
// the parser, the normalizer, the scorer or the alias table has to reach every
// run that has ever been made, without paying for it again.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadItems } from "../src/corpus.js";
import { PIPELINE_SOURCES, SCORER_SOURCES, pipelineHash, scorerHash } from "../src/hash.js";
import { renderLeaderboard } from "../src/report/leaderboard.js";
import { accuracyOf, rescoreItems } from "../src/report/rescore.js";
import type { RunBundle } from "../src/report/rows.js";
import type { Item, ItemResult, RunMeta } from "../src/types.js";

const version = "v1";
const aliases = loadAliases(version);
const corpus = new Map<string, Item>(loadItems(version).map((item) => [item.id, item]));

/** A run as it would have been written before the alias and time fixes landed. */
function stored(overrides: Partial<ItemResult>): ItemResult {
  return {
    item_id: "v1-fac-020",
    axis: "facts",
    question: "Which object lock mode does the audit trail use?",
    retrieved_chunk_ids: ["PAL-103-c1#0"],
    retrieved_doc_ids: ["PAL-103-c1"],
    retrieval_hit: true,
    prompt: "EVIDENCE\n...",
    raw_output: '{"mode":"compliance mode"}',
    parsed: { mode: "compliance mode" },
    expected: { mode: "compliance" },
    fields: [{ field: "mode", axis: "facts", expected: "compliance", got: "compliance mode", correct: false, retrieval_hit: true }],
    correct: false,
    latency_ms: 1200,
    ttft_ms: 400,
    tokens_in: 800,
    tokens_out: 12,
    tokens_reasoning: 0,
    tokens_cached: 0,
    cost_usd: 0.0004,
    retries: 0,
    finish_reason: "stop",
    error: null,
    ...overrides,
  };
}

test("a stored reply is re-parsed and re-scored with the current alias table", () => {
  const result = rescoreItems([stored({})], corpus, aliases);
  assert.equal(result.changed, 1, "the item flipped under the current scorer");
  assert.equal(result.items[0]?.correct, true);
  assert.equal(result.items[0]?.fields[0]?.correct, true);
  assert.equal(accuracyOf(result.items), 1);
});

test("a stored reply that is still wrong stays wrong", () => {
  const wrong = stored({ raw_output: '{"mode":"governance mode"}', parsed: { mode: "governance mode" } });
  const result = rescoreItems([wrong], corpus, aliases);
  assert.equal(result.changed, 0);
  assert.equal(result.items[0]?.correct, false);
});

test("a time answer stored with its zone word scores under the time type", () => {
  const timed = stored({
    item_id: "v1-fac-007",
    axis: "facts",
    raw_output: '{"start_utc":"09:41 UTC"}',
    parsed: { start_utc: "09:41 UTC" },
    expected: { start_utc: "09:41" },
    fields: [{ field: "start_utc", axis: "facts", expected: "09:41", got: "09:41 utc", correct: false, retrieval_hit: true }],
    correct: false,
  });
  const result = rescoreItems([timed], corpus, aliases);
  assert.equal(result.items[0]?.correct, true);
  assert.equal(result.items[0]?.fields[0]?.got, "09:41", "the re-scored value is the normalized clock time");
});

test("the expected object comes from the corpus, not from what the run stored", () => {
  const staleGold = stored({ expected: { mode: "governance" } });
  const result = rescoreItems([staleGold], corpus, aliases);
  assert.deepEqual(result.items[0]?.expected, corpus.get("v1-fac-020")?.expected);
});

test("a call that errored is scored as unparsed, whatever text it left behind", () => {
  const errored = stored({ raw_output: '{"mode":"compliance"}', error: "connection reset", parsed: null, correct: false });
  const result = rescoreItems([errored], corpus, aliases);
  assert.equal(result.items[0]?.parsed, null);
  assert.equal(result.items[0]?.correct, false);
});

test("an item the corpus no longer holds keeps its stored score and is reported", () => {
  const gone = stored({ item_id: "v1-fac-999" });
  const result = rescoreItems([gone], corpus, aliases);
  assert.deepEqual(result.unknown, ["v1-fac-999"]);
  assert.equal(result.items[0], gone, "the stored row is passed through untouched");
  assert.equal(result.changed, 0);
});

test("an empty reply is unparseable and stays incorrect", () => {
  const empty = stored({ raw_output: "", parsed: null, finish_reason: "length" });
  const result = rescoreItems([empty], corpus, aliases);
  assert.equal(result.items[0]?.parsed, null);
  assert.equal(result.items[0]?.correct, false);
});

test("pipeline_hash covers retrieval only and scorer_hash covers scoring only", () => {
  assert.deepEqual(PIPELINE_SOURCES, ["src/bm25.ts", "src/chunk.ts", "src/retrieve.ts", "src/rrf.ts"]);
  assert.deepEqual(SCORER_SOURCES, ["src/parse.ts", "src/normalize.ts", "src/score.ts", "src/fields.ts"]);
  const overlap = PIPELINE_SOURCES.filter((source) => SCORER_SOURCES.includes(source));
  assert.deepEqual(overlap, [], "a file belongs to one fingerprint or the other, never both");
  assert.match(pipelineHash(), /^[0-9a-f]{16}$/);
  assert.match(scorerHash(version), /^[0-9a-f]{16}$/);
  assert.notEqual(pipelineHash(), scorerHash(version));
});

test("scorer_hash includes the alias table of its corpus version", () => {
  assert.throws(() => scorerHash("v-does-not-exist"), /aliases\.json/);
});

const meta: RunMeta = {
  run_id: "20260903-1200-fixture",
  model_name: "fixture",
  provider: "mock",
  model_id: "fixture",
  params: { top_n: 8, rrf_k: 60, recency_weight: 0.1, max_chunks_per_doc: 2, temperature: 0, max_tokens: 512 },
  corpus_version: version,
  pipeline_hash: "abc123",
  prompt_hash: "def456",
  git_commit: null,
  started_at: "2026-09-03T12:00:00.000Z",
  finished_at: "2026-09-03T12:05:00.000Z",
  item_count: 1,
  correct_count_at_run: 0,
  accuracy_at_run: 0,
  retrieval_hit_rate: 1,
  projected_cost_usd: 0.01,
  actual_cost_usd: 0.0004,
  tokens_in: 800,
  tokens_out: 12,
  tokens_reasoning: 0,
  tokens_cached: 0,
  errors: 0,
  retries: 0,
};

test("the leaderboard names the scorer hash and the runs whose score moved", () => {
  const bundle: RunBundle = { meta, items: rescoreItems([stored({})], corpus, aliases).items };
  const block = renderLeaderboard([bundle], "sco12345678");
  assert.ok(block.includes("sco12345678"), "the scorer hash belongs in the header");
  assert.ok(block.includes("re-scored at report time"), block);
  assert.ok(block.includes("0.0% at run time, 100.0% now"), block);
});

test("the leaderboard says nothing about drift when there is none", () => {
  const items = rescoreItems([stored({})], corpus, aliases).items;
  const bundle: RunBundle = { meta: { ...meta, accuracy_at_run: 1, correct_count_at_run: 1 }, items };
  assert.ok(!renderLeaderboard([bundle], "sco12345678").includes("at run time"));
});
