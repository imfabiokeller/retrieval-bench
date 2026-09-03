import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  injectLeaderboard,
  leaderboardMarkers,
  renderLeaderboard,
  retrievalFullRate,
  retrievalHitRate,
  retrievalParamsHash,
  summarize,
  twinGap,
} from "../src/report/leaderboard.js";
import { CSV_COLUMNS, toCsv } from "../src/report/rows.js";
import type { RunBundle } from "../src/report/rows.js";
import type { Axis, FieldResult, ItemResult, RunMeta } from "../src/types.js";

function field(
  name: string,
  axis: Axis,
  correct: boolean,
  hit: boolean | null = true,
  full: boolean | null = hit,
): FieldResult {
  return { field: name, axis, expected: 1, got: correct ? 1 : 2, correct, retrieval_hit: hit, retrieval_full: full };
}

function item(id: string, axis: Axis, fields: FieldResult[], overrides: Partial<ItemResult> = {}): ItemResult {
  return {
    item_id: id,
    axis,
    twin_of: null,
    question: `question ${id}`,
    retrieved_chunk_ids: ["d1#0"],
    retrieved_doc_ids: ["d1"],
    retrieval_hit: fields.some((entry) => entry.retrieval_hit === true),
    prompt: "EVIDENCE\n...",
    raw_output: '{"value": 1}',
    parsed: { value: 1 },
    expected: { value: 1 },
    fields,
    correct: fields.every((entry) => entry.correct),
    latency_ms: 100,
    ttft_ms: 40,
    tokens_in: 800,
    tokens_out: 20,
    tokens_reasoning: 5,
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
  correct_count_at_run: 3,
  accuracy_at_run: 0.75,
  retrieval_hit_rate: 1,
  projected_cost_usd: 0.01,
  actual_cost_usd: 0.004,
  tokens_in: 3200,
  tokens_out: 80,
  tokens_reasoning: 20,
  tokens_cached: 0,
  errors: 0,
  retries: 0,
};

// Four single-field items, the shape a v1 run has.
const bundle: RunBundle = {
  meta,
  items: [
    item("v1-ent-001", "entities", [field("value", "entities", true)]),
    item("v1-fac-001", "facts", [field("value", "facts", true)]),
    item("v1-sup-001", "supersession", [field("value", "supersession", false, false)], { retrieval_hit: false }),
    item("v1-abs-001", "abstain", [field("value", "abstain", true, null)], { retrieval_hit: null }),
  ],
};

// One case whose three fields sit on three axes, plus a twin of its hardest one.
const caseBundle: RunBundle = {
  meta: { ...meta, corpus_version: "v2", item_count: 2 },
  items: [
    item("v2-case-001", "asof", [
      field("p99_ms", "asof", false),
      field("owner", "join", true),
      field("credits_eur", "abstain", true, null),
    ]),
    item("v2-twin-001", "asof", [field("p99_ms", "asof", true)], { twin_of: "v2-case-001" }),
  ],
};

test("the CSV has one row per field plus a header, in the declared column order", () => {
  const csv = toCsv([bundle]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], CSV_COLUMNS.join(","));
  assert.equal(lines.length, 5, "four single-field items are four rows");
  assert.ok(
    lines[1]?.startsWith(
      `20260903-1200-fixture,fixture,mock,fixture,v1,abc123,def456,${retrievalParamsHash(meta.params)},8,` +
        "v1-ent-001,entities,,0,value,entities,true,true,true,",
    ),
    lines[1],
  );
  assert.equal(toCsv([caseBundle]).trim().split("\n").length, 5, "a three-field case and a twin are four rows");
});

test("a field row carries its own axis, both retrieval flags, expected and got value", () => {
  const rows = toCsv([caseBundle]).trim().split("\n");
  assert.ok(rows[1]?.includes(",0,p99_ms,asof,false,true,true,1,2,"), rows[1]);
  assert.ok(rows[2]?.includes(",1,owner,join,true,true,true,1,1,"), rows[2]);
  assert.ok(rows[3]?.includes(",2,credits_eur,abstain,true,,,1,1,"), "an abstain field has neither flag");
  assert.ok(toCsv([bundle]).split("\n")[0]?.includes("field_retrieval_hit,field_retrieval_full"));
  assert.ok(toCsv([bundle]).split("\n")[0]?.includes("params_hash,top_n"));
});

