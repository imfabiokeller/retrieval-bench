// Re-scoring a stored run. items.jsonl keeps the raw model reply for every
// question, so a scoring fix never needs a paid re-run: the report re-parses and
// re-scores every stored reply with the current parser, normalizer, scorer and
// alias table, and the gold packs come from the corpus rather than from the run.
//
// What is replayable and what is not: the reply is stored, so parsing and
// scoring can be redone, and so is the guarantee flag, because the retrieved
// document ids are stored and the gold sources come from the corpus. Latency,
// tokens and cost are left exactly as the run recorded them, and pipeline_hash
// and params_hash are what say whether they are comparable.

import { parsePack } from "../parse.js";
import { scorePack } from "../score.js";
import { guaranteeMet } from "../run.js";
import type { Aliases } from "../normalize.js";
import type { ItemResult, Question } from "../types.js";

export interface RescoreResult {
  items: ItemResult[];
  /** Question ids the run holds that the current corpus no longer has. Left untouched. */
  unknown: string[];
  /** How many packs changed their verdict under the current scorer. */
  changed: number;
}

export function rescoreItems(
  stored: ItemResult[],
  corpus: Map<string, Question>,
  aliases: Aliases,
): RescoreResult {
  const items: ItemResult[] = [];
  const unknown: string[] = [];
  let changed = 0;

  for (const result of stored) {
    const question = corpus.get(result.item_id);
    if (!question) {
      unknown.push(result.item_id);
      items.push(result);
      continue;
    }
    // Exactly what the runner did: a call that errored has no answer to parse,
    // whatever partial text it left behind.
    const parsed = result.error === null ? parsePack(result.raw_output) : null;
    const scored = scorePack(parsed, question.gold, question.answer_type, aliases);
    if (scored.fully_correct !== result.scored?.fully_correct) changed += 1;
    items.push({
      ...result,
      family: question.family,
      traps: question.traps,
      answer_type: question.answer_type,
      parsed,
      gold: question.gold,
      scored,
      guarantee_met: guaranteeMet(result.retrieved_doc_ids, question.gold.sources),
    });
  }

  return { items, unknown, changed };
}

export function packAccuracyOf(items: ItemResult[]): number {
  if (items.length === 0) return 0;
  return items.filter((item) => item.scored.fully_correct).length / items.length;
}
