// Deterministic scoring. A field is correct when its normalized value equals
// the normalized gold value. An item is correct when every field is correct.
// A response that could not be parsed into an object is incorrect on every
// field, including on abstain items: refusing to emit JSON is not the same as
// answering null.
//
// Scoring is per field, and every field row carries the axis that field was
// written for. A v2 item is a case with three to six fields on different axes;
// a v1 item has one axis for the whole item and its fields inherit it. The
// leaderboard counts fields, not items, so this is where its per-axis numbers
// come from.

import { fieldAxis, fieldRetrievalHit } from "./fields.js";
import { normalizeField } from "./normalize.js";
import type { Aliases } from "./normalize.js";
import type { FieldResult, FieldValue, Item } from "./types.js";

export interface Scored {
  fields: FieldResult[];
  correct: boolean;
}

/**
 * `retrievedDocIds` is what the retrieval actually returned for this case, and
 * it is only used to set the per-field hit flag. An empty list means nothing
 * was retrieved, so every field with gold documents records a miss.
 */
export function scoreItem(
  item: Item,
  parsed: Record<string, FieldValue> | null,
  aliases: Aliases,
  retrievedDocIds: string[] = [],
): Scored {
  const fields: FieldResult[] = [];
  for (const name of item.schema.required) {
    const type = item.schema.properties[name]?.type ?? "string";
    const expected = normalizeField(item.expected[name] ?? null, type, aliases);
    const got = parsed === null ? { value: null, key: " unparsed" } : normalizeField(parsed[name] ?? null, type, aliases);
    fields.push({
      field: name,
      axis: fieldAxis(item, name),
      expected: expected.value,
      got: got.value,
      correct: parsed !== null && expected.key === got.key,
      retrieval_hit: fieldRetrievalHit(item, name, retrievedDocIds),
    });
  }
  return { fields, correct: fields.length > 0 && fields.every((field) => field.correct) };
}
