// LEADERBOARD.md, generated from the run bundles. Nothing here is written by
// hand, and the same function produces the block that is injected into README.md
// between the marker comments.
//
// The unit is the question. One question is one pack, and a pack is scored on
// four channels, so there are two headline numbers and no single accuracy:
//
//   macro value accuracy   the mean of value accuracy over the ten families, so
//                          each family weighs the same and a saturated family
//                          cannot carry the score
//   packs fully correct    the share of questions where every scored channel was
//                          correct
//
// Beside them: one column per family, one per channel, one per trap kind, then
// retries, latency, time to first token, tokens and cost.
//
// A model with more than one run on the same corpus version and the same
// retrieval parameters is one row: the cells show the mean and the min to max
// spread of its runs, and the row says how many there were.

import { paramsHash, paramsLabel } from "../hash.js";
import { FAMILIES, TRAPS } from "../types.js";
import type { Family, ItemResult, RetrievalParams, Trap } from "../types.js";
import type { RunBundle } from "./rows.js";

/**
 * One marker pair per corpus version, because the README carries one table per
 * version and two versions are never comparable: different corpus, different
 * index, different retrieval parameters.
 */
export function leaderboardMarkers(version: string): { start: string; end: string } {
  return { start: `<!-- LEADERBOARD:${version}:START -->`, end: `<!-- LEADERBOARD:${version}:END -->` };
}

export interface Rate {
  accuracy: number;
  n: number;
}

export interface RunSummary {
  runId: string;
  runIndex: number;
  model: string;
  provider: string;
  questions: number;
  /** The mean of value accuracy over the families that have questions. */
  macroValue: number;
  packsFullyCorrect: number;
  perFamily: Record<Family, Rate>;
  perTrap: Record<Trap, Rate>;
  value: Rate;
  status: Rate;
  history: Rate;
  sources: Rate;
  /** Mean sources recall over the questions whose gold cites anything. */
  sourcesRecall: number | null;
  guarantee: Rate;
  params: RetrievalParams;
  paramsLabel: string;
  paramsHash: string;
  retries: number;
  errors: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  meanTtftMs: number | null;
  tokensIn: number;
  tokensOut: number;
  tokensReasoning: number;
  costUsd: number | null;
  maxTokens: number;
  temperature: number | null;
  packAccuracyAtRun: number;
}

