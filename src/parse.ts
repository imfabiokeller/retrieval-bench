// Turning a model reply into an object. This lives on its own because it is
// part of the scorer, not part of the prompt: `npm run report` re-parses every
// stored raw_output with this file, and `scorer_hash` is a fingerprint over it
// together with normalize.ts, score.ts and the alias table.

import type { FieldValue } from "./types.js";

/**
 * Robust parse of a model reply: strips code fences and any prose around the
 * object, then takes the first balanced JSON object. Returns null when there is
 * no object to take, which counts as an incorrect answer.
 */
export function parseObject(raw: string): Record<string, FieldValue> | null {
  const text = raw.replace(/^﻿/, "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), text].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const slice = firstJsonObject(candidate);
    if (slice === null) continue;
    try {
      const parsed: unknown = JSON.parse(slice);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, FieldValue>;
      }
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const character = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
