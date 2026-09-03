// npm run bench -- --version v1 --model <name|all> [--limit N] [--force] [--allow-unpriced]
//
// Runs the fixed pipeline over every item for one model and writes
// results/<version>/runs/<run-id>/{items.jsonl,run.json}. The run id is
// YYYYMMDD-HHMM-<model>, and it is also the directory name.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAliases, loadItems } from "../corpus.js";
import { enforceCap, project } from "../cost.js";
import { gitCommit, pipelineHash } from "../hash.js";
import { loadIndex } from "../index-io.js";
import { findModel, isPriced, loadModels } from "../models.js";
import type { ModelEntry } from "../models.js";
import { PROMPT_HASH, SYSTEM_PROMPT, renderPrompt } from "../prompt.js";
import { runsDir } from "../report/load.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../retrieve.js";
import { createModelFactory } from "../providers/index.js";
import { retrieveFor, runItem, runParamsFor } from "../run.js";
import type { RunItemContext } from "../run.js";
import type { Item, ItemResult, RunMeta } from "../types.js";

interface Options {
  version: string;
  models: string[];
  limit: number | null;
  force: boolean;
  allowUnpriced: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const modelArg = value("model");
  if (modelArg === null) throw new Error("--model is required (a model name from models.json, or all)");
  const limit = value("limit");
  return {
    version: value("version") ?? "v1",
    models: modelArg === "all" ? loadModels().map((entry) => entry.name) : [modelArg],
    limit: limit === null ? null : Number(limit),
    force: argv.includes("--force"),
    allowUnpriced: argv.includes("--allow-unpriced"),
  };
}

function runId(model: string, now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `${stamp}-${model}`;
}

async function runModel(entry: ModelEntry, items: Item[], options: Options): Promise<void> {
  if (!isPriced(entry) && !options.allowUnpriced) {
    console.log(`skipping ${entry.name}: no verified pricing. Re-run with --allow-unpriced to bench it anyway.`);
    return;
  }

  let modelFor;
  try {
    modelFor = createModelFactory(entry).forItem;
  } catch (error) {
    // A missing key skips this model rather than aborting a --model all run.
    console.log(`skipping ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const index = loadIndex(options.version);
  const aliases = loadAliases(options.version);
  const retriever = new Retriever(index.chunks, index.chunkVectors);
  const params = runParamsFor(entry, RETRIEVAL_DEFAULTS);
  const context: RunItemContext = {
    retriever,
    queryVectors: index.queryVectors,
    aliases,
    entry,
    params,
    modelFor,
  };

  const prompts = items.map((item) => renderPrompt(item, retrieveFor(context, item, params)));
  const projection = project(entry, prompts, SYSTEM_PROMPT, params.max_tokens);
  console.log(
    `${entry.name}: ${projection.itemCount} items, ~${projection.promptTokens} input tokens, ` +
      `<=${projection.outputTokens} output tokens, projected ` +
      (projection.usd === null ? "cost unknown (unpriced)" : `$${projection.usd.toFixed(4)}`),
  );
  enforceCap(projection, options.force);

  const started = new Date();
  const results: ItemResult[] = [];
  for (const [position, item] of items.entries()) {
    const result = await runItem(context, item);
    results.push(result);
    if ((position + 1) % 20 === 0 || position + 1 === items.length) {
      const correct = results.filter((entry) => entry.correct).length;
      console.log(`  ${position + 1}/${items.length} items, ${correct} correct`);
    }
  }
  const finished = new Date();

  const id = runId(entry.name, started);
  const dir = join(runsDir(options.version), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "items.jsonl"), results.map((result) => JSON.stringify(result)).join("\n") + "\n");

  const scorableHits = results.filter((result) => result.retrieval_hit !== null);
  const actualCosts = results.map((result) => result.cost_usd).filter((value): value is number => value !== null);
  const meta: RunMeta = {
    run_id: id,
    model_name: entry.name,
    provider: entry.provider,
    model_id: entry.modelId,
    params,
    corpus_version: options.version,
    pipeline_hash: pipelineHash(),
    prompt_hash: PROMPT_HASH,
    git_commit: gitCommit(),
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    item_count: results.length,
    correct_count: results.filter((result) => result.correct).length,
    accuracy: results.length === 0 ? 0 : results.filter((result) => result.correct).length / results.length,
    retrieval_hit_rate:
      scorableHits.length === 0
        ? null
        : scorableHits.filter((result) => result.retrieval_hit === true).length / scorableHits.length,
    projected_cost_usd: projection.usd,
    actual_cost_usd: actualCosts.length === 0 ? null : actualCosts.reduce((total, value) => total + value, 0),
    tokens_in: results.reduce((total, result) => total + (result.tokens_in ?? 0), 0),
    tokens_out: results.reduce((total, result) => total + (result.tokens_out ?? 0), 0),
    tokens_reasoning: results.reduce((total, result) => total + (result.tokens_reasoning ?? 0), 0),
    tokens_cached: results.reduce((total, result) => total + (result.tokens_cached ?? 0), 0),
    errors: results.filter((result) => result.error !== null).length,
    retries: results.reduce((total, result) => total + result.retries, 0),
  };
  writeFileSync(join(dir, "run.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(
    `${entry.name}: accuracy ${(meta.accuracy * 100).toFixed(1)}%, ` +
      `actual cost ${meta.actual_cost_usd === null ? "unknown" : `$${meta.actual_cost_usd.toFixed(4)}`}, ` +
      `written to results/${options.version}/runs/${id}`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const all = loadItems(options.version);
  const items = options.limit === null ? all : all.slice(0, options.limit);
  for (const name of options.models) {
    await runModel(findModel(name), items, options);
  }
}

await main();
