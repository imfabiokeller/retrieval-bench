// Offline mock models. They implement the AI SDK language model interface, so
// the runner has exactly one code path: the same streamText call, the same
// parser, the same scorer, the same results files.
//
//   oracle  emits the gold pack. A correct harness scores 100% on every channel
//           and every family.
//   null    emits the abstain pack: not_in_evidence, a null value, no history
//           and no sources. That is the abstain baseline, and it is 100% on the
//           abstain family and 0% everywhere else.

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { Pack, Question } from "../types.js";

export type MockKind = "oracle" | "null";

export function mockAnswer(kind: MockKind, question: Question): Pack {
  if (kind === "oracle") {
    const { status, value, history, sources } = question.gold;
    return { status, value, history, sources };
  }
  return { status: "not_in_evidence", value: null, history: [], sources: [] };
}

export function createMockModel(kind: MockKind, question: Question): LanguageModel {
  const text = JSON.stringify(mockAnswer(kind, question));
  const chunks: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "response-metadata", id: `mock-${question.id}`, modelId: kind, timestamp: new Date(0) },
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
