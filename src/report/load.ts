// Reading run directories back. results/<version>/runs/<run-id>/ holds
// items.jsonl and run.json; both the CSV and the leaderboard are generated from
// those and nothing else.
//
// Every run is re-scored on the way in. The stored raw model replies are the
// source of truth, and the current parser, normalizer, scorer and alias table
// are applied to them, so fixing the scorer never costs a paid re-run. The score
// the run itself recorded stays in run.json as pack_accuracy_at_run, and the
// report says so when the two differ.
//
// Cost is re-derived the same way: the stored token counts are priced with the
// pricing models.json holds now, so a price that gets verified later reaches
// every stored run. A run whose model is no longer listed keeps its stored cost.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, loadAliases, loadQuestions, readJsonl } from "../corpus.js";
import { costUsd } from "../cost.js";
import { loadModels } from "../models.js";
import type { ItemResult, Question, RunMeta } from "../types.js";
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

  const corpus = new Map<string, Question>(loadQuestions(version).map((question) => [question.id, question]));
  const aliases = loadAliases(version);
  const models = new Map(loadModels().map((entry) => [entry.name, entry]));

  const bundles: RunBundle[] = [];
  for (const name of readdirSync(dir).sort()) {
    const runPath = join(dir, name, "run.json");
    const itemsPath = join(dir, name, "items.jsonl");
    if (!existsSync(runPath) || !existsSync(itemsPath)) continue;
    const meta = JSON.parse(readFileSync(runPath, "utf8")) as RunMeta;
    const rescored = rescoreItems(readJsonl<ItemResult>(itemsPath), corpus, aliases);
    const entry = models.get(meta.model_name);
    if (entry) {
      for (const item of rescored.items) {
        if (item.tokens_in === null || item.tokens_out === null) continue;
        item.cost_usd = costUsd(entry, {
          tokensIn: item.tokens_in,
          tokensOut: item.tokens_out,
          tokensCached: item.tokens_cached ?? 0,
        });
      }
    }
    bundles.push({ meta, items: rescored.items, unknownItems: rescored.unknown });
  }
  return bundles;
}
