// Version fingerprints. A leaderboard row is only comparable with another row
// when the corpus version, the pipeline hash and the prompt hash all match, so
// all three are recorded on every run and printed in the report.
//
// Three fingerprints, because the three things they cover fail differently:
//
//   pipeline_hash  the read arm: what evidence the model was shown. Recorded at
//                  run time, because it cannot be replayed after the fact.
//   prompt_hash    the system prompt, recorded at run time for the same reason.
//   params_hash    the four retrieval parameters. Recorded at run time; two runs
//                  that read a different number of chunks are not one row.
//   scorer_hash    the parser, the normalizer, the scorer and the alias table:
//                  everything that turns a stored reply into a score. Computed
//                  at report time, because the report re-scores every stored run
//                  with the current scorer, so it belongs to the report and not
//                  to the run.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./corpus.js";
import type { RetrievalParams } from "./types.js";

/** Retrieval only: what the model was shown. Changing one of these is a new corpus version. */
export const PIPELINE_SOURCES = ["src/bm25.ts", "src/chunk.ts", "src/retrieve.ts", "src/rrf.ts"];

/** Scoring only: how a stored reply becomes a score. Changing one of these re-scores every run. */
export const SCORER_SOURCES = ["src/parse.ts", "src/normalize.ts", "src/score.ts"];

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function hashFiles(relativePaths: string[]): string {
  const hash = createHash("sha256");
  for (const relative of relativePaths) {
    hash.update(relative);
    hash.update(" ");
    hash.update(readFileSync(join(REPO_ROOT, relative), "utf8"));
    hash.update(" ");
  }
  return hash.digest("hex").slice(0, 16);
}

export function pipelineHash(): string {
  return hashFiles(PIPELINE_SOURCES);
}

/** The alias table is per corpus version, so the scorer hash is too. */
export function scorerHash(version: string): string {
  return hashFiles([...SCORER_SOURCES, `corpus/${version}/aliases.json`]);
}

export function gitCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** The read arm, written out in full. Two runs are comparable only when these four numbers match. */
export function paramsLabel(params: RetrievalParams): string {
  return (
    `top_n ${params.top_n}, rrf_k ${params.rrf_k}, ` +
    `recency_weight ${params.recency_weight}, max_chunks_per_doc ${params.max_chunks_per_doc}`
  );
}

/** A short fingerprint of the same four numbers, so a leaderboard row identifies its own read arm. */
export function paramsHash(params: RetrievalParams): string {
  return sha256(paramsLabel(params)).slice(0, 8);
}
