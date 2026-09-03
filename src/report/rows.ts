// results.csv: one row per question per run, generated from the items.jsonl
// files and nothing else, after those have been re-scored with the current
// scorer. Full prompts and raw replies stay in the run directories; the CSV
// carries the four channel verdicts, the gold and the answer, and the scalars.
//
// Every leaderboard number is recomputable from this file:
//
//   value accuracy          value_correct over every row
//   score                   the share of packs fully correct
//   macro value accuracy    value_correct grouped by family, then averaged over families
//   packs fully correct     fully_correct over every row
//   per-channel accuracy    status_correct, history_correct (where history_scored),
//                           sources_correct
//   sources recall          mean of sources_recall over the rows that have one
//   trap resistance         value_correct over the rows whose traps contain that kind
//   guarantee               guarantee_met over the rows that have gold sources
//   multi-run spread        any of the above grouped by run_id, then by model
//
// Group by params_hash before comparing runs: two runs made with a different
// top_n read different evidence and are not one leaderboard.

import type { ItemResult, RunMeta } from "../types.js";

export const CSV_COLUMNS = [
  "run_id",
  "run_index",
  "model",
  "provider",
  "model_id",
  "corpus_version",
  "pipeline_hash",
  "prompt_hash",
  "params_hash",
  "top_n",
  "item_id",
  "family",
  "traps",
  "answer_type",
  "value_correct",
  "status_correct",
  "history_scored",
  "history_correct",
  "sources_correct",
  "sources_recall",
  "fully_correct",
  "guarantee_met",
  "gold_status",
  "got_status",
  "gold_value",
  "got_value",
  "gold_sources",
  "got_sources",
  "gold_history_steps",
  "got_history_steps",
  "reply_parsed",
  "latency_ms",
  "ttft_ms",
  "tokens_in",
  "tokens_out",
  "tokens_reasoning",
  "tokens_cached",
  "cost_usd",
  "retries",
  "finish_reason",
  "error",
] as const;

export interface RunBundle {
  meta: RunMeta;
  /** Re-scored at report time from the stored raw replies. */
  items: ItemResult[];
  /** Question ids in the run that the current corpus no longer has, so they kept their stored score. */
  unknownItems?: string[];
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(bundles: RunBundle[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      lines.push(
        [
          bundle.meta.run_id,
          bundle.meta.run_index,
          bundle.meta.model_name,
          bundle.meta.provider,
          bundle.meta.model_id,
          bundle.meta.corpus_version,
          bundle.meta.pipeline_hash,
          bundle.meta.prompt_hash,
          bundle.meta.params_hash,
          bundle.meta.params.top_n,
          item.item_id,
          item.family,
          item.traps.join(" "),
          item.answer_type,
          String(item.scored.value.correct),
          String(item.scored.status.correct),
          String(item.scored.history.scored),
          item.scored.history.scored ? String(item.scored.history.correct) : "",
          String(item.scored.sources.correct),
          item.scored.sources_recall === null ? "" : item.scored.sources_recall.toFixed(4),
          String(item.scored.fully_correct),
          item.guarantee_met === null ? "" : String(item.guarantee_met),
          item.gold.status,
          item.parsed?.status ?? "",
          item.gold.value,
          item.parsed?.value ?? "",
          item.gold.sources.join(" "),
          (item.parsed?.sources ?? []).join(" "),
          item.gold.history.length,
          item.parsed?.history.length ?? "",
          String(item.parsed !== null),
          item.latency_ms,
          item.ttft_ms,
          item.tokens_in,
          item.tokens_out,
          item.tokens_reasoning,
          item.tokens_cached,
          item.cost_usd === null ? "" : item.cost_usd.toFixed(6),
          item.retries,
          item.finish_reason,
          item.error,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
