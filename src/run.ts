// The runner. One item, one retrieval, one model call, one deterministic score.
//
// The only thing that changes between two runs is the model. The corpus, the
// index, the retrieval parameters, the prompt and the scorer are all fixed and
// fingerprinted, so a difference between two rows is a difference between two
// models, not between two harnesses.

import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { costUsd } from "./cost.js";
import { goldDocIdsOf } from "./fields.js";
import type { ModelEntry } from "./models.js";
import type { Aliases } from "./normalize.js";
import { parseObject } from "./parse.js";
import { PROMPT_HASH, SYSTEM_PROMPT, renderPrompt } from "./prompt.js";
import { Retriever, retrievalHit } from "./retrieve.js";
import { scoreItem } from "./score.js";
import type { Item, ItemResult, RetrievalParams, Retrieved, RunParams } from "./types.js";

export const DEFAULT_TEMPERATURE = 0;
export const DEFAULT_MAX_OUTPUT_TOKENS = 512;

export { PROMPT_HASH };

export interface CallOutcome {
  text: string;
  ttftMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensReasoning: number | null;
  tokensCached: number | null;
  finishReason: string | null;
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
    return {
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
  modelFor: (item: Item) => LanguageModel;
}

export function retrieveFor(context: RunItemContext, item: Item, params: RetrievalParams): Retrieved[] {
  return context.retriever.retrieve(item.question, context.queryVectors.get(item.id), params);
}

export async function runItem(context: RunItemContext, item: Item): Promise<ItemResult> {
  const retrieved = retrieveFor(context, item, context.params);
  const prompt = renderPrompt(item, retrieved);
  const model = context.modelFor(item);

  const started = Date.now();
  let outcome = await callModel(model, prompt, context.entry, context.params);
  let parsed = outcome.error === null ? parseObject(outcome.text) : null;
  let retries = 0;
  if (parsed === null) {
    // One retry, and only one. An unparseable answer twice is an incorrect answer.
    retries = 1;
    outcome = await callModel(model, prompt, context.entry, context.params);
    parsed = outcome.error === null ? parseObject(outcome.text) : null;
  }
  const latencyMs = Date.now() - started;

  const retrievedDocIds = [...new Set(retrieved.map((entry) => entry.chunk.doc_id))];
  const scored = scoreItem(item, parsed, context.aliases, retrievedDocIds);
  const tokensIn = outcome.tokensIn ?? 0;
  const tokensOut = outcome.tokensOut ?? 0;
  const tokensCached = outcome.tokensCached ?? 0;

  return {
    item_id: item.id,
    axis: item.axis,
    twin_of: item.twin_of ?? null,
    question: item.question,
    retrieved_chunk_ids: retrieved.map((entry) => entry.chunk.id),
    retrieved_doc_ids: retrievedDocIds,
    retrieval_hit: retrievalHit(retrieved, goldDocIdsOf(item)),
    prompt,
    raw_output: outcome.text,
    parsed,
    expected: item.expected,
    fields: scored.fields,
    correct: scored.correct,
    latency_ms: latencyMs,
    ttft_ms: outcome.ttftMs,
    tokens_in: outcome.tokensIn,
    tokens_out: outcome.tokensOut,
    tokens_reasoning: outcome.tokensReasoning,
    tokens_cached: outcome.tokensCached,
    cost_usd: costUsd(context.entry, { tokensIn, tokensOut, tokensCached }),
    retries,
    finish_reason: outcome.finishReason,
    error: outcome.error,
  };
}

export function runParamsFor(entry: ModelEntry, retrieval: RetrievalParams): RunParams {
  return {
    ...retrieval,
    temperature: entry.omitTemperature ? null : DEFAULT_TEMPERATURE,
    max_tokens: entry.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}
