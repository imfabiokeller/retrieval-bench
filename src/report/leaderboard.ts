// LEADERBOARD.md, generated from the run bundles. Nothing here is written by
// hand, and the same function produces the block that is injected into README.md
// between the marker comments.

import type { Axis } from "../types.js";
import type { RunBundle } from "./rows.js";

export const AXES: Axis[] = ["entities", "facts", "supersession", "conflict", "abstain"];

export const LEADERBOARD_START = "<!-- LEADERBOARD:START -->";
export const LEADERBOARD_END = "<!-- LEADERBOARD:END -->";

export interface RunSummary {
  run_id: string;
  model: string;
  provider: string;
  accuracy: number;
  n: number;
  perAxis: Record<Axis, { accuracy: number; n: number }>;
  accuracyGivenHit: number | null;
  hitItems: number;
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

export function summarize(bundle: RunBundle): RunSummary {
  const items = bundle.items;
  const perAxis = {} as Record<Axis, { accuracy: number; n: number }>;
  for (const axis of AXES) {
    const subset = items.filter((item) => item.axis === axis);
    perAxis[axis] = {
      n: subset.length,
      accuracy: subset.length === 0 ? 0 : subset.filter((item) => item.correct).length / subset.length,
    };
  }
  const hits = items.filter((item) => item.retrieval_hit === true);
  const ttfts = items.map((item) => item.ttft_ms).filter((value): value is number => value !== null);
  const costs = items.map((item) => item.cost_usd).filter((value): value is number => value !== null);
  return {
    run_id: bundle.meta.run_id,
    model: bundle.meta.model_name,
    provider: bundle.meta.provider,
    n: items.length,
    accuracy: items.length === 0 ? 0 : items.filter((item) => item.correct).length / items.length,
    perAxis,
    hitItems: hits.length,
    accuracyGivenHit: hits.length === 0 ? null : hits.filter((item) => item.correct).length / hits.length,
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

/**
 * Corpus-level, not model-level: the same fixed pipeline retrieves the same
 * chunks for every run, so the most complete run is the one to read it from.
 */
export function retrievalHitRate(bundles: RunBundle[]): { rate: number | null; scored: number; total: number } {
  const bundle = [...bundles].sort((a, b) => b.items.length - a.items.length)[0];
  if (!bundle) return { rate: null, scored: 0, total: 0 };
  const scorable = bundle.items.filter((item) => item.retrieval_hit !== null);
  if (scorable.length === 0) return { rate: null, scored: 0, total: bundle.items.length };
  const hits = scorable.filter((item) => item.retrieval_hit === true).length;
  return { rate: hits / scorable.length, scored: scorable.length, total: bundle.items.length };
}

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const ms = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value)}`);
const usd = (value: number | null): string => (value === null ? "n/a" : `$${value.toFixed(4)}`);

export function renderLeaderboard(bundles: RunBundle[]): string {
  if (bundles.length === 0) {
    return "No runs yet. Run `npm run bench -- --version v1 --model oracle` to produce one.";
  }
  const summaries = bundles.map(summarize).sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model));
  const first = [...bundles].sort((a, b) => b.items.length - a.items.length)[0]!;
  const hit = retrievalHitRate(bundles);

  // Per-axis cells carry their own n, because a run made with --limit does not
  // cover every axis and must not be read as if it scored 0 on the rest.
  const columns = [
    "model",
    "items",
    "overall",
    ...AXES,
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
      ...AXES.map((axis) => {
        const axisResult = summary.perAxis[axis];
        return axisResult.n === 0 ? "not run" : `${pct(axisResult.accuracy)} (n=${axisResult.n})`;
      }),
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

  const notes = [
    "",
    `Corpus version **${first.meta.corpus_version}**, pipeline hash \`${first.meta.pipeline_hash}\`, prompt hash \`${first.meta.prompt_hash}\`. Rows are only comparable when all three match.`,
    "",
    hit.rate === null
      ? "Retrieval hit rate: not measurable on this run."
      : `Retrieval hit rate for this corpus version: **${pct(hit.rate)}** of the ${hit.scored} items that have gold documents. It is a property of the frozen pipeline, not of any model, so it is the same for every row. The abstain items have no gold documents and are excluded from that denominator.`,
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

export function injectLeaderboard(readme: string, block: string): string {
  const start = readme.indexOf(LEADERBOARD_START);
  const end = readme.indexOf(LEADERBOARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("README.md is missing the leaderboard marker comments");
  }
  return (
    readme.slice(0, start + LEADERBOARD_START.length) +
    "\n\n" +
    block +
    "\n\n" +
    readme.slice(end)
  );
}
