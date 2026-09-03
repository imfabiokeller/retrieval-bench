// The one prompt. It is identical for every model, is never templated per
// provider, and its sha256 is recorded on every run as prompt_hash. Changing a
// character here changes the prompt hash and makes older runs incomparable.
//
// It is deliberately neutral. It says what the evidence looks like, what the
// reply looks like, and what each key means. It says nothing about how to weigh
// evidence: no "prefer the newest", no "a quoted line is not a statement", no
// "not_in_evidence is usually right". Every hint of that kind would be the
// benchmark answering its own questions.

import { sha256 } from "./hash.js";
import type { Question, Retrieved } from "./types.js";

export const SYSTEM_PROMPT = [
  "You answer one question about a company's internal records.",
  "",
  "You are given EVIDENCE: numbered extracts from Slack messages, issue tracker entries, emails, meeting notes and documents. Every extract starts with a header in square brackets that carries the document id, the document type, the channel or project it belongs to, the author, the date, and the title where the document has one. The document id is what you cite.",
  "",
  "Reply with a single JSON object and nothing else. No prose, no explanation, no markdown, no code fences. The object has exactly these four keys:",
  "",
  '{"status": "answered", "value": 165, "history": [{"value": 190, "from": "2027-01-12"}, {"value": 165, "from": "2027-03-24"}], "sources": ["slack-eng-core-003", "mtg-007"]}',
  "",
  '- "status" is "answered" or "not_in_evidence". It is "not_in_evidence" when the evidence does not support a value for the question.',
  '- "value" is the answer, in the ANSWER TYPE the question declares. It is null when the status is "not_in_evidence".',
  '- "history" is a list of {"value", "from"} entries. When the question is about something that changed over time, list every distinct value it has held, each with the date that value took effect, oldest first. When it never changed, or the question is not about a value that changes, use an empty list.',
  '- "sources" is a list of document ids, copied exactly from the evidence headers.',
  "",
  'Answer types: "string" is a plain string; "number" is a bare number with no units, no currency symbol and no thousands separators; "date" is YYYY-MM-DD; "time" is HH:MM on a 24 hour clock; "boolean" is true or false; "string[]" is an array of strings. A "from" date is always YYYY-MM-DD.',
  "",
  "Use only the evidence you are given.",
].join("\n");

export const PROMPT_HASH = sha256(SYSTEM_PROMPT).slice(0, 16);

export function renderEvidence(retrieved: Retrieved[]): string {
  if (retrieved.length === 0) return "(no evidence retrieved)";
  return retrieved
    .map((entry, index) => `[${index + 1}] ${entry.chunk.prefix}\n${entry.chunk.body}`)
    .join("\n\n");
}

export function renderPrompt(question: Question, retrieved: Retrieved[]): string {
  return [
    "EVIDENCE",
    renderEvidence(retrieved),
    "",
    "QUESTION",
    question.question,
    "",
    "ANSWER TYPE",
    question.answer_type,
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}
