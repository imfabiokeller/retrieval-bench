// Loading the frozen corpus. Nothing here writes.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Aliases } from "./normalize.js";
import type { Doc, Question, RetrievalParams } from "./types.js";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function corpusDir(version: string): string {
  return join(REPO_ROOT, "corpus", version);
}

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function loadDocs(version: string): Doc[] {
  return readJsonl<Doc>(join(corpusDir(version), "docs.jsonl"));
}

export function loadQuestions(version: string): Question[] {
  return readJsonl<Question>(join(corpusDir(version), "items.jsonl"));
}

export function loadAliases(version: string): Aliases {
  const raw = JSON.parse(readFileSync(join(corpusDir(version), "aliases.json"), "utf8")) as {
    aliases: Aliases;
  };
  return raw.aliases;
}

/**
 * Retrieval parameters belong to the corpus version, not to the harness: the
 * window has to be wide enough for the guarantee on that corpus and narrow
 * enough for the cost cap on it. corpus/<version>/params.json holds them, and a
 * version without that file falls back to the defaults in retrieve.ts.
 */
export function loadRetrievalParams(version: string, fallback: RetrievalParams): RetrievalParams {
  const path = join(corpusDir(version), "params.json");
  if (!existsSync(path)) return fallback;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<RetrievalParams>;
  for (const key of ["top_n", "rrf_k", "recency_weight", "max_chunks_per_doc"] as const) {
    if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) {
      throw new Error(`corpus/${version}/params.json: ${key} is missing or not a number`);
    }
  }
  return {
    top_n: raw.top_n as number,
    rrf_k: raw.rrf_k as number,
    recency_weight: raw.recency_weight as number,
    max_chunks_per_doc: raw.max_chunks_per_doc as number,
  };
}
