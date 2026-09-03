// Re-scoring a stored run. items.jsonl keeps the raw model reply for every item,
// so a scoring fix never needs a paid re-run: the report re-parses and re-scores
// every stored reply with the current parser, normalizer, scorer and alias
// table, and the item schemas come from the corpus rather than from the run.
//
// What is replayable and what is not: the reply is stored, so parsing and
// scoring can be redone. The retrieval is not stored beyond the chunk ids, so
// retrieval_hit, latency, tokens and cost are left exactly as the run recorded
// them, and pipeline_hash is what says whether they are comparable.

import { parseObject } from "../parse.js";
import { scoreItem } from "../score.js";
import type { Aliases } from "../normalize.js";
import type { Item, ItemResult } from "../types.js";

export interface RescoreResult {
  items: ItemResult[];
  /** Item ids the run holds that the current corpus no longer has. Left untouched. */
  unknown: string[];
  /** How many items changed their correctness under the current scorer. */
  changed: number;
}

export function rescoreItems(stored: ItemResult[], corpus: Map<string, Item>, aliases: Aliases): RescoreResult {
  const items: ItemResult[] = [];
  const unknown: string[] = [];
  let changed = 0;

  for (const result of stored) {
    const item = corpus.get(result.item_id);
    if (!item) {
      unknown.push(result.item_id);
      items.push(result);
      continue;
    }
    // Exactly what the runner did: a call that errored has no answer to parse,
    // whatever partial text it left behind.
    const parsed = result.error === null ? parseObject(result.raw_output) : null;
    const scored = scoreItem(item, parsed, aliases);
    if (scored.correct !== result.correct) changed += 1;
    items.push({
      ...result,
      parsed,
      expected: item.expected,
      fields: scored.fields,
      correct: scored.correct,
    });
  }

  return { items, unknown, changed };
}

export function accuracyOf(items: ItemResult[]): number {
  if (items.length === 0) return 0;
  return items.filter((item) => item.correct).length / items.length;
}
