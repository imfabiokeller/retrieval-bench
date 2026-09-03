// Offline mock models. They implement the AI SDK language model interface, so
// the runner has exactly one code path: the same streamText call, the same
// parser, the same scorer, the same results files.
//
//   oracle  emits the gold object. A correct harness scores 100% on every axis.
//   null    emits null for every field. That is the abstain baseline: 100% on
//           the abstain axis and 0% everywhere else.
//
// A `stale` mock, which would answer supersession items with the superseded
// value, is deliberately absent: corpus v1 does not record a machine-readable
// superseded value per item, so a stale mock could only be produced by guessing,
// and a guessing baseline is not a baseline.

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { FieldValue, Item } from "../types.js";

export type MockKind = "oracle" | "null";

export function mockAnswer(kind: MockKind, item: Item): Record<string, FieldValue> {
  if (kind === "oracle") return item.expected;
  const answer: Record<string, FieldValue> = {};
  for (const field of item.schema.required) answer[field] = null;
  return answer;
}

export function createMockModel(kind: MockKind, item: Item): LanguageModel {
  const text = JSON.stringify(mockAnswer(kind, item));
  const chunks: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "response-metadata", id: `mock-${item.id}`, modelId: kind, timestamp: new Date(0) },
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: text },
    { type: "text-end", id: "0" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    },
  ];
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: kind,
    doStream: async () => ({
      stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks }),
    }),
  });
}
