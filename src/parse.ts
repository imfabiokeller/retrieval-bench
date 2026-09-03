// Turning a model reply into a pack. This lives on its own because it is part
// of the scorer, not part of the prompt: `npm run report` re-parses every stored
// raw_output with this file, and `scorer_hash` is a fingerprint over it together
// with normalize.ts, score.ts and the alias table.

import type { AnswerValue, HistoryStep, Pack, Status } from "./types.js";

/**
 * Robust parse of a model reply: strips code fences and any prose around the
 * object, then takes the first balanced JSON object. Returns null when there is
 * no object to take, which counts as an incorrect answer.
 */
export function parseObject(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/^﻿/, "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), text].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const slice = firstJsonObject(candidate);
    if (slice === null) continue;
    try {
      const parsed: unknown = JSON.parse(slice);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
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

function asAnswerValue(raw: unknown): AnswerValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  // An object where a value belongs is not a value. It normalizes to nothing and
  // fails the value channel, which is what it deserves.
  return JSON.stringify(raw);
}

/**
 * A missing or unrecognised status is recorded as `not_in_evidence` only when
 * the reply also carries no value: a reply that answers but forgets the key is
 * read as `answered`, so the status channel is not a second penalty for a
 * formatting slip.
 */
function asStatus(raw: unknown, value: AnswerValue): Status {
  if (typeof raw === "string") {
    const text = raw.trim().toLowerCase();
    if (text === "answered") return "answered";
    if (text === "not_in_evidence" || text === "not in evidence") return "not_in_evidence";
  }
  return value === null ? "not_in_evidence" : "answered";
}

function asHistory(raw: unknown): HistoryStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: HistoryStep[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    steps.push({ value: asAnswerValue(record.value), from: record.from === undefined || record.from === null ? "" : String(record.from) });
  }
  return steps;
}

function asSources(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim().length === 0 ? [] : [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry === "string" || typeof entry === "number")
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

/** The whole reply as a pack, or null when there was no JSON object to read. */
export function parsePack(raw: string): Pack | null {
  const object = parseObject(raw);
  if (object === null) return null;
  const value = asAnswerValue(object.value);
  return {
    status: asStatus(object.status, value),
    value,
    history: asHistory(object.history),
    sources: asSources(object.sources),
  };
}
