// The validator itself: the rules have to reject the things they exist to
// reject, or a green run means nothing.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateCoverage, validateGrounding, validateStructure } from "../src/validate.js";
import type { Doc, Question } from "../src/types.js";

const doc = (id: string, text: string): Doc => ({
  id,
  type: "slack",
  author: "Priya Raman",
  created_at: "2027-01-12T09:12:00+01:00",
  channel: "eng-core",
  text,
});

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q-1",
  family: "lookup",
  question: "What is the p99 latency budget?",
  answer_type: "number",
  traps: [],
  gold: { status: "answered", value: 165, history: [], history_scored: false, sources: ["d1"] },
  notes: "Stated once.",
  ...overrides,
});

const docs = [doc("d1", "The p99 latency budget is 165 ms."), doc("d2", "Something else entirely.")];

function problems(overrides: Partial<Question>): string[] {
  return validateStructure(docs, [question(overrides)]);
}

test("a well formed question passes", () => {
  assert.deepEqual(problems({}), []);
});

test("a gold source that does not exist is caught", () => {
  assert.ok(problems({ gold: { ...question().gold, sources: ["nope"] } }).some((p) => p.includes("nope")));
});

test("an abstain question is exactly one whose gold status is not_in_evidence", () => {
  assert.ok(problems({ family: "abstain" }).some((p) => p.includes("abstain question")));
  assert.ok(
    problems({ gold: { status: "not_in_evidence", value: null, history: [], history_scored: false, sources: [] } }).some((p) =>
      p.includes("abstain question"),
    ),
  );
  assert.deepEqual(
    problems({ family: "abstain", gold: { status: "not_in_evidence", value: null, history: [], history_scored: false, sources: [] } }),
    [],
  );
});

test("an answered gold needs a value of the declared type", () => {
  assert.ok(problems({ gold: { ...question().gold, value: null } }).some((p) => p.includes("needs a value")));
  assert.ok(problems({ gold: { ...question().gold, value: "one six five" } }).some((p) => p.includes("answer type")));
  assert.ok(problems({ answer_type: "date", gold: { ...question().gold, value: "12/01/2027" } }).some((p) => p.includes("answer type")));
});

test("a scored chain needs three steps, oldest first, with no repeated value", () => {
  const chain = (history: Array<{ value: number; from: string }>): Partial<Question> => ({
    family: "current",
    gold: { status: "answered", value: history[history.length - 1]?.value ?? 0, history, history_scored: true, sources: ["d1"] },
  });
  assert.ok(problems(chain([{ value: 1, from: "2027-01-01" }, { value: 2, from: "2027-02-01" }])).some((p) => p.includes("steps or more")));
  assert.ok(
    problems(chain([{ value: 1, from: "2027-03-01" }, { value: 2, from: "2027-02-01" }, { value: 3, from: "2027-04-01" }])).some((p) =>
      p.includes("oldest first"),
    ),
  );
  assert.ok(
    problems(chain([{ value: 1, from: "2027-01-01" }, { value: 1, from: "2027-02-01" }, { value: 3, from: "2027-03-01" }])).some((p) =>
      p.includes("same value twice"),
    ),
  );
});

test("history that is not scored has to be empty", () => {
  assert.ok(
    problems({ gold: { ...question().gold, history: [{ value: 1, from: "2027-01-01" }] } }).some((p) => p.includes("must be empty")),
  );
});

test("a multi-document family needs more than one gold source", () => {
  assert.ok(problems({ family: "join" }).some((p) => p.includes("at least two gold sources")));
});

test("grounding catches a gold value that is in no gold source", () => {
  const wrong = question({ gold: { ...question().gold, value: 999 } });
  assert.ok(validateGrounding(docs, [wrong], {}).some((p) => p.includes("not literally")));
  assert.deepEqual(validateGrounding(docs, [question()], {}), []);
});

test("grounding accepts a date written the way a person writes it", () => {
  const dated = [doc("d1", "We ship on 18 May 2027 and not before.")];
  const asked = question({
    answer_type: "date",
    gold: { status: "answered", value: "2027-05-18", history: [], history_scored: false, sources: ["d1"] },
  });
  assert.deepEqual(validateGrounding(dated, [asked], {}), []);
});

test("grounding checks that a history step is not dated before the document that states it", () => {
  const chain = question({
    family: "current",
    gold: {
      status: "answered",
      value: 165,
      history: [{ value: 165, from: "2026-01-01" }, { value: 190, from: "2027-02-01" }, { value: 200, from: "2027-03-01" }],
      history_scored: true,
      sources: ["d1"],
    },
  });
  assert.ok(validateGrounding(docs, [chain], {}).some((p) => p.includes("dated before")));
});

test("coverage reports a family or trap that is short", () => {
  const short = validateCoverage([question()]);
  assert.ok(short.some((p) => p.startsWith("family lookup")));
  assert.ok(short.some((p) => p.startsWith("trap superseded")));
  assert.ok(short.some((p) => p.includes("score a history chain")));
});
