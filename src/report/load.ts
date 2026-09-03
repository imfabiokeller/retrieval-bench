// Reading run directories back. results/<version>/runs/<run-id>/ holds
// items.jsonl and run.json; both the CSV and the leaderboard are generated from
// those and nothing else.
//
// Every run is re-scored on the way in. The stored raw model replies are the
// source of truth, and the current parser, normalizer, scorer and alias table
// are applied to them, so fixing the scorer never costs a paid re-run. The score
// the run itself recorded stays in run.json as accuracy_at_run, and the report
// says so when the two differ.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, loadAliases, loadItems, readJsonl } from "../corpus.js";
import type { Item, ItemResult, RunMeta } from "../types.js";
import { rescoreItems } from "./rescore.js";
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

  const corpus = new Map<string, Item>(loadItems(version).map((item) => [item.id, item]));
  const aliases = loadAliases(version);

  const bundles: RunBundle[] = [];
  for (const name of readdirSync(dir).sort()) {
    const runPath = join(dir, name, "run.json");
    const itemsPath = join(dir, name, "items.jsonl");
    if (!existsSync(runPath) || !existsSync(itemsPath)) continue;
    const meta = JSON.parse(readFileSync(runPath, "utf8")) as RunMeta;
    const rescored = rescoreItems(readJsonl<ItemResult>(itemsPath), corpus, aliases);
    bundles.push({ meta, items: rescored.items, unknownItems: rescored.unknown });
  }
  return bundles;
}
