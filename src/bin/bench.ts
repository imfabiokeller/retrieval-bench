// npm run bench -- --version v1 --model <name|all> [--runs N] [--limit N] [--only id,id,...] [--force] [--allow-unpriced]
//
// Runs the fixed pipeline over every question for one model and writes
// results/<version>/runs/<run-id>/{items.jsonl,run.json}. The run id is
// YYYYMMDD-HHMMSS-<model>, and it is also the directory name.
//
// --runs N repeats the same model N times. Every repeat is its own run
// directory, and the leaderboard shows the mean and the min to max spread of the
// runs a model has on the same corpus version and the same retrieval parameters.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAliases, loadQuestions, loadRetrievalParams } from "../corpus.js";
import { MAX_PROJECTED_USD, enforceCap, project } from "../cost.js";
import { gitCommit, paramsHash, pipelineHash } from "../hash.js";
import { loadIndex } from "../index-io.js";
import { findModel, isPriced, loadModels } from "../models.js";
import type { ModelEntry } from "../models.js";
import { PROMPT_HASH, SYSTEM_PROMPT, renderPrompt } from "../prompt.js";
import { runsDir } from "../report/load.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../retrieve.js";
import { createModelFactory } from "../providers/index.js";
import { retrieveFor, runItem, runParamsFor } from "../run.js";
import type { RunItemContext } from "../run.js";
import type { ItemResult, Question, RunMeta } from "../types.js";

interface Options {
  version: string;
  models: string[];
  runs: number;
  limit: number | null;
  /** Question ids to run, and nothing else. For patching specific replies of a stored run. */
  only: string[] | null;
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
  const runs = value("runs");
  const repeats = runs === null ? 1 : Number(runs);
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--runs takes a whole number of repeats, one or more");
  return {
    version: value("version") ?? "v1",
    models: modelArg === "all" ? loadModels().map((entry) => entry.name) : [modelArg],
    runs: repeats,
    limit: limit === null ? null : Number(limit),
    only: value("only")?.split(",").map((id) => id.trim()).filter(Boolean) ?? null,
    force: argv.includes("--force"),
    allowUnpriced: argv.includes("--allow-unpriced"),
  };
}

function runId(model: string, now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${stamp}-${model}`;
}

/** How many runs this model already has on this corpus with these parameters. Cheap: run.json only. */
function priorRuns(version: string, model: string, hash: string): number {
  const dir = runsDir(version);
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name, "run.json");
    if (!existsSync(path)) continue;
    const meta = JSON.parse(readFileSync(path, "utf8")) as RunMeta;
    if (meta.model_name === model && meta.params_hash === hash) count += 1;
  }
  return count;
}

async function runModel(entry: ModelEntry, questions: Question[], options: Options): Promise<void> {
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
  const params = runParamsFor(entry, loadRetrievalParams(options.version, RETRIEVAL_DEFAULTS));
  const context: RunItemContext = { retriever, queryVectors: index.queryVectors, aliases, entry, params, modelFor };

  const prompts = questions.map((question) => renderPrompt(question, retrieveFor(context, question, params)));
  const projection = project(entry, prompts, SYSTEM_PROMPT, params.max_tokens);
  console.log(
    `${entry.name}: ${projection.itemCount} questions, ~${projection.promptTokens} input tokens, ` +
      `<=${projection.outputTokens} output tokens, projected ` +
      (projection.usd === null ? "cost unknown (unpriced)" : `$${projection.usd.toFixed(4)}`) +
      (options.runs > 1 ? ` per run, ${options.runs} runs` : ""),
  );
  enforceCap(projection, options.force);

  const hash = paramsHash(params);
  for (let repeat = 0; repeat < options.runs; repeat += 1) {
    const started = new Date();
    const results: ItemResult[] = [];
    let spent = 0;
    let stoppedReason: string | null = null;
    for (const [position, question] of questions.entries()) {
      const result = await runItem(context, question);
      results.push(result);
      spent += result.cost_usd ?? 0;
      if (spent > MAX_PROJECTED_USD && !options.force) {
        stoppedReason = `actual spend $${spent.toFixed(2)} passed the $${MAX_PROJECTED_USD.toFixed(2)} cap after ${position + 1} questions`;
        console.log(`  stopping: ${stoppedReason}`);
        break;
      }
      if ((position + 1) % 20 === 0 || position + 1 === questions.length) {
        const correct = results.filter((item) => item.scored.fully_correct).length;
        console.log(`  ${position + 1}/${questions.length} questions, ${correct} packs fully correct`);
      }
    }
    const finished = new Date();

    const id = runId(entry.name, started);
    const dir = join(runsDir(options.version), id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "items.jsonl"), results.map((result) => JSON.stringify(result)).join("\n") + "\n");

    const fullyCorrect = results.filter((result) => result.scored.fully_correct).length;
    const actualCosts = results.map((result) => result.cost_usd).filter((value): value is number => value !== null);
    const meta: RunMeta = {
      run_id: id,
      model_name: entry.name,
      provider: entry.provider,
      model_id: entry.modelId,
      served_model_ids: [...new Set(results.map((result) => result.served_model_id).filter((id): id is string => id !== null))].sort(),
      params,
      corpus_version: options.version,
      pipeline_hash: pipelineHash(),
      prompt_hash: PROMPT_HASH,
      params_hash: hash,
      git_commit: gitCommit(),
      complete: stoppedReason === null && results.length === questions.length,
      stopped_reason: stoppedReason,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      item_count: results.length,
      run_index: priorRuns(options.version, entry.name, hash) + 1,
      packs_fully_correct_at_run: fullyCorrect,
      pack_accuracy_at_run: results.length === 0 ? 0 : fullyCorrect / results.length,
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
      `${entry.name} run ${meta.run_index}: ${(meta.pack_accuracy_at_run * 100).toFixed(1)}% of packs fully correct, ` +
        `actual cost ${meta.actual_cost_usd === null ? "unknown" : `$${meta.actual_cost_usd.toFixed(4)}`}, ` +
        `written to results/${options.version}/runs/${id}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const all = loadQuestions(options.version);
  const chosen = options.only === null ? all : all.filter((question) => options.only!.includes(question.id));
  const questions = options.limit === null ? chosen : chosen.slice(0, options.limit);
  for (const name of options.models) {
    await runModel(findModel(name), questions, options);
  }
}

await main();
