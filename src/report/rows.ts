// results.csv: one row per FIELD per item per run, generated from the
// items.jsonl files and nothing else, after those have been re-scored with the
// current scorer. Full prompts and raw outputs stay in the run directories; the
// CSV carries only scalars plus the expected and the got value of that field.
//
// The row is the field rather than the item because the leaderboard counts
// fields: an item in v2 is a case whose three to six fields each sit on their
// own axis, so an item-level row could not reproduce a per-axis number. Every
// leaderboard number is recomputable from this file:
//
//   per-axis accuracy      field_correct grouped by field_axis
//   overall field accuracy field_correct over every row
//   accuracy given a hit   field_correct where field_retrieval_hit is true
//   reading accuracy       field_correct where field_retrieval_full is true
//   case accuracy          case_correct where field_ordinal = 0
//   twin gap               field_correct where twin_of is set, against the same
//                          field of the item named by twin_of
//   retrieval hit rate     field_retrieval_hit over the rows that have one
//   full-retrieval rate    field_retrieval_full over the rows that have one
//
// Group any of those by params_hash before comparing runs: two runs made with a
// different top_n read different evidence and are not one leaderboard.
//
// The item-level scalars (latency, tokens, cost, retries) repeat on every field
// row of the same item. Filter on `field_ordinal = 0` to get exactly one row per
// item before summing any of them.

import { retrievalParamsHash } from "./leaderboard.js";
import type { ItemResult, RunMeta } from "../types.js";

export const CSV_COLUMNS = [
  "run_id",
  "model",
  "provider",
  "model_id",
  "corpus_version",
  "pipeline_hash",
  "prompt_hash",
  "params_hash",
  "top_n",
  "item_id",
  "item_axis",
  "twin_of",
  "field_ordinal",
  "field",
  "field_axis",
  "field_correct",
  "field_retrieval_hit",
  "field_retrieval_full",
  "expected",
  "got",
  "case_correct",
  "fields_correct",
  "fields_total",
  "item_retrieval_hit",
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
  /** Item ids in the run that the current corpus no longer has, so they kept their stored score. */
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
      const fieldsCorrect = item.fields.filter((field) => field.correct).length;
      item.fields.forEach((field, ordinal) => {
        lines.push(
          [
            bundle.meta.run_id,
            bundle.meta.model_name,
            bundle.meta.provider,
            bundle.meta.model_id,
            bundle.meta.corpus_version,
            bundle.meta.pipeline_hash,
            bundle.meta.prompt_hash,
            retrievalParamsHash(bundle.meta.params),
            bundle.meta.params.top_n,
            item.item_id,
            item.axis,
            item.twin_of ?? "",
            ordinal,
            field.field,
            field.axis,
            String(field.correct),
            field.retrieval_hit === null ? "" : String(field.retrieval_hit),
            field.retrieval_full === null ? "" : String(field.retrieval_full),
            field.expected,
            field.got,
            String(item.correct),
            fieldsCorrect,
            item.fields.length,
            item.retrieval_hit === null ? "" : String(item.retrieval_hit),
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
      });
    }
  }
  return lines.join("\n") + "\n";
}
