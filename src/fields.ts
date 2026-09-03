// Resolving one field of a case.
//
// An item in v2 is a case: one question, one retrieval, one model call, and a
// schema whose every field carries its own axis and its own gold documents. An
// item in v1 has neither, so every one of its fields inherits the item-level
// axis and the item-level gold documents. Everything that scores or reports a
// field goes through here, which is what keeps v1 items valid and v1 runs
// re-scorable under the per-field rules.

import type { Axis, FieldMeta, Item } from "./types.js";

export function fieldNames(item: Item): string[] {
  return item.schema.required;
}

/** The axis and gold documents in force for one field, inherited when the item states none. */
export function fieldMeta(item: Item, field: string): FieldMeta {
  const declared = item.fields?.[field];
  if (declared) return declared;
  return { axis: item.axis, gold_doc_ids: item.gold_doc_ids };
}

export function fieldAxis(item: Item, field: string): Axis {
  return fieldMeta(item, field).axis;
}

export function fieldGoldDocIds(item: Item, field: string): string[] {
  return fieldMeta(item, field).gold_doc_ids;
}

/** The union of every field's gold documents, in first-seen order. */
export function goldDocIdsOf(item: Item): string[] {
  if (!item.fields) return item.gold_doc_ids;
  const seen: string[] = [];
  for (const field of fieldNames(item)) {
    for (const id of fieldGoldDocIds(item, field)) {
      if (!seen.includes(id)) seen.push(id);
    }
  }
  return seen;
}

/**
 * True when at least one retrieved document is one of this field's gold
 * documents. Null when the field has none, which is every abstain field: there
 * is nothing to retrieve, so it is excluded from the hit rate rather than
 * counted as a miss.
 */
export function fieldRetrievalHit(item: Item, field: string, retrievedDocIds: string[]): boolean | null {
  const gold = fieldGoldDocIds(item, field);
  if (gold.length === 0) return null;
  const retrieved = new Set(retrievedDocIds);
  return gold.some((id) => retrieved.has(id));
}

/**
 * True when EVERY gold document of this field is in the retrieved set. Null when
 * the field has none, on the same reasoning as the any-doc flag.
 *
 * This is the flag that separates reading from retrieving. A join, exhaustive or
 * aggregation field is only answerable when all of its gold documents are there,
 * so the any-doc flag reports it as evidence-in-hand while the model was in fact
 * handed half the answer.
 */
export function fieldRetrievalFull(item: Item, field: string, retrievedDocIds: string[]): boolean | null {
  const gold = fieldGoldDocIds(item, field);
  if (gold.length === 0) return null;
  const retrieved = new Set(retrievedDocIds);
  return gold.every((id) => retrieved.has(id));
}
