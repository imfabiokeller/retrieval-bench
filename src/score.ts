// Deterministic scoring. A field is correct when its normalized value equals
// the normalized gold value. An item is correct when every field is correct.
// A response that could not be parsed into an object is incorrect on every
// field, including on abstain items: refusing to emit JSON is not the same as
// answering null.

import { normalizeField } from "./normalize.js";
import type { Aliases } from "./normalize.js";
import type { FieldResult, FieldValue, Item } from "./types.js";

export interface Scored {
  fields: FieldResult[];
  correct: boolean;
}

export function scoreItem(
  item: Item,
  parsed: Record<string, FieldValue> | null,
  aliases: Aliases,
): Scored {
  const fields: FieldResult[] = [];
  for (const name of item.schema.required) {
    const type = item.schema.properties[name]?.type ?? "string";
    const expected = normalizeField(item.expected[name] ?? null, type, aliases);
    const got = parsed === null ? { value: null, key: " unparsed" } : normalizeField(parsed[name] ?? null, type, aliases);
    fields.push({
      field: name,
      expected: expected.value,
      got: got.value,
      correct: parsed !== null && expected.key === got.key,
    });
  }
  return { fields, correct: fields.length > 0 && fields.every((field) => field.correct) };
}
