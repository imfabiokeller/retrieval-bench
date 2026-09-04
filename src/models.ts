// models.json: the whole model registry. Adding a model is one entry there.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JSONValue } from "@ai-sdk/provider";
import { REPO_ROOT } from "./corpus.js";

export interface Pricing {
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  cached_input_per_mtok: number | null;
}

export interface ModelEntry {
  name: string;
  provider: "anthropic" | "google" | "openai-compatible" | "mock";
  modelId: string;
  /** openai-compatible only: the provider label, also the providerOptions key. */
  providerName?: string;
  /** openai-compatible only. */
  baseURL?: string;
  apiKeyEnv?: string;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  /** Set when the provider rejects sampling parameters. */
  omitTemperature?: boolean;
  /** How thinking was set for the run: "off" when it was turned off, "low" (or another level) when the provider has no off, "none" when the model has no thinking mode. Shown on the model name in every table. */
  thinking?: string;
  pricing: Pricing;
  pricing_verified: string | null;
  notes?: string;
}

export function loadModels(): ModelEntry[] {
  const raw = JSON.parse(readFileSync(join(REPO_ROOT, "models.json"), "utf8")) as { models: ModelEntry[] };
  return raw.models;
}

export function findModel(name: string): ModelEntry {
  const entry = loadModels().find((model) => model.name === name);
  if (!entry) {
    throw new Error(`unknown model "${name}". Known models: ${loadModels().map((m) => m.name).join(", ")}`);
  }
  return entry;
}

export function isPriced(entry: ModelEntry): boolean {
  return entry.pricing.input_per_mtok !== null && entry.pricing.output_per_mtok !== null;
}
