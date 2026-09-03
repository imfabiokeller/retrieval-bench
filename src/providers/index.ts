// Turning a models.json entry into an AI SDK language model. Two real provider
// kinds and one offline kind, all behind the same interface so the runner never
// branches on the provider.
//
//   anthropic          @ai-sdk/anthropic, the Messages API, native streaming
//   openai-compatible  @ai-sdk/openai-compatible, any base URL plus a key
//   mock               offline, no network, no key
//
// Provider-specific request fields live in models.json under providerOptions
// and are passed through untouched, which is how DashScope gets
// enable_thinking:false and Anthropic gets thinking disabled.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { requireKey } from "../env.js";
import type { ModelEntry } from "../models.js";
import type { Item } from "../types.js";
import { createMockModel } from "./mock.js";

export interface ModelFactory {
  /** A model for one item. The real providers ignore the item; the mocks answer from it. */
  forItem(item: Item): LanguageModel;
  /** True when running this model spends money. */
  billable: boolean;
}

export function createModelFactory(entry: ModelEntry): ModelFactory {
  switch (entry.provider) {
    case "mock": {
      if (entry.modelId !== "oracle" && entry.modelId !== "null") {
        throw new Error(`unknown mock model "${entry.modelId}"`);
      }
      const kind = entry.modelId;
      return { forItem: (item) => createMockModel(kind, item), billable: false };
    }
    case "anthropic": {
      const apiKey = requireKey(entry.apiKeyEnv ?? "ANTHROPIC_API_KEY");
      const provider = createAnthropic({ apiKey });
      const model = provider(entry.modelId);
      return { forItem: () => model, billable: true };
    }
    case "openai-compatible": {
      if (!entry.baseURL) throw new Error(`model "${entry.name}" needs a baseURL`);
      const apiKey = requireKey(entry.apiKeyEnv ?? "OPENAI_API_KEY");
      const provider = createOpenAICompatible({
        name: entry.providerName ?? entry.name,
        baseURL: entry.baseURL,
        apiKey,
      });
      const model = provider(entry.modelId);
      return { forItem: () => model, billable: true };
    }
    default: {
      const unknown: never = entry.provider;
      throw new Error(`unknown provider ${String(unknown)}`);
    }
  }
}