test("the CSV carries no prompts and no raw output", () => {
  assert.ok(!toCsv([bundle]).includes("EVIDENCE"));
});

test("reasoning tokens are totalled per run and shown as their own column", () => {
  assert.equal(summarize(bundle).tokensReasoning, 20, "four items at five reasoning tokens each");
  const block = renderLeaderboard([bundle], "sco789");
  assert.ok(block.includes("| tokens out | tokens reasoning |"), block);
  assert.ok(toCsv([bundle]).split("\n")[0]?.includes("tokens_out,tokens_reasoning,tokens_cached"));
});

test("summarize counts fields, not items, and keeps the case number beside them", () => {
  const summary = summarize(bundle);
  assert.equal(summary.n, 4, "four scored fields");
  assert.equal(summary.cases, 4);
  assert.equal(summary.accuracy, 0.75);
  assert.equal(summary.caseAccuracy, 0.75);
  assert.equal(summary.perAxis.entities.accuracy, 1);
  assert.equal(summary.perAxis.supersession.accuracy, 0);
  assert.equal(summary.perAxis.supersession.n, 1);
  assert.equal(summary.accuracyGivenHit, 1, "the only miss is also the only retrieval miss");
  assert.equal(summary.hitFields, 2);
});

test("a case counts once as a case and once per field on its own axis", () => {
  const summary = summarize(caseBundle);
  assert.equal(summary.cases, 2);
  assert.equal(summary.n, 4);
  assert.equal(summary.caseAccuracy, 0.5, "the case has a wrong field, the twin does not");
  assert.equal(summary.accuracy, 0.75);
  assert.equal(summary.perAxis.asof.n, 2, "the case field and its twin");
  assert.equal(summary.perAxis.asof.accuracy, 0.5);
  assert.equal(summary.perAxis.join.n, 1);
  assert.equal(summary.perAxis.abstain.n, 1);
});

test("the twin gap compares one field asked alone with the same field inside its case", () => {
  const gap = twinGap(caseBundle.items);
  assert.ok(gap);
  assert.equal(gap.n, 1);
  assert.equal(gap.twinAccuracy, 1);
  assert.equal(gap.caseAccuracy, 0);
  assert.equal(gap.gap, 1);
  assert.equal(twinGap(bundle.items), null, "a run with no twins has no gap");
  assert.ok(renderLeaderboard([caseBundle], "sco789").includes("Twin gap"));
  assert.ok(!renderLeaderboard([bundle], "sco789").includes("Twin gap"));
});

test("the retrieval hit rate counts fields and breaks down per axis", () => {
  const rate = retrievalHitRate([bundle]);
  assert.equal(rate.scored, 3, "the abstain field has no gold documents");
  assert.equal(rate.total, 4);
  assert.ok(Math.abs((rate.rate ?? 0) - 2 / 3) < 1e-12);
  assert.equal(rate.perAxis.entities?.accuracy, 1);
  assert.equal(rate.perAxis.supersession?.accuracy, 0);
  assert.equal(rate.perAxis.abstain, undefined);
});

test("the leaderboard renders both tables, naming the model, the hashes and the parameters", () => {
  const block = renderLeaderboard([bundle], "sco789");
  assert.ok(block.includes("| model | params | fields | overall |"), block);
  assert.ok(block.includes("| model | fields with full retrieval | given full retrieval |"), block);
  assert.ok(block.includes(`| fixture | \`${retrievalParamsHash(meta.params)}\` | 4 | 75.0% |`), block);
  assert.ok(block.includes("100.0% (n=1)"), "per-axis cells carry their own n");
  assert.ok(block.includes("| cases | case fully correct |"));
  assert.ok(block.includes("abc123"));
  assert.ok(block.includes("def456"));
  assert.ok(block.includes("Retrieval hit rate for these parameters"));
  assert.ok(block.includes("Full-retrieval rate for these parameters"));
});

