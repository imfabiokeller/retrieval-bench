// The runner. One question, one retrieval, one model call, one deterministic
// score over four channels.
//
// The only thing that changes between two runs is the model. The corpus, the
// index, the retrieval parameters, the prompt and the scorer are all fixed and
// fingerprinted, so a difference between two rows is a difference between two
// models, not between two harnesses.

import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { costUsd } from "./cost.js";
import type { ModelEntry } from "./models.js";
import type { Aliases } from "./normalize.js";
import { parsePack } from "./parse.js";
import { PROMPT_HASH, SYSTEM_PROMPT, renderPrompt } from "./prompt.js";
import { Retriever } from "./retrieve.js";
import { scorePack } from "./score.js";
import type { ItemResult, Question, RetrievalParams, Retrieved, RunParams } from "./types.js";

export const DEFAULT_TEMPERATURE = 0;
// One output budget for every model. It is large so that no model is cut off by the
// harness; a reply that still hits it is unparseable and counted as such.
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export { PROMPT_HASH };

export interface CallOutcome {
  text: string;
  ttftMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensReasoning: number | null;
  tokensCached: number | null;
  finishReason: string | null;
  /** The model id the provider reported on the reply, which is the id actually served. */
  servedModelId: string | null;
  error: string | null;
}

/** One streamed call. Time to first token is the wall clock to the first text delta. */
export async function callModel(
  model: LanguageModel,
  prompt: string,
  entry: ModelEntry,
  params: RunParams,
): Promise<CallOutcome> {
  const started = Date.now();
  let ttftMs: number | null = null;
  let text = "";
  try {
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: params.max_tokens,
      maxRetries: 2,
      ...(params.temperature === null ? {} : { temperature: params.temperature }),
      ...(entry.providerOptions ? { providerOptions: entry.providerOptions } : {}),
    });
    for await (const delta of result.textStream) {
      if (ttftMs === null) ttftMs = Date.now() - started;
      text += delta;
    }
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const response = await result.response;
    return {
      servedModelId: response.modelId ?? null,
      text,
      ttftMs,
      tokensIn: usage.inputTokens ?? null,
      tokensOut: usage.outputTokens ?? null,
      tokensReasoning: usage.outputTokenDetails?.reasoningTokens ?? null,
      tokensCached: usage.inputTokenDetails?.cacheReadTokens ?? null,
      finishReason,
      error: null,
    };
  } catch (error) {
    return {
      text,
      ttftMs,
      tokensIn: null,
      tokensOut: null,
      tokensReasoning: null,
      tokensCached: null,
      finishReason: null,
      servedModelId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface RunItemContext {
  retriever: Retriever;
  queryVectors: Map<string, ArrayLike<number>>;
  aliases: Aliases;
  entry: ModelEntry;
  params: RunParams;
  modelFor: (question: Question) => LanguageModel;
}

export function retrieveFor(context: RunItemContext, question: Question, params: RetrievalParams): Retrieved[] {
  return context.retriever.retrieve(question.question, context.queryVectors.get(question.id), params);
}

/**
 * Whether every gold source of this question had a chunk in the window. Null
 * when the question has no gold sources, which is every abstain question. The
 * corpus is written until this is true everywhere, so on a published run it is
 * a gate that already passed rather than a number to read.
 */
export function guaranteeMet(retrievedDocIds: string[], goldSources: string[]): boolean | null {
  if (goldSources.length === 0) return null;
  const retrieved = new Set(retrievedDocIds);
  return goldSources.every((id) => retrieved.has(id));
}

export async function runItem(context: RunItemContext, question: Question): Promise<ItemResult> {
  const retrieved = retrieveFor(context, question, context.params);
  const prompt = renderPrompt(question, retrieved);
  const model = context.modelFor(question);

  const started = Date.now();
  let outcome = await callModel(model, prompt, context.entry, context.params);
  let parsed = outcome.error === null ? parsePack(outcome.text) : null;
  let retries = 0;
  if (parsed === null) {
    // One retry, and only one. An unparseable answer twice is an incorrect answer.
    retries = 1;
    outcome = await callModel(model, prompt, context.entry, context.params);
    parsed = outcome.error === null ? parsePack(outcome.text) : null;
  }
  const latencyMs = Date.now() - started;

  const retrievedDocIds = [...new Set(retrieved.map((entry) => entry.chunk.doc_id))];
  const scored = scorePack(parsed, question.gold, question.answer_type, context.aliases);
  const tokensIn = outcome.tokensIn ?? 0;
  const tokensOut = outcome.tokensOut ?? 0;
  const tokensCached = outcome.tokensCached ?? 0;

  return {
    item_id: question.id,
    family: question.family,
    traps: question.traps,
    question: question.question,
    answer_type: question.answer_type,
    retrieved_chunk_ids: retrieved.map((entry) => entry.chunk.id),
    retrieved_doc_ids: retrievedDocIds,
    guarantee_met: guaranteeMet(retrievedDocIds, question.gold.sources),
    prompt,
    raw_output: outcome.text,
    parsed,
    gold: question.gold,
    scored,
    latency_ms: latencyMs,
    ttft_ms: outcome.ttftMs,
    tokens_in: outcome.tokensIn,
    tokens_out: outcome.tokensOut,
    tokens_reasoning: outcome.tokensReasoning,
    tokens_cached: outcome.tokensCached,
    cost_usd: costUsd(context.entry, { tokensIn, tokensOut, tokensCached }),
    retries,
    finish_reason: outcome.finishReason,
    served_model_id: outcome.servedModelId,
    error: outcome.error,
  };
}

export function runParamsFor(entry: ModelEntry, retrieval: RetrievalParams): RunParams {
  return {
    ...retrieval,
    temperature: entry.omitTemperature ? null : DEFAULT_TEMPERATURE,
    max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
}
