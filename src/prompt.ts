// The one prompt. It is identical for every model, is never templated per
// provider, and its sha256 is recorded on every run as prompt_hash. Changing a
// character here changes the prompt hash and makes older runs incomparable.
//
// The reply parser used to live here. It is in parse.ts now, because it is part
// of the scorer rather than part of the prompt: the report re-parses every
// stored reply with it, and it is fingerprinted as scorer_hash, not prompt_hash.

import { sha256 } from "./hash.js";
import type { Item, Retrieved } from "./types.js";

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
  "6. Field types: \"string\" is a plain string; \"number\" is a bare number with no units, no currency symbol and no thousands separators; \"date\" is YYYY-MM-DD; \"time\" is HH:MM on a 24 hour clock with no timezone; \"boolean\" is true or false; \"string[]\" is an array of strings.",
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