test("the full-retrieval rate is stricter than the any-document hit rate", () => {
  // One join field whose two gold documents were half retrieved: a hit, not full.
  const halfJoin: RunBundle = {
    meta: { ...meta, corpus_version: "v2" },
    items: [item("v2-case-001", "join", [field("owner", "join", false, true, false)])],
  };
  assert.equal(retrievalHitRate([halfJoin]).rate, 1, "the any-document flag calls it a hit");
  assert.equal(retrievalFullRate([halfJoin]).rate, 0, "the full flag does not");
  assert.equal(summarize(halfJoin).hitFields, 1);
  assert.equal(summarize(halfJoin).fullFields, 0);
  assert.equal(summarize(halfJoin).accuracyGivenFull, null, "no field had all its evidence, so there is no reading number");
  assert.equal(summarize(halfJoin).accuracyGivenHit, 0);
});

test("accuracy given full retrieval is the reading number, per axis", () => {
  const summary = summarize({
    meta: { ...meta, corpus_version: "v2" },
    items: [
      item("v2-case-001", "join", [
        field("a", "join", true, true, true),
        field("b", "join", false, true, false),
        field("c", "join", false, true, false),
      ]),
    ],
  });
  assert.equal(summary.accuracy, 1 / 3, "one of three fields is right");
  assert.equal(summary.accuracyGivenFull, 1, "the only field that had all its evidence was right");
  assert.equal(summary.perAxis.join.n, 3);
  assert.equal(summary.perAxisGivenFull.join.n, 1);
  assert.equal(summary.perAxisGivenFull.join.accuracy, 1);
});

test("runs made with different retrieval parameters are grouped, not stacked in one table", () => {
  const wide: RunBundle = {
    meta: { ...meta, run_id: "20260903-1300-fixture", params: { ...meta.params, top_n: 32 } },
    items: bundle.items,
  };
  const block = renderLeaderboard([bundle, wide], "sco789");
  const narrowHash = retrievalParamsHash(meta.params);
  const wideHash = retrievalParamsHash(wide.meta.params);
  assert.notEqual(narrowHash, wideHash);
  assert.ok(block.includes(`### Retrieval parameters \`${narrowHash}\`: top_n 8, rrf_k 60, recency_weight 0.1, max_chunks_per_doc 2`), block);
  assert.ok(block.includes(`### Retrieval parameters \`${wideHash}\`: top_n 32,`), block);
  assert.equal(block.split("| model | params | fields | overall |").length, 3, "one overall table per parameter group");
  assert.ok(block.includes(`(params \`${wideHash}\`)`), "the notes say which read arm each row used");
  assert.ok(!renderLeaderboard([bundle], "sco789").includes("### Retrieval parameters"), "one group needs no heading");
});

test("an axis no run covered is left out of the table", () => {
  const block = renderLeaderboard([bundle], "sco789");
  assert.ok(!block.includes(" | aggregation | "), "v1 covers five axes and shows five columns");
  assert.ok(renderLeaderboard([caseBundle], "sco789").includes(" | join | "));
});

test("an empty leaderboard says so instead of rendering an empty table", () => {
  assert.ok(renderLeaderboard([], "sco789").includes("No runs yet"));
});

test("injection replaces only what is between that version's markers", () => {
  const v1 = leaderboardMarkers("v1");
  const v2 = leaderboardMarkers("v2");
  const readme = `# Title\n\n${v1.start}\nold v1\n${v1.end}\n\n${v2.start}\nold v2\n${v2.end}\n`;
  const updated = injectLeaderboard(readme, "new v1", "v1");
  assert.ok(updated.includes("new v1"));
  assert.ok(!updated.includes("old v1"));
  assert.ok(updated.includes("old v2"), "the other version's table is untouched");
  assert.equal(injectLeaderboard(updated, "third v1", "v1").split(v1.start).length, 2, "injection is idempotent");
});

test("injection refuses a README without that version's markers", () => {
  assert.throws(() => injectLeaderboard("# Title\n", "table", "v2"), /LEADERBOARD:v2:START/);
});