function share(correct: number, total: number): Rate {
  return { accuracy: total === 0 ? 0 : correct / total, n: total };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export function summarize(bundle: RunBundle): RunSummary {
  const items = bundle.items;
  const perFamily = {} as Record<Family, Rate>;
  for (const family of FAMILIES) {
    const subset = items.filter((item) => item.family === family);
    perFamily[family] = share(subset.filter((item) => item.scored.value.correct).length, subset.length);
  }
  const perTrap = {} as Record<Trap, Rate>;
  for (const trap of TRAPS) {
    const subset = items.filter((item) => item.traps.includes(trap));
    perTrap[trap] = share(subset.filter((item) => item.scored.value.correct).length, subset.length);
  }
  const covered = FAMILIES.filter((family) => perFamily[family].n > 0);
  const historyScored = items.filter((item) => item.scored.history.scored);
  const recalls = items.map((item) => item.scored.sources_recall).filter((value): value is number => value !== null);
  const withSources = items.filter((item) => item.guarantee_met !== null);
  const ttfts = items.map((item) => item.ttft_ms).filter((value): value is number => value !== null);
  const costs = items.map((item) => item.cost_usd).filter((value): value is number => value !== null);

  return {
    runId: bundle.meta.run_id,
    runIndex: bundle.meta.run_index,
    model: bundle.meta.model_name,
    provider: bundle.meta.provider,
    questions: items.length,
    macroValue: mean(covered.map((family) => perFamily[family].accuracy)),
    packsFullyCorrect: share(items.filter((item) => item.scored.fully_correct).length, items.length).accuracy,
    perFamily,
    perTrap,
    value: share(items.filter((item) => item.scored.value.correct).length, items.length),
    status: share(items.filter((item) => item.scored.status.correct).length, items.length),
    history: share(historyScored.filter((item) => item.scored.history.correct).length, historyScored.length),
    sources: share(items.filter((item) => item.scored.sources.correct).length, items.length),
    sourcesRecall: recalls.length === 0 ? null : mean(recalls),
    guarantee: share(withSources.filter((item) => item.guarantee_met === true).length, withSources.length),
    params: bundle.meta.params,
    paramsLabel: paramsLabel(bundle.meta.params),
    paramsHash: bundle.meta.params_hash || paramsHash(bundle.meta.params),
    retries: items.reduce((total, item) => total + item.retries, 0),
    errors: items.filter((item) => item.error !== null).length,
    meanLatencyMs: mean(items.map((item) => item.latency_ms)),
    p95LatencyMs: percentile(items.map((item) => item.latency_ms), 0.95),
    meanTtftMs: ttfts.length === 0 ? null : mean(ttfts),
    tokensIn: items.reduce((total, item) => total + (item.tokens_in ?? 0), 0),
    tokensOut: items.reduce((total, item) => total + (item.tokens_out ?? 0), 0),
    tokensReasoning: items.reduce((total, item) => total + (item.tokens_reasoning ?? 0), 0),
    costUsd: costs.length === 0 ? null : costs.reduce((total, value) => total + value, 0),
    maxTokens: bundle.meta.params.max_tokens,
    temperature: bundle.meta.params.temperature,
    packAccuracyAtRun: bundle.meta.pack_accuracy_at_run,
  };
}

/** One leaderboard row: every run a model has on one corpus version with one set of parameters. */
export interface ModelRow {
  model: string;
  provider: string;
  runs: RunSummary[];
  paramsHash: string;
}

export function groupRuns(bundles: RunBundle[]): ModelRow[] {
  const rows = new Map<string, ModelRow>();
  for (const bundle of bundles) {
    const summary = summarize(bundle);
    const key = `${summary.model}::${summary.paramsHash}`;
    const row = rows.get(key) ?? { model: summary.model, provider: summary.provider, runs: [], paramsHash: summary.paramsHash };
    row.runs.push(summary);
    rows.set(key, row);
  }
  for (const row of rows.values()) row.runs.sort((a, b) => a.runId.localeCompare(b.runId));
  return [...rows.values()];
}

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const ms = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value)}`);
const usd = (value: number | null): string => (value === null ? "n/a" : `$${value.toFixed(4)}`);

/**
 * A cell over every run of the row: the mean, and the min to max spread when
 * there is more than one run. `n` is the same in every run, so it is stated once.
 */
function spread(values: number[], n: number | null): string {
  if (values.length === 0) return "n/a";
  const suffix = n === null ? "" : ` (n=${n})`;
  if (values.length === 1) return `${pct(values[0] ?? 0)}${suffix}`;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = `${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}`;
  return `${pct(mean(values))} (${range}${n === null ? "" : `, n=${n}`})`;
}

function rateCell(row: ModelRow, pick: (summary: RunSummary) => Rate): string {
  const n = row.runs[0] ? pick(row.runs[0]).n : 0;
  if (n === 0) return "not asked";
  return spread(row.runs.map((run) => pick(run).accuracy), n);
}

function table(columns: string[], rows: string[][]): string[] {
  return [
    `| ${columns.join(" | ")} |`,
    `|${"---|".repeat(columns.length)}`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
  ];
}

function meanOf(row: ModelRow, pick: (summary: RunSummary) => number | null): number | null {
  const values = row.runs.map(pick).filter((value): value is number => value !== null);
  return values.length === 0 ? null : mean(values);
}

function sumOf(row: ModelRow, pick: (summary: RunSummary) => number): number {
  return row.runs.reduce((total, run) => total + pick(run), 0);
}

function renderGroup(rows: ModelRow[], label: string, hash: string, headed: boolean): string[] {
  const ordered = [...rows].sort(
    (a, b) => mean(b.runs.map((run) => run.macroValue)) - mean(a.runs.map((run) => run.macroValue)) || a.model.localeCompare(b.model),
  );
  const families = FAMILIES.filter((family) => ordered.some((row) => row.runs[0]?.perFamily[family].n));
  const traps = TRAPS.filter((trap) => ordered.some((row) => row.runs[0]?.perTrap[trap].n));

  const headline = table(
    ["model", "runs", "macro value accuracy", "packs fully correct", ...families],
    ordered.map((row) => [
      row.model,
      String(row.runs.length),
      spread(row.runs.map((run) => run.macroValue), null),
      spread(row.runs.map((run) => run.packsFullyCorrect), null),
      ...families.map((family) => rateCell(row, (run) => run.perFamily[family])),
    ]),
  );

  const channels = table(
    ["model", "value", "status", "history", "sources", "sources recall"],
    ordered.map((row) => [
      row.model,
      rateCell(row, (run) => run.value),
      rateCell(row, (run) => run.status),
      rateCell(row, (run) => run.history),
      rateCell(row, (run) => run.sources),
      pct(meanOf(row, (run) => run.sourcesRecall)),
    ]),
  );

  const trapTable = table(
    ["model", ...traps],
    ordered.map((row) => [row.model, ...traps.map((trap) => rateCell(row, (run) => run.perTrap[trap]))]),
  );

  const operations = table(
    ["model", "questions", "retries", "call errors", "mean latency ms", "p95 latency ms", "mean ttft ms", "tokens in", "tokens out", "tokens reasoning", "cost"],
    ordered.map((row) => [
      row.model,
      String(row.runs[0]?.questions ?? 0),
      String(sumOf(row, (run) => run.retries)),
      String(sumOf(row, (run) => run.errors)),
      ms(meanOf(row, (run) => run.meanLatencyMs)),
      ms(meanOf(row, (run) => run.p95LatencyMs)),
      ms(meanOf(row, (run) => run.meanTtftMs)),
      String(sumOf(row, (run) => run.tokensIn)),
      String(sumOf(row, (run) => run.tokensOut)),
      String(sumOf(row, (run) => run.tokensReasoning)),
      usd(meanOf(row, (run) => run.costUsd)),
    ]),
  );

  const guarantee = ordered[0]?.runs[0]?.guarantee;

  return [
    ...(headed ? [`### Retrieval parameters \`${hash}\`: ${label}`, ""] : []),
    "**Headline.** Macro value accuracy is the mean of value accuracy over the families, so each family weighs the same. A pack is fully correct when every scored channel is correct.",
    "",
    ...headline,
    "",
    "**Channels.** Value and status are scored on every question, history only where the gold carries a chain, sources on every question. Sources recall is the share of gold sources cited, averaged over the questions whose gold cites anything.",
    "",
    ...channels,
    "",
    "**Trap resistance.** The share of the questions carrying that trap whose value channel was correct.",
    "",
    ...trapTable,
    "",
    "**Cost and speed.** Tokens and cost are summed over the runs of the row; latency is averaged over them.",
    "",
    ...operations,
    ...(guarantee === undefined || guarantee.n === 0
      ? []
      : [
          "",
          `The guarantee held for **${pct(guarantee.accuracy)}** of the ${guarantee.n} questions that have gold sources, which is a property of the corpus and of these parameters and is the same for every row above. It is a gate, not a metric: the corpus is written until it is 100 percent.`,
        ]),
  ];
}

