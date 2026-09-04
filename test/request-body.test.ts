// What actually goes on the wire. models.json carries provider-specific request
// fields under providerOptions, and the only thing that makes them matter is
// whether they reach the JSON request body. These tests capture the outgoing
// request against a mock endpoint and assert on the body itself, so a provider
// package that stopped forwarding those fields fails here rather than silently
// costing a paid run its whole output budget on reasoning.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findModel } from "../src/models.js";
import type { ModelEntry } from "../src/models.js";
import { createModelFactory } from "../src/providers/index.js";
import { callModel, runParamsFor } from "../src/run.js";
import { RETRIEVAL_DEFAULTS } from "../src/retrieve.js";

const KEY_ENV = "RETRIEVAL_BENCH_TEST_KEY";
process.env[KEY_ENV] = "test-key-not-a-real-one";

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

type FetchArgs = Parameters<typeof globalThis.fetch>;

/** An OpenAI-shaped streaming response, plus the request body it was asked with. */
function capturingFetch(captured: Captured[], reasoningTokens: number | null): typeof globalThis.fetch {
  return (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
    captured.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    const usage: Record<string, unknown> = { prompt_tokens: 100, completion_tokens: 20 };
    if (reasoningTokens !== null) usage.completion_tokens_details = { reasoning_tokens: reasoningTokens };
    const events = [
      { id: "1", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta: { role: "assistant", content: '{"value":1}' }, finish_reason: null }] },
      { id: "1", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage },
    ];
    const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
}

async function callWith(
  entry: ModelEntry,
  reasoningTokens: number | null = null,
): Promise<{ captured: Captured[]; outcome: Awaited<ReturnType<typeof callModel>> }> {
  const captured: Captured[] = [];
  const factory = createModelFactory(entry, { fetch: capturingFetch(captured, reasoningTokens) });
  const params = runParamsFor(entry, RETRIEVAL_DEFAULTS);
  const outcome = await callModel(factory.forItem({} as never), "QUESTION\nwhat?", entry, params);
  return { captured, outcome };
}

function testEntry(overrides: Partial<ModelEntry>): ModelEntry {
  return {
    name: "test-model",
    provider: "openai-compatible",
    providerName: "testprovider",
    modelId: "test-model-v1",
    baseURL: "https://api.example.invalid/v1",
    apiKeyEnv: KEY_ENV,
    pricing: { input_per_mtok: 1, output_per_mtok: 1, cached_input_per_mtok: null },
    pricing_verified: "2026-09-03",
    ...overrides,
  };
}

test("providerOptions keys reach the openai-compatible request body verbatim", async () => {
  const entry = testEntry({
    providerOptions: { testprovider: { thinking: { type: "disabled" }, enable_thinking: false, some_flag: 7 } },
  });
  const { captured } = await callWith(entry);
  const body = captured[0]?.body;
  assert.ok(body, "no request was captured");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.enable_thinking, false);
  assert.equal(body.some_flag, 7);
  assert.equal(body.model, "test-model-v1");
  assert.equal(body.max_tokens, 320);
  assert.equal(body.temperature, 0);
  assert.equal(captured[0]?.url, "https://api.example.invalid/v1/chat/completions");
});

test("providerOptions under another provider's name are not sent", async () => {
  const entry = testEntry({ providerOptions: { someoneelse: { thinking: { type: "disabled" } } } });
  const { captured } = await callWith(entry);
  assert.equal(captured[0]?.body.thinking, undefined, "a key under the wrong provider name must not leak into the body");
});

test("a model with no providerOptions sends only the fixed parameters", async () => {
  const { captured } = await callWith(testEntry({}));
  const body = captured[0]?.body ?? {};
  assert.equal(body.thinking, undefined);
  assert.equal(body.enable_thinking, undefined);
  assert.equal(body.temperature, 0);
});

test("an omitTemperature model sends no temperature at all", async () => {
  const { captured } = await callWith(testEntry({ omitTemperature: true }));
  assert.ok(!("temperature" in (captured[0]?.body ?? {})), "temperature must be absent, not null");
});

test("the deepseek entry in models.json sends its thinking flag", async () => {
  const entry = { ...findModel("deepseek-v4-flash"), apiKeyEnv: KEY_ENV };
  const { captured } = await callWith(entry);
  assert.deepEqual(captured[0]?.body.thinking, { type: "disabled" }, "deepseek must be asked for the non-thinking model");
});

test("the qwen entry in models.json sends enable_thinking false", async () => {
  const entry = { ...findModel("qwen3.8-max-0902"), apiKeyEnv: KEY_ENV };
  const { captured } = await callWith(entry);
  assert.equal(captured[0]?.body.enable_thinking, false, "dashscope must be asked for the non-thinking model");
});

test("reasoning tokens are read off the usage details the endpoint reports", async () => {
  const withReasoning = await callWith(testEntry({}), 64);
  assert.equal(withReasoning.outcome.tokensReasoning, 64);
  assert.equal(withReasoning.outcome.tokensOut, 20, "reasoning tokens are part of the output tokens, not extra");

  const withoutReasoning = await callWith(testEntry({}), null);
  assert.equal(withoutReasoning.outcome.tokensReasoning, 0, "an endpoint that reports no split reports zero");
});
