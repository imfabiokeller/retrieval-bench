// Reading run directories back. results/<version>/runs/<run-id>/ holds
// items.jsonl and run.json; both the CSV and the leaderboard are generated from
// those and nothing else.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readJsonl } from "../corpus.js";
import type { ItemResult, RunMeta } from "../types.js";
import type { RunBundle } from "./rows.js";

export function resultsDir(version: string): string {
  return join(REPO_ROOT, "results", version);
}

export function runsDir(version: string): string {
  return join(resultsDir(version), "runs");
}

export function loadRuns(version: string): RunBundle[] {
  const dir = runsDir(version);
  if (!existsSync(dir)) return [];
  const bundles: RunBundle[] = [];
  for (const name of readdirSync(dir).sort()) {
    const runPath = join(dir, name, "run.json");
    const itemsPath = join(dir, name, "items.jsonl");
    if (!existsSync(runPath) || !existsSync(itemsPath)) continue;
    bundles.push({
      meta: JSON.parse(readFileSync(runPath, "utf8")) as RunMeta,
      items: readJsonl<ItemResult>(itemsPath),
    });
  }
  return bundles;
}
