// The report: what the leaderboard says, and that the CSV can reproduce it.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { paramsHash } from "../src/hash.js";
import { groupRuns, injectLeaderboard, leaderboardMarkers, renderLeaderboard, summarize } from "../src/report/leaderboard.js";
import { CSV_COLUMNS, toCsv } from "../src/report/rows.js";
import type { RunBundle } from "../src/report/rows.js";
import type { Family, ItemResult, RunMeta, Scored, Trap } from "../src/types.js";

const params = { top_n: 16, rrf_k: 60, recency_weight: 0.1, max_chunks_per_doc: 2, temperature: 0, max_tokens: 320 };

function meta(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    run_id: "20270101-000000-test",
    model_name: "test-model",
    provider: "mock",
    model_id: "test",
    params,
    corpus_version: "v1",
    pipeline_hash: "pipeline",
    prompt_hash: "prompt",
    params_hash: paramsHash(params),
    git_commit: null,
    started_at: "2027-01-01T00:00:00.000Z",
    finished_at: "2027-01-01T00:01:00.000Z",
    item_count: 2,
    run_index: 1,
    packs_fully_correct_at_run: 1,
    pack_accuracy_at_run: 0.5,
    projected_cost_usd: 1,
    actual_cost_usd: 1,
    tokens_in: 10,
    tokens_out: 10,
    tokens_reasoning: 0,
    tokens_cached: 0,
    errors: 0,
    retries: 0,
    ...overrides,
  };
}

function scored(correct: boolean, history: boolean): Scored {
  const channel = { scored: true, correct };
  return {
    value: channel,
    status: channel,
    history: history ? channel : { scored: false, correct: false },
    sources: channel,
    sources_recall: correct ? 1 : 0,
    fully_correct: correct,
  };
}

function item(id: string, family: Family, traps: Trap[], correct: boolean, history = false): ItemResult {
  return {
    item_id: id,
    family,
    traps,
    question: `question ${id}`,
    answer_type: "number",
    retrieved_chunk_ids: ["c#0"],
    retrieved_doc_ids: ["d"],
    guarantee_met: true,
    prompt: "EVIDENCE",
    raw_output: "{}",
    parsed: { status: "answered", value: 1, history: [], sources: ["d"] },
    gold: { status: "answered", value: 1, history: [], history_scored: history, sources: ["d"] },
    scored: scored(correct, history),
    latency_ms: 100,
    ttft_ms: 50,
    tokens_in: 5,
    tokens_out: 5,
    tokens_reasoning: 0,
    tokens_cached: 0,
    cost_usd: 0.5,
    retries: 0,
    finish_reason: "stop",
    error: null,
  };
}

const bundle = (overrides: Partial<RunMeta>, items: ItemResult[]): RunBundle => ({ meta: meta(overrides), items });

test("the macro average weighs every family the same", () => {
  // Nine right out of ten in one family, none right in another: 50 percent macro.
  const items = [
    ...Array.from({ length: 9 }, (_, i) => item(`a${i}`, "lookup", [], true)),
    item("a9", "lookup", [], false),
    item("b0", "abstain", [], false),
  ];
  const summary = summarize(bundle({}, items));
  assert.equal(summary.perFamily.lookup.accuracy, 0.9);
  assert.equal(summary.perFamily.abstain.accuracy, 0);
  assert.equal(summary.macroValue, 0.45, "the mean over the two families that have questions");
  assert.equal(summary.packsFullyCorrect, 9 / 11);
});

test("trap resistance counts the questions carrying that trap", () => {
  const summary = summarize(
    bundle({}, [
      item("a", "lookup", ["superseded"], true),
      item("b", "lookup", ["superseded", "unit"], false),
      item("c", "lookup", [], true),
    ]),
  );
  assert.deepEqual(summary.perTrap.superseded, { accuracy: 0.5, n: 2 });
  assert.deepEqual(summary.perTrap.unit, { accuracy: 0, n: 1 });
  assert.deepEqual(summary.perTrap.keyword, { accuracy: 0, n: 0 });
});

test("the history channel is only counted where the gold declares a chain", () => {
  const summary = summarize(bundle({}, [item("a", "current", [], true, true), item("b", "lookup", [], false)]));
  assert.deepEqual(summary.history, { accuracy: 1, n: 1 });
  assert.deepEqual(summary.value, { accuracy: 0.5, n: 2 });
});

test("several runs of one model on the same parameters are one row with a spread", () => {
  const rows = groupRuns([
    bundle({ run_id: "r1", run_index: 1 }, [item("a", "lookup", [], true), item("b", "abstain", [], true)]),
    bundle({ run_id: "r2", run_index: 2 }, [item("a", "lookup", [], false), item("b", "abstain", [], true)]),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.runs.length, 2);
  const block = renderLeaderboard(
    [
      bundle({ run_id: "r1", run_index: 1 }, [item("a", "lookup", [], true), item("b", "abstain", [], true)]),
      bundle({ run_id: "r2", run_index: 2 }, [item("a", "lookup", [], false), item("b", "abstain", [], true)]),
    ],
    "scorer",
  );
  assert.ok(block.includes("| test-model | 2 |"), "the row says how many runs it covers");
  assert.ok(/75\.0% \(50\.0–100\.0\)/.test(block), "the headline cell carries the mean and the spread");
});

test("two runs made with different retrieval parameters are two groups", () => {
  const other = { ...params, top_n: 32 };
  const block = renderLeaderboard(
    [
      bundle({ run_id: "r1" }, [item("a", "lookup", [], true)]),
      bundle({ run_id: "r2", model_name: "other-model", params: other, params_hash: paramsHash(other) }, [item("a", "lookup", [], true)]),
    ],
    "scorer",
  );
  assert.ok(block.includes("top_n 16"), "the first group names its parameters");
  assert.ok(block.includes("top_n 32"), "the second group names its parameters");
});

test("the CSV carries one row per question with every channel verdict", () => {
  const csv = toCsv([bundle({}, [item("a", "current", ["superseded"], true, true), item("b", "abstain", [], false)])]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], CSV_COLUMNS.join(","));
  assert.equal(lines.length, 3);
  const first = lines[1]?.split(",") ?? [];
  assert.equal(first[CSV_COLUMNS.indexOf("family")], "current");
  assert.equal(first[CSV_COLUMNS.indexOf("traps")], "superseded");
  assert.equal(first[CSV_COLUMNS.indexOf("value_correct")], "true");
  assert.equal(first[CSV_COLUMNS.indexOf("history_scored")], "true");
  assert.equal(first[CSV_COLUMNS.indexOf("fully_correct")], "true");
  const second = lines[2]?.split(",") ?? [];
  assert.equal(second[CSV_COLUMNS.indexOf("history_correct")], "", "an unscored history channel has no verdict");
});

test("the leaderboard is injected between the markers and nowhere else", () => {
  const markers = leaderboardMarkers("v1");
  const readme = `intro\n${markers.start}\nold\n${markers.end}\noutro`;
  const injected = injectLeaderboard(readme, "new block", "v1");
  assert.ok(injected.includes("new block"));
  assert.ok(!injected.includes("old"));
  assert.ok(injected.startsWith("intro"));
  assert.ok(injected.endsWith("outro"));
  assert.throws(() => injectLeaderboard("no markers here", "x", "v1"), /marker/);
});

test("an empty set of runs says so rather than rendering an empty table", () => {
  assert.match(renderLeaderboard([], "scorer"), /No runs yet/);
});
