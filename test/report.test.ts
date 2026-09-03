import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  LEADERBOARD_END,
  LEADERBOARD_START,
  injectLeaderboard,
  renderLeaderboard,
  retrievalHitRate,
  summarize,
} from "../src/report/leaderboard.js";
import { CSV_COLUMNS, toCsv } from "../src/report/rows.js";
import type { RunBundle } from "../src/report/rows.js";
import type { Axis, ItemResult, RunMeta } from "../src/types.js";

function item(id: string, axis: Axis, correct: boolean, overrides: Partial<ItemResult> = {}): ItemResult {
  return {
    item_id: id,
    axis,
    question: `question ${id}`,
    retrieved_chunk_ids: ["d1#0"],
    retrieved_doc_ids: ["d1"],
    retrieval_hit: axis === "abstain" ? null : true,
    prompt: "EVIDENCE\n...",
    raw_output: '{"value": 1}',
    parsed: { value: 1 },
    expected: { value: 1 },
    fields: [{ field: "value", expected: 1, got: correct ? 1 : 2, correct }],
    correct,
    latency_ms: 100,
    ttft_ms: 40,
    tokens_in: 800,
    tokens_out: 20,
    tokens_cached: 0,
    cost_usd: 0.001,
    retries: 0,
    finish_reason: "stop",
    error: null,
    ...overrides,
  };
}

const meta: RunMeta = {
  run_id: "20260903-1200-fixture",
  model_name: "fixture",
  provider: "mock",
  model_id: "fixture",
  params: { top_n: 8, rrf_k: 60, recency_weight: 0.1, max_chunks_per_doc: 2, temperature: 0, max_tokens: 512 },
  corpus_version: "v1",
  pipeline_hash: "abc123",
  prompt_hash: "def456",
  git_commit: null,
  started_at: "2026-09-03T12:00:00.000Z",
  finished_at: "2026-09-03T12:05:00.000Z",
  item_count: 4,
  correct_count: 3,
  accuracy: 0.75,
  retrieval_hit_rate: 1,
  projected_cost_usd: 0.01,
  actual_cost_usd: 0.004,
  tokens_in: 3200,
  tokens_out: 80,
  tokens_cached: 0,
  errors: 0,
  retries: 0,
};

const bundle: RunBundle = {
  meta,
  items: [
    item("v1-ent-001", "entities", true),
    item("v1-fac-001", "facts", true),
    item("v1-sup-001", "supersession", false, { retrieval_hit: false }),
    item("v1-abs-001", "abstain", true),
  ],
};

test("the CSV has one row per item plus a header, in the declared column order", () => {
  const csv = toCsv([bundle]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], CSV_COLUMNS.join(","));
  assert.equal(lines.length, 5);
  assert.ok(lines[1]?.startsWith("20260903-1200-fixture,fixture,mock,fixture,v1,abc123,def456,v1-ent-001,entities,true,true,"));
});

test("the CSV carries compact expected and got objects, not prompts or raw output", () => {
  const csv = toCsv([bundle]);
  assert.ok(csv.includes('"{""value"":1}"'));
  assert.ok(!csv.includes("EVIDENCE"));
});

test("an empty retrieval hit flag is written as an empty cell", () => {
  const row = toCsv([bundle]).trim().split("\n")[4] ?? "";
  assert.ok(row.includes(",abstain,,true,"), `abstain row was ${row}`);
});

test("summarize computes overall, per-axis and conditioned accuracy", () => {
  const summary = summarize(bundle);
  assert.equal(summary.n, 4);
  assert.equal(summary.accuracy, 0.75);
  assert.equal(summary.perAxis.entities.accuracy, 1);
  assert.equal(summary.perAxis.supersession.accuracy, 0);
  assert.equal(summary.perAxis.supersession.n, 1);
  assert.equal(summary.accuracyGivenHit, 1, "the only miss is also the only retrieval miss");
  assert.equal(summary.hitItems, 2);
});

test("the retrieval hit rate excludes items with no gold documents", () => {
  const rate = retrievalHitRate([bundle]);
  assert.equal(rate.scored, 3);
  assert.equal(rate.total, 4);
  assert.ok(Math.abs((rate.rate ?? 0) - 2 / 3) < 1e-12);
});

test("the leaderboard renders a markdown table naming the model and the hashes", () => {
  const block = renderLeaderboard([bundle]);
  assert.ok(block.includes("| model | items | overall |"));
  assert.ok(block.includes("| fixture | 4 | 75.0% |"), block);
  assert.ok(block.includes("100.0% (n=1)"), "per-axis cells carry their own n");
  assert.ok(block.includes("abc123"));
  assert.ok(block.includes("def456"));
  assert.ok(block.includes("Retrieval hit rate"));
});

test("an empty leaderboard says so instead of rendering an empty table", () => {
  assert.ok(renderLeaderboard([]).includes("No runs yet"));
});

test("injection replaces only what is between the markers", () => {
  const readme = `# Title\n\n${LEADERBOARD_START}\nold table\n${LEADERBOARD_END}\n\n## Next section\n`;
  const updated = injectLeaderboard(readme, "new table");
  assert.ok(updated.includes("new table"));
  assert.ok(!updated.includes("old table"));
  assert.ok(updated.startsWith("# Title"));
  assert.ok(updated.includes("## Next section"));
  assert.equal(injectLeaderboard(updated, "third table").split(LEADERBOARD_START).length, 2, "injection is idempotent");
});

test("injection refuses a README without the markers", () => {
  assert.throws(() => injectLeaderboard("# Title\n", "table"), /marker comments/);
});
