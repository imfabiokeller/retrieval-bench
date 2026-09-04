// Cost estimation and the spend cap.
//
// The cap is a hard stop on actual spend: a run that has cost more than
// MAX_PROJECTED_USD from the provider's own token counts stops there, is marked
// incomplete, and stays out of the leaderboard. Before a run the harness also
// estimates input tokens as characters / 4 over the exact prompts it is about to
// send, plus the output budget per item, and refuses to start when the input side
// alone, which is certain spend, is already over the cap, unless it is given
// --force.

import type { ModelEntry } from "./models.js";

export const MAX_PROJECTED_USD = 5.0;
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface CostInput {
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
}

/** Returns null when the model has no verified input or output price. */
export function costUsd(entry: ModelEntry, usage: CostInput): number | null {
  const { input_per_mtok, output_per_mtok, cached_input_per_mtok } = entry.pricing;
  if (input_per_mtok === null || output_per_mtok === null) return null;
  const cachedRate = cached_input_per_mtok ?? input_per_mtok;
  const uncached = Math.max(0, usage.tokensIn - usage.tokensCached);
  return (
    (uncached * input_per_mtok) / 1e6 +
    (usage.tokensCached * cachedRate) / 1e6 +
    (usage.tokensOut * output_per_mtok) / 1e6
  );
}

export interface Projection {
  itemCount: number;
  promptTokens: number;
  outputTokens: number;
  usd: number | null;
  /** The input side of the projection, which is spent whatever the model writes. */
  inputUsd: number | null;
}

export function project(entry: ModelEntry, prompts: string[], systemPrompt: string, maxOutputTokens: number): Projection {
  const systemTokens = estimateTokens(systemPrompt);
  const promptTokens = prompts.reduce((total, prompt) => total + estimateTokens(prompt) + systemTokens, 0);
  const outputTokens = prompts.length * maxOutputTokens;
  return {
    itemCount: prompts.length,
    promptTokens,
    outputTokens,
    usd: costUsd(entry, { tokensIn: promptTokens, tokensOut: outputTokens, tokensCached: 0 }),
    inputUsd: costUsd(entry, { tokensIn: promptTokens, tokensOut: 0, tokensCached: 0 }),
  };
}

export class CostCapError extends Error {
  constructor(usd: number) {
    super(
      `the input side alone projects $${usd.toFixed(2)}, over the $${MAX_PROJECTED_USD.toFixed(2)} cap. ` +
        `Re-run with --force if that is what you want.`,
    );
    this.name = "CostCapError";
  }
}

export function enforceCap(projection: Projection, force: boolean): void {
  if (force) return;
  if (projection.inputUsd !== null && projection.inputUsd > MAX_PROJECTED_USD) {
    throw new CostCapError(projection.inputUsd);
  }
}
