// The one prompt. It is identical for every model, is never templated per
// provider, and its sha256 is recorded on every run as prompt_hash. Changing a
// character here changes the prompt hash and makes older runs incomparable.

import { sha256 } from "./hash.js";
import type { Item, Retrieved } from "./types.js";
import type { FieldValue } from "./types.js";

export const SYSTEM_PROMPT = [
  "You extract structured data from a company's internal records.",
  "",
  "You are given EVIDENCE (Slack messages, issue tracker entries, emails, meeting notes and documents, each labelled with its type, channel or project, author and date), a QUESTION, and a SCHEMA.",
  "",
  "Rules:",
  "1. Reply with a single JSON object and nothing else. No prose, no explanation, no markdown, no code fences.",
  "2. The object has exactly the fields named in the schema. Do not add fields and do not omit fields.",
  "3. Use only the evidence. Do not use outside knowledge and do not guess.",
  "4. If the evidence does not support a value for a field, set that field to null. null is the right answer more often than a plausible-looking value.",
  "5. When two pieces of evidence disagree, prefer the one with the newer date. A later correction replaces an earlier statement, and an older value repeated after a correction is still the older value.",
  "6. Field types: \"string\" is a plain string; \"number\" is a bare number with no units, no currency symbol and no thousands separators; \"date\" is YYYY-MM-DD; \"boolean\" is true or false; \"string[]\" is an array of strings.",
].join("\n");

export const PROMPT_HASH = sha256(SYSTEM_PROMPT).slice(0, 16);

export function renderEvidence(retrieved: Retrieved[]): string {
  if (retrieved.length === 0) return "(no evidence retrieved)";
  return retrieved
    .map((entry, index) => `[${index + 1}] ${entry.chunk.prefix}\n${entry.chunk.body}`)
    .join("\n\n");
}

export function renderPrompt(item: Item, retrieved: Retrieved[]): string {
  return [
    "EVIDENCE",
    renderEvidence(retrieved),
    "",
    "QUESTION",
    item.question,
    "",
    "SCHEMA",
    JSON.stringify(item.schema),
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}

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
