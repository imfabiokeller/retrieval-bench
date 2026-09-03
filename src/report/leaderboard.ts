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
//
// Two tables per set of retrieval parameters, because a raw accuracy mixes two
// different failures. The reading table conditions on FULL retrieval: every gold
// document of the field was in the retrieved set, so the model had the evidence
// and the number is about reading it. The overall table is every scored field,
// retrieval misses included, which is what a user of the pipeline actually gets.
// Rows are grouped by retrieval parameters and every row names its own, because
// two runs read with a different top_n are not comparable.

import { createHash } from "node:crypto";
import type { Axis, ItemResult, RetrievalParams } from "../types.js";
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

/** The retrieval parameters, written out in full. Two runs are comparable only when these match. */
export function retrievalParamsLabel(params: RetrievalParams): string {
  return (
    `top_n ${params.top_n}, rrf_k ${params.rrf_k}, ` +
    `recency_weight ${params.recency_weight}, max_chunks_per_doc ${params.max_chunks_per_doc}`
  );
}

/** A short fingerprint of the same four numbers, so one table row identifies its own read arm. */
export function retrievalParamsHash(params: RetrievalParams): string {
  return createHash("sha256").update(retrievalParamsLabel(params)).digest("hex").slice(0, 8);
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
  /** The same per-axis accuracy over the fields that had ALL of their gold documents. */
  perAxisGivenFull: Record<Axis, AxisResult>;
  /** Field accuracy over the fields with at least one of their own gold documents retrieved. */
  accuracyGivenHit: number | null;
  hitFields: number;
  /** Field accuracy over the fields with ALL of their own gold documents retrieved. This is the reading number. */
  accuracyGivenFull: number | null;
  fullFields: number;
  /** The read arm this run used, and its fingerprint. */
  params: RetrievalParams;
  paramsLabel: string;
  paramsHash: string;
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
  const fulls = fields.filter((entry) => entry.field.retrieval_full === true);
  const perAxisGivenFull = {} as Record<Axis, AxisResult>;
  for (const axis of AXES) {
    const subset = fulls.filter((entry) => entry.field.axis === axis);
    perAxisGivenFull[axis] = {
      n: subset.length,
      accuracy: share(subset.filter((entry) => entry.field.correct).length, subset.length),
    };
  }
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
    perAxisGivenFull,
    hitFields: hits.length,
    accuracyGivenHit: hits.length === 0 ? null : share(hits.filter((entry) => entry.field.correct).length, hits.length),
    fullFields: fulls.length,
    accuracyGivenFull:
      fulls.length === 0 ? null : share(fulls.filter((entry) => entry.field.correct).length, fulls.length),
    params: bundle.meta.params,
    paramsLabel: retrievalParamsLabel(bundle.meta.params),
    paramsHash: retrievalParamsHash(bundle.meta.params),
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
 * Both rates are a property of the corpus AND of the retrieval parameters, not
 * of the model: the same pipeline retrieves the same chunks for every run made
 * with the same parameters, so the most complete run in a parameter group is the
 * one to read it from. Pass one group at a time. A field with no gold documents,
 * which is every abstain field, has nothing to retrieve and is excluded from the
 * denominator.
 */
function retrievalRate(bundles: RunBundle[], flag: "retrieval_hit" | "retrieval_full"): HitRate {
  const bundle = [...bundles].sort((a, b) => b.items.length - a.items.length)[0];
  if (!bundle) return { rate: null, scored: 0, total: 0, perAxis: {} };
  const fields = flatten(bundle.items);
  const scorable = fields.filter((entry) => entry.field[flag] !== null);
  const perAxis: Partial<Record<Axis, AxisResult>> = {};
  for (const axis of AXES) {
    const subset = scorable.filter((entry) => entry.field.axis === axis);
    if (subset.length === 0) continue;
    perAxis[axis] = {
      n: subset.length,
      accuracy: share(subset.filter((entry) => entry.field[flag] === true).length, subset.length),
    };
  }
  if (scorable.length === 0) return { rate: null, scored: 0, total: fields.length, perAxis };
  const got = scorable.filter((entry) => entry.field[flag] === true).length;
  return { rate: got / scorable.length, scored: scorable.length, total: fields.length, perAxis };
}

/** The share of fields with at least one of their gold documents retrieved. */
export function retrievalHitRate(bundles: RunBundle[]): HitRate {
  return retrievalRate(bundles, "retrieval_hit");
}

/**
 * The share of fields with EVERY one of their gold documents retrieved. This is
 * the number that says how much of a leaderboard gap is retrieval rather than
 * reading: a field the model could not have answered from what it was shown is
 * not evidence about the model.
 */
export function retrievalFullRate(bundles: RunBundle[]): HitRate {
  return retrievalRate(bundles, "retrieval_full");
}

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const points = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}`;
const ms = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value)}`);
const usd = (value: number | null): string => (value === null ? "n/a" : `$${value.toFixed(4)}`);

