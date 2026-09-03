// results.csv: one row per item per run, generated from the items.jsonl files
// and nothing else. Full prompts and raw outputs stay in the run directories;
// the CSV carries only scalars plus a compact expected and got object.

import type { ItemResult, RunMeta } from "../types.js";

export const CSV_COLUMNS = [
  "run_id",
  "model",
  "provider",
  "model_id",
  "corpus_version",
  "pipeline_hash",
  "prompt_hash",
  "item_id",
  "axis",
  "retrieval_hit",
  "correct",
  "fields_correct",
  "fields_total",
  "latency_ms",
  "ttft_ms",
  "tokens_in",
  "tokens_out",
  "tokens_cached",
  "cost_usd",
  "retries",
  "finish_reason",
  "error",
  "expected",
  "got",
] as const;

export interface RunBundle {
  meta: RunMeta;
  items: ItemResult[];
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function gotObject(item: ItemResult): Record<string, unknown> | null {
  if (item.parsed === null) return null;
  const got: Record<string, unknown> = {};
  for (const field of item.fields) got[field.field] = field.got;
  return got;
}

function expectedObject(item: ItemResult): Record<string, unknown> {
  const expected: Record<string, unknown> = {};
  for (const field of item.fields) expected[field.field] = field.expected;
  return expected;
}

export function toCsv(bundles: RunBundle[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      lines.push(
        [
          bundle.meta.run_id,
          bundle.meta.model_name,
          bundle.meta.provider,
          bundle.meta.model_id,
          bundle.meta.corpus_version,
          bundle.meta.pipeline_hash,
          bundle.meta.prompt_hash,
          item.item_id,
          item.axis,
          item.retrieval_hit === null ? "" : String(item.retrieval_hit),
          String(item.correct),
          item.fields.filter((field) => field.correct).length,
          item.fields.length,
          item.latency_ms,
          item.ttft_ms,
          item.tokens_in,
          item.tokens_out,
          item.tokens_cached,
          item.cost_usd === null ? "" : item.cost_usd.toFixed(6),
          item.retries,
          item.finish_reason,
          item.error,
          expectedObject(item),
          gotObject(item),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}