export function renderLeaderboard(bundles: RunBundle[], scorerHash: string): string {
  if (bundles.length === 0) {
    return "No runs yet. Run `npm run bench -- --version v1 --model oracle` to produce one.";
  }
  const rows = groupRuns(bundles);
  const first = [...bundles].sort((a, b) => b.items.length - a.items.length)[0]!;

  const groups = new Map<string, ModelRow[]>();
  for (const row of rows) groups.set(row.paramsHash, [...(groups.get(row.paramsHash) ?? []), row]);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  const grouped = ordered.length > 1;

  const head = [
    `Corpus version **${first.meta.corpus_version}**, pipeline hash \`${first.meta.pipeline_hash}\`, prompt hash \`${first.meta.prompt_hash}\`. Rows are only comparable when those match and the retrieval parameters match, which is why every group names its parameters.`,
    "",
    "The unit is the question: one question, one retrieval, one call, one pack, four channels. A model that has been run more than once on the same corpus and the same parameters is one row, and its cells carry the mean with the min to max spread of those runs.",
    "",
    `Scored with scorer hash \`${scorerHash}\`. Every row is re-scored at report time from the raw replies stored in \`items.jsonl\`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.`,
  ];

  const drifted = rows.flatMap((row) =>
    row.runs
      .filter((run) => Math.abs(run.packsFullyCorrect - run.packAccuracyAtRun) > 1e-9)
      .map((run) => `- \`${run.runId}\`: ${pct(run.packAccuracyAtRun)} of packs fully correct at run time, ${pct(run.packsFullyCorrect)} now.`),
  );

  const tail = [
    ...(drifted.length === 0 ? [] : ["", "Runs whose score moved when they were re-scored:", "", ...drifted]),
    "",
    "Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:",
    "",
    ...rows.map((row) => {
      const run = row.runs[0]!;
      return `- \`${row.model}\`: temperature ${run.temperature === null ? "omitted" : run.temperature}, max output tokens ${run.maxTokens}, ${row.runs.length} run${row.runs.length === 1 ? "" : "s"}.`;
    }),
  ];

  const body = ordered.flatMap(([hash, group]) => [
    "",
    ...renderGroup(group, group[0]?.runs[0]?.paramsLabel ?? "", hash, grouped),
  ]);

  return [...head, ...body, ...tail].join("\n");
}

export function injectLeaderboard(readme: string, block: string, version: string): string {
  const markers = leaderboardMarkers(version);
  const start = readme.indexOf(markers.start);
  const end = readme.indexOf(markers.end);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md is missing the ${markers.start} and ${markers.end} marker comments`);
  }
  return readme.slice(0, start + markers.start.length) + "\n\n" + block + "\n\n" + readme.slice(end);
}
