// LEADERBOARD.md, generated from the run bundles. Nothing here is written by
// hand, and the same function produces the block that is injected into README.md
// between the marker comments.
//
// The unit is the FIELD. An item in v2 is a case: one question, one retrieval,
// one call, and three to six fields that each sit on their own axis, so a
// per-axis number is an accuracy over the fields tagged with that axis and
// carries its own n. "case" is the strictness column next to it: the share of
// cases where every field was right. A v1 item has one axis for the whole item
// and one field most of the time, so a v1 run reads the same way it always did.

import type { Axis, ItemResult } from "../types.js";
import type { RunBundle } from "./rows.js";

export const AXES: Axis[] = [
  "entities",
  "facts",
  "supersession",
  "conflict",
  "abstain",
  "asof",
  "join",
  "exhaustive",
  "aggregation",
];

/**
 * One marker pair per corpus version, because the README carries one table per
 * version and the two are never comparable: different corpus, different index,
 * different retrieval parameters.
 */
export function leaderboardMarkers(version: string): { start: string; end: string } {
  return { start: `<!-- LEADERBOARD:${version}:START -->`, end: `<!-- LEADERBOARD:${version}:END -->` };
}

export interface AxisResult {
  accuracy: number;
  n: number;
}

export interface TwinGap {
  /** Accuracy on the fields asked on their own. */
  twinAccuracy: number;
  /** Accuracy on the same fields asked inside their case. */
  caseAccuracy: number;
  /** twinAccuracy minus caseAccuracy, in accuracy points. */
  gap: number;
  n: number;
}

export interface RunSummary {
  run_id: string;
  model: string;
  provider: string;
  /** Fields correct over fields scored. This is the headline number. */
  accuracy: number;
  /** The score the run itself recorded, before the report re-scored it. Item level. */
  accuracyAtRun: number;
  /** Scored fields. */
  n: number;
  /** Cases, which is items. */
  cases: number;
  /** Cases where every field was correct. */
  caseAccuracy: number;
  perAxis: Record<Axis, AxisResult>;
  /** Field accuracy over the fields whose own gold documents were retrieved. */
  accuracyGivenHit: number | null;
  hitFields: number;
  twinGap: TwinGap | null;
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
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function share(correct: number, total: number): number {
  return total === 0 ? 0 : correct / total;
}

interface FlatField {
  item: ItemResult;
  field: ItemResult["fields"][number];
}

function flatten(items: ItemResult[]): FlatField[] {
  return items.flatMap((item) => item.fields.map((field) => ({ item, field })));
}

/**
 * Twins are single-field items that ask the hardest field of a case on its own,
 * so the difference between the two is what the other fields of the case cost
 * the model. Both sides are the same field, the same gold documents and the same
 * expected value; only the question and therefore the retrieval differ.
 */
export function twinGap(items: ItemResult[]): TwinGap | null {
  const byId = new Map(items.map((item) => [item.item_id, item]));
  let twinCorrect = 0;
  let caseCorrect = 0;
  let n = 0;
  for (const item of items) {
    if (!item.twin_of) continue;
    const field = item.fields[0];
    if (!field) continue;
    const inCase = byId.get(item.twin_of)?.fields.find((entry) => entry.field === field.field);
    if (!inCase) continue;
    n += 1;
    if (field.correct) twinCorrect += 1;
    if (inCase.correct) caseCorrect += 1;
  }
  if (n === 0) return null;
  const twinAccuracy = twinCorrect / n;
  const caseAccuracy = caseCorrect / n;
  return { twinAccuracy, caseAccuracy, gap: twinAccuracy - caseAccuracy, n };
}

export function summarize(bundle: RunBundle): RunSummary {
  const items = bundle.items;
  const fields = flatten(items);
  const perAxis = {} as Record<Axis, AxisResult>;
  for (const axis of AXES) {
    const subset = fields.filter((entry) => entry.field.axis === axis);
    perAxis[axis] = {
      n: subset.length,
      accuracy: share(subset.filter((entry) => entry.field.correct).length, subset.length),
    };
  }
  const hits = fields.filter((entry) => entry.field.retrieval_hit === true);
  const ttfts = items.map((item) => item.ttft_ms).filter((value): value is number => value !== null);
  const costs = items.map((item) => item.cost_usd).filter((value): value is number => value !== null);
  return {
    run_id: bundle.meta.run_id,
    model: bundle.meta.model_name,
    provider: bundle.meta.provider,
    n: fields.length,
    accuracy: share(fields.filter((entry) => entry.field.correct).length, fields.length),
    accuracyAtRun: bundle.meta.accuracy_at_run,
    cases: items.length,
    caseAccuracy: share(items.filter((item) => item.correct).length, items.length),
    perAxis,
    hitFields: hits.length,
    accuracyGivenHit: hits.length === 0 ? null : share(hits.filter((entry) => entry.field.correct).length, hits.length),
    twinGap: twinGap(items),
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
  };
}

export interface HitRate {
  rate: number | null;
  scored: number;
  total: number;
  perAxis: Partial<Record<Axis, AxisResult>>;
}

/**
 * Corpus-level, not model-level: the same fixed pipeline retrieves the same
 * chunks for every run, so the most complete run is the one to read it from. A
 * field with no gold documents, which is every abstain field, has nothing to
 * retrieve and is excluded from the denominator.
 */
export function retrievalHitRate(bundles: RunBundle[]): HitRate {
  const bundle = [...bundles].sort((a, b) => b.items.length - a.items.length)[0];
  if (!bundle) return { rate: null, scored: 0, total: 0, perAxis: {} };
  const fields = flatten(bundle.items);
  const scorable = fields.filter((entry) => entry.field.retrieval_hit !== null);
  const perAxis: Partial<Record<Axis, AxisResult>> = {};
  for (const axis of AXES) {
    const subset = scorable.filter((entry) => entry.field.axis === axis);
    if (subset.length === 0) continue;
    perAxis[axis] = {
      n: subset.length,
      accuracy: share(subset.filter((entry) => entry.field.retrieval_hit === true).length, subset.length),
    };
  }
  if (scorable.length === 0) return { rate: null, scored: 0, total: fields.length, perAxis };
  const hits = scorable.filter((entry) => entry.field.retrieval_hit === true).length;
  return { rate: hits / scorable.length, scored: scorable.length, total: fields.length, perAxis };
}

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const points = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}`;
const ms = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value)}`);
const usd = (value: number | null): string => (value === null ? "n/a" : `$${value.toFixed(4)}`);

