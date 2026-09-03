// The four channels, and the rules that decide each one. These are the whole
// scorer: there is no judge anywhere behind them.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases } from "../src/corpus.js";
import { parsePack } from "../src/parse.js";
import { scorePack, scoreSources } from "../src/score.js";
import type { Gold, Pack } from "../src/types.js";

const aliases = loadAliases("v1");

function gold(overrides: Partial<Gold> = {}): Gold {
  return {
    status: "answered",
    value: 165,
    history: [],
    history_scored: false,
    sources: ["slack-eng-core-003"],
    ...overrides,
  };
}

function pack(overrides: Partial<Pack> = {}): Pack {
  return { status: "answered", value: 165, history: [], sources: ["slack-eng-core-003"], ...overrides };
}

test("a pack that matches the gold is correct on every channel", () => {
  const scored = scorePack(pack(), gold(), "number", aliases);
  assert.equal(scored.value.correct, true);
  assert.equal(scored.status.correct, true);
  assert.equal(scored.sources.correct, true);
  assert.equal(scored.history.scored, false, "history is not scored when the gold declares no chain");
  assert.equal(scored.fully_correct, true);
});

test("the value channel normalizes both sides before comparing", () => {
  assert.equal(scorePack(pack({ value: "165 ms" }), gold(), "number", aliases).value.correct, true);
  assert.equal(scorePack(pack({ value: 150 }), gold(), "number", aliases).value.correct, false);
  const named = gold({ value: "Ravi Iyer" });
  assert.equal(scorePack(pack({ value: "Iyer" }), named, "string", aliases).value.correct, true);
  assert.equal(scorePack(pack({ value: "Ravi" }), named, "string", aliases).value.correct, false, "a shared first name is not an answer");
});

test("the sources channel wants every cited id to be gold and at least one gold cited", () => {
  assert.deepEqual(scoreSources(["a"], ["a", "b"]), { correct: true, recall: 0.5 });
  assert.deepEqual(scoreSources(["a", "b"], ["a", "b"]), { correct: true, recall: 1 });
  assert.deepEqual(scoreSources(["a", "z"], ["a", "b"]), { correct: false, recall: 0.5 }, "one wrong citation fails the channel");
  assert.deepEqual(scoreSources([], ["a"]), { correct: false, recall: 0 }, "citing nothing fails when there is something to cite");
});

test("an abstain gold cites nothing, so citing anything fails", () => {
  const abstain = gold({ status: "not_in_evidence", value: null, sources: [] });
  const right = scorePack({ status: "not_in_evidence", value: null, history: [], sources: [] }, abstain, "number", aliases);
  assert.equal(right.fully_correct, true);
  assert.equal(right.sources_recall, null, "there is no recall to report when the gold cites nothing");

  const cited = scorePack({ status: "not_in_evidence", value: null, history: [], sources: ["slack-eng-core-003"] }, abstain, "number", aliases);
  assert.equal(cited.sources.correct, false);
  assert.equal(cited.fully_correct, false);
});

test("the history channel compares the chain as a set of value and date pairs", () => {
  const chain = gold({
    history_scored: true,
    history: [
      { value: 190, from: "2027-01-12" },
      { value: 165, from: "2027-03-24" },
      { value: 150, from: "2027-05-04" },
    ],
    value: 150,
  });
  const answer = (history: Array<{ value: unknown; from: string }>): Pack =>
    pack({ value: 150, history: history as Pack["history"] });

  assert.equal(scorePack(answer([...chain.history].reverse()), chain, "number", aliases).history.correct, true, "order does not matter");
  assert.equal(
    scorePack(answer([{ value: 190, from: "2027-01-12" }, { value: 150, from: "2027-05-04" }]), chain, "number", aliases).history.correct,
    false,
    "a missing step fails",
  );
  assert.equal(
    scorePack(answer([...chain.history, { value: 190, from: "2027-04-08" }]), chain, "number", aliases).history.correct,
    false,
    "a stale repeat entered as a new step fails",
  );
  assert.equal(
    scorePack(answer([{ value: 190, from: "12 January 2027" }, { value: 165, from: "2027-03-24" }, { value: 150, from: "2027-05-04" }]), chain, "number", aliases).history.correct,
    true,
    "a from date is normalized like any other date",
  );
});

test("a pack is fully correct only when every scored channel is", () => {
  const chain = gold({ history_scored: true, history: [{ value: 1, from: "2027-01-01" }, { value: 2, from: "2027-02-01" }], value: 2 });
  const almost = scorePack(pack({ value: 2, history: [{ value: 2, from: "2027-02-01" }] }), chain, "number", aliases);
  assert.equal(almost.value.correct, true);
  assert.equal(almost.history.correct, false);
  assert.equal(almost.fully_correct, false);
});

test("a reply that is not an object is wrong on every channel, abstain included", () => {
  const abstain = gold({ status: "not_in_evidence", value: null, sources: [] });
  const scored = scorePack(parsePack("I am sorry, I cannot help with that."), abstain, "number", aliases);
  assert.equal(scored.value.correct, false);
  assert.equal(scored.status.correct, false);
  assert.equal(scored.sources.correct, false);
  assert.equal(scored.fully_correct, false);
});
