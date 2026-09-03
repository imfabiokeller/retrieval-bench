import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CostCapError, MAX_PROJECTED_USD, costUsd, enforceCap, estimateTokens, project } from "../src/cost.js";
import { isPriced, loadModels } from "../src/models.js";
import type { ModelEntry } from "../src/models.js";

const priced: ModelEntry = {
  name: "priced",
  provider: "anthropic",
  modelId: "priced",
  pricing: { input_per_mtok: 5, output_per_mtok: 25, cached_input_per_mtok: 0.5 },
  pricing_verified: "2026-09-03",
};

const unpriced: ModelEntry = {
  ...priced,
  name: "unpriced",
  pricing: { input_per_mtok: null, output_per_mtok: null, cached_input_per_mtok: null },
  pricing_verified: null,
};

test("tokens are estimated as characters over four", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens(""), 0);
});

test("cost bills uncached input, cached input and output at their own rates", () => {
  assert.equal(costUsd(priced, { tokensIn: 1_000_000, tokensOut: 0, tokensCached: 0 }), 5);
  assert.equal(costUsd(priced, { tokensIn: 0, tokensOut: 1_000_000, tokensCached: 0 }), 25);
  assert.equal(costUsd(priced, { tokensIn: 1_000_000, tokensOut: 0, tokensCached: 1_000_000 }), 0.5);
});

test("an unverified cached rate falls back to the full input rate, an upper bound", () => {
  const noCacheRate: ModelEntry = { ...priced, pricing: { ...priced.pricing, cached_input_per_mtok: null } };
  assert.equal(costUsd(noCacheRate, { tokensIn: 1_000_000, tokensOut: 0, tokensCached: 1_000_000 }), 5);
});

test("cost is null when the model has no verified price", () => {
  assert.equal(costUsd(unpriced, { tokensIn: 1000, tokensOut: 100, tokensCached: 0 }), null);
  assert.equal(isPriced(unpriced), false);
  assert.equal(isPriced(priced), true);
});

test("a projection counts the system prompt once per item", () => {
  const projection = project(priced, ["a".repeat(400), "b".repeat(400)], "s".repeat(400), 512);
  assert.equal(projection.itemCount, 2);
  assert.equal(projection.promptTokens, 400);
  assert.equal(projection.outputTokens, 1024);
});

test("the cap refuses a run over five dollars and lets --force through", () => {
  const overCap = project(priced, [" ".repeat(8_000_000)], "", 0);
  assert.ok((overCap.usd ?? 0) > MAX_PROJECTED_USD);
  assert.throws(() => enforceCap(overCap, false), CostCapError);
  assert.doesNotThrow(() => enforceCap(overCap, true));
});

test("the cap lets a run under five dollars through, and never blocks an unpriced model", () => {
  assert.doesNotThrow(() => enforceCap(project(priced, ["short"], "", 10), false));
  assert.doesNotThrow(() => enforceCap(project(unpriced, [" ".repeat(8_000_000)], "", 512), false));
});

test("every models.json entry is complete enough to run", () => {
  for (const entry of loadModels()) {
    assert.ok(entry.name.length > 0, "a model needs a name");
    assert.ok(["anthropic", "openai-compatible", "mock"].includes(entry.provider), `${entry.name}: bad provider`);
    assert.ok(entry.modelId.length > 0, `${entry.name}: no modelId`);
    if (entry.provider === "openai-compatible") {
      assert.ok(entry.baseURL, `${entry.name}: openai-compatible needs a baseURL`);
      assert.ok(entry.apiKeyEnv, `${entry.name}: openai-compatible needs an apiKeyEnv`);
    }
    if (entry.provider === "anthropic") assert.ok(entry.apiKeyEnv, `${entry.name}: anthropic needs an apiKeyEnv`);
    if (isPriced(entry)) assert.ok(entry.pricing_verified, `${entry.name}: a priced model needs pricing_verified`);
  }
});