function axisCell(result: AxisResult, emptyLabel: string): string {
  return result.n === 0 ? emptyLabel : `${pct(result.accuracy)} (n=${result.n})`;
}

function table(columns: string[], rows: string[][]): string[] {
  return [
    `| ${columns.join(" | ")} |`,
    `|${"---|".repeat(columns.length)}`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
  ];
}

function rateLine(label: string, rate: HitRate, sentence: string): string[] {
  if (rate.rate === null) return [`${label}: not measurable on these runs.`];
  const perAxis = AXES.filter((axis) => rate.perAxis[axis]);
  return [
    `${label}: **${pct(rate.rate)}** of the ${rate.scored} fields that have gold documents. ${sentence}`,
    ...(perAxis.length === 0
      ? []
      : [
          "",
          "Per axis: " +
            perAxis.map((axis) => `${axis} ${pct(rate.perAxis[axis]!.accuracy)} (n=${rate.perAxis[axis]!.n})`).join(", ") +
            ".",
        ]),
  ];
}

/**
 * One block per set of retrieval parameters. Two runs made with a different
 * top_n saw different evidence, so putting them in one table would read as a
 * model comparison when it is a pipeline comparison.
 */
function renderGroup(group: RunBundle[], label: string, hash: string, headed: boolean): string[] {
  const summaries = [...group]
    .map(summarize)
    .sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model));
  const full = retrievalFullRate(group);
  const hit = retrievalHitRate(group);

  // An axis no run in this group covered is left out rather than shown empty, so
  // a v1 leaderboard keeps the five columns it always had.
  const axes = AXES.filter((axis) => summaries.some((summary) => summary.perAxis[axis].n > 0));

  const reading = table(
    ["model", "fields with full retrieval", "given full retrieval", ...axes],
    summaries.map((summary) => [
      summary.model,
      String(summary.fullFields),
      pct(summary.accuracyGivenFull),
      ...axes.map((axis) => axisCell(summary.perAxisGivenFull[axis], "n/a")),
    ]),
  );

  // Per-axis cells carry their own n, because a run made with --limit does not
  // cover every axis and must not be read as if it scored 0 on the rest.
  const everything = table(
    [
      "model",
      "params",
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
    ],
    summaries.map((summary) => [
      summary.model,
      `\`${summary.paramsHash}\``,
      String(summary.n),
      pct(summary.accuracy),
      ...axes.map((axis) => axisCell(summary.perAxis[axis], "not run")),
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
    ]),
  );

  return [
    ...(headed ? [`### Retrieval parameters \`${hash}\`: ${label}`, ""] : []),
    "**Reading.** Accuracy over the fields whose every gold document was in the retrieved set, so the model had the evidence and the number is about what it did with it. Abstain fields have no gold documents and never appear here.",
    "",
    ...reading,
    "",
    "**Everything.** Accuracy over every scored field, retrieval misses included, which is what the pipeline as a whole delivers.",
    "",
    ...everything,
    "",
    ...rateLine(
      "Full-retrieval rate for these parameters",
      full,
      "A field is full when every one of its own gold documents has a chunk in the retrieved set. It is a property of the corpus and of these parameters, not of any model, so it is the same for every row above. Abstain fields have no gold documents and are excluded from that denominator.",
    ),
    "",
    ...rateLine(
      "Retrieval hit rate for these parameters",
      hit,
      "A field is a hit when at least ONE retrieved chunk comes from one of its gold documents, which on a field that needs two documents is half the evidence. It is the looser of the two flags and is kept for continuity.",
    ),
  ];
}