export function renderLeaderboard(bundles: RunBundle[], scorerHash: string): string {
  if (bundles.length === 0) {
    return "No runs yet. Run `npm run bench -- --version v1 --model oracle` to produce one.";
  }
  const summaries = bundles.map(summarize).sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model));
  const first = [...bundles].sort((a, b) => b.items.length - a.items.length)[0]!;
  const hit = retrievalHitRate(bundles);

  // An axis no run covered is left out of the table rather than shown empty, so
  // a v1 leaderboard keeps the five columns it always had.
  const axes = AXES.filter((axis) => summaries.some((summary) => summary.perAxis[axis].n > 0));

  // Per-axis cells carry their own n, because a run made with --limit does not
  // cover every axis and must not be read as if it scored 0 on the rest.
  const columns = [
    "model",
    "fields",
    "overall",
    ...axes,
    "cases",
    "case fully correct",
    "acc given retrieval hit",
    "retries",
    "mean latency ms",
    "p95 latency ms",
    "mean ttft ms",
    "tokens in",
    "tokens out",
    "tokens reasoning",
    "run cost",
  ];
  const header = [`| ${columns.join(" | ")} |`, `|${"---|".repeat(columns.length)}`];
  const rows = summaries.map((summary) => {
    const cells = [
      summary.model,
      String(summary.n),
      pct(summary.accuracy),
      ...axes.map((axis) => {
        const axisResult = summary.perAxis[axis];
        return axisResult.n === 0 ? "not run" : `${pct(axisResult.accuracy)} (n=${axisResult.n})`;
      }),
      String(summary.cases),
      pct(summary.caseAccuracy),
      pct(summary.accuracyGivenHit),
      String(summary.retries),
      ms(summary.meanLatencyMs),
      ms(summary.p95LatencyMs),
      ms(summary.meanTtftMs),
      String(summary.tokensIn),
      String(summary.tokensOut),
      String(summary.tokensReasoning),
      usd(summary.costUsd),
    ];
    return `| ${cells.join(" | ")} |`;
  });

  // A run's accuracy is recomputed here from its stored raw replies, so a run
  // made before a scorer fix is worth saying out loud rather than quietly
  // restating. accuracy_at_run is an item-level number, so it is compared with
  // the item-level one.
  const drifted = summaries.filter((summary) => Math.abs(summary.caseAccuracy - summary.accuracyAtRun) > 1e-9);
  const twinned = summaries.filter((summary) => summary.twinGap !== null);

  const notes = [
    "",
    `Corpus version **${first.meta.corpus_version}**, pipeline hash \`${first.meta.pipeline_hash}\`, prompt hash \`${first.meta.prompt_hash}\`, top ${first.meta.params.top_n} chunks. Rows are only comparable when all of those match.`,
    "",
    "The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.",
    "",
    `Scored with scorer hash \`${scorerHash}\`. Every row is re-scored at report time from the raw replies stored in \`items.jsonl\`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.`,
    ...(drifted.length === 0
      ? []
      : [
          "",
          "Runs whose score moved when they were re-scored:",
          "",
          ...drifted.map(
            (summary) =>
              `- \`${summary.model}\`: ${pct(summary.accuracyAtRun)} of cases at run time, ${pct(summary.caseAccuracy)} now.`,
          ),
        ]),
    ...(twinned.length === 0
      ? []
      : [
          "",
          "Twin gap. A twin asks one hard field of a case on its own, with the same gold documents and the same expected value, so the difference is what the rest of the case costs:",
          "",
          ...twinned.map((summary) => {
            const gap = summary.twinGap!;
            return `- \`${summary.model}\`: ${pct(gap.twinAccuracy)} on the ${gap.n} twin fields, ${pct(gap.caseAccuracy)} on the same fields inside their cases, ${points(gap.gap)} points.`;
          }),
        ]),
    "",
    hit.rate === null
      ? "Retrieval hit rate: not measurable on this run."
      : `Retrieval hit rate for this corpus version: **${pct(hit.rate)}** of the ${hit.scored} fields that have gold documents. A field is a hit when at least one retrieved chunk comes from one of that field's own gold documents. It is a property of the frozen pipeline, not of any model, so it is the same for every row. Abstain fields have no gold documents and are excluded from that denominator.`,
    ...(Object.keys(hit.perAxis).length === 0
      ? []
      : [
          "",
          "Per axis: " +
            AXES.filter((axis) => hit.perAxis[axis])
              .map((axis) => `${axis} ${pct(hit.perAxis[axis]!.accuracy)} (n=${hit.perAxis[axis]!.n})`)
              .join(", ") +
            ".",
        ]),
    "",
    "Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:",
    "",
    ...summaries.map(
      (summary) =>
        `- \`${summary.model}\`: temperature ${summary.temperature === null ? "omitted" : summary.temperature}, max output tokens ${summary.maxTokens}, ${summary.errors} call errors.`,
    ),
  ];

  return [...header, ...rows, ...notes].join("\n");
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