export function renderLeaderboard(bundles: RunBundle[], scorerHash: string): string {
  if (bundles.length === 0) {
    return "No runs yet. Run `npm run bench -- --version v1 --model oracle` to produce one.";
  }
  const summaries = bundles.map(summarize).sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model));
  const first = [...bundles].sort((a, b) => b.items.length - a.items.length)[0]!;

  // Group by the read arm. The group holding the most runs goes first; ties are
  // broken by the parameter hash so the output is deterministic.
  const groups = new Map<string, RunBundle[]>();
  for (const bundle of bundles) {
    const hash = retrievalParamsHash(bundle.meta.params);
    groups.set(hash, [...(groups.get(hash) ?? []), bundle]);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1),
  );
  const grouped = ordered.length > 1;

  const named = (summary: RunSummary): string =>
    grouped ? `\`${summary.model}\` (params \`${summary.paramsHash}\`)` : `\`${summary.model}\``;

  // A run's accuracy is recomputed here from its stored raw replies, so a run
  // made before a scorer fix is worth saying out loud rather than quietly
  // restating. accuracy_at_run is an item-level number, so it is compared with
  // the item-level one.
  const drifted = summaries.filter((summary) => Math.abs(summary.caseAccuracy - summary.accuracyAtRun) > 1e-9);
  const twinned = summaries.filter((summary) => summary.twinGap !== null);

  const head = [
    `Corpus version **${first.meta.corpus_version}**, pipeline hash \`${first.meta.pipeline_hash}\`, prompt hash \`${first.meta.prompt_hash}\`. Rows are only comparable when those match AND the retrieval parameters match, which is why every row names its parameter hash and the tables are grouped by it.`,
    "",
    "The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.",
    "",
    "Two accuracies per model, because a raw score mixes two different failures. A field whose answer needs two documents and got one of them was handed half the evidence, and the any-document hit flag still calls that a hit. `given full retrieval` conditions on all of a field's gold documents being there, so it is the reading number; `overall` is every field and is the pipeline number.",
    "",
    `Scored with scorer hash \`${scorerHash}\`. Every row is re-scored at report time from the raw replies stored in \`items.jsonl\`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.`,
  ];

  const tail = [
    ...(drifted.length === 0
      ? []
      : [
          "",
          "Runs whose score moved when they were re-scored:",
          "",
          ...drifted.map(
            (summary) =>
              `- ${named(summary)}: ${pct(summary.accuracyAtRun)} of cases at run time, ${pct(summary.caseAccuracy)} now.`,
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
            return `- ${named(summary)}: ${pct(gap.twinAccuracy)} on the ${gap.n} twin fields, ${pct(gap.caseAccuracy)} on the same fields inside their cases, ${points(gap.gap)} points.`;
          }),
        ]),
    "",
    "Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:",
    "",
    ...summaries.map(
      (summary) =>
        `- ${named(summary)}: temperature ${summary.temperature === null ? "omitted" : summary.temperature}, max output tokens ${summary.maxTokens}, ${summary.errors} call errors.`,
    ),
  ];

  const body = ordered.flatMap(([hash, group]) => [
    "",
    ...renderGroup(group, retrievalParamsLabel(group[0]!.meta.params), hash, grouped),
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
