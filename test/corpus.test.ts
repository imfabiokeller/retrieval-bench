// The frozen corpus, checked the way `npm run validate` checks it, plus the
// guarantee and the cost cap. If any of this fails the corpus is not publishable
// and the leaderboard built on it is not either.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadDocs, loadQuestions, loadRetrievalParams } from "../src/corpus.js";
import { MAX_PROJECTED_USD, project } from "../src/cost.js";
import { loadIndex } from "../src/index-io.js";
import { isPriced, loadModels } from "../src/models.js";
import { SYSTEM_PROMPT, renderPrompt } from "../src/prompt.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../src/retrieve.js";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "../src/run.js";
import {
  MIN_HISTORY_SCORED,
  MIN_PER_FAMILY,
  MIN_PER_TRAP,
  checkGuarantee,
  coverageOf,
  validateCoverage,
  validateGrounding,
  validateStructure,
} from "../src/validate.js";
import { FAMILIES, TRAPS } from "../src/types.js";

const version = "v1";
const docs = loadDocs(version);
const questions = loadQuestions(version);
const aliases = loadAliases(version);
const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);
const index = loadIndex(version);
const retriever = new Retriever(index.chunks, index.chunkVectors);

test("the corpus is structurally sound", () => {
  assert.deepEqual(validateStructure(docs, questions), []);
});

test("every gold value is readable in its own gold sources", () => {
  assert.deepEqual(validateGrounding(docs, questions, aliases), []);
});

test("every family and every trap kind is covered", () => {
  assert.deepEqual(validateCoverage(questions), []);
  const coverage = coverageOf(questions);
  for (const family of FAMILIES) assert.ok(coverage.perFamily[family] >= MIN_PER_FAMILY, `${family}: ${coverage.perFamily[family]}`);
  for (const trap of TRAPS) assert.ok(coverage.perTrap[trap] >= MIN_PER_TRAP, `${trap}: ${coverage.perTrap[trap]}`);
  assert.ok(coverage.historyScored >= MIN_HISTORY_SCORED, `${coverage.historyScored} questions score a chain`);
});

test("THE GUARANTEE: every gold source of every question is in the window", () => {
  const report = checkGuarantee(questions, retriever, index.queryVectors, params);
  assert.ok(report.checked > 0);
  assert.deepEqual(
    report.misses.map((miss) => `${miss.questionId}: ${miss.missing.join(", ")}`),
    [],
  );
  assert.equal(report.met, report.checked);
});

test("the index matches the corpus it was built from", () => {
  assert.equal(index.meta.doc_count, docs.length);
  assert.equal(index.meta.query_count, questions.length);
  assert.equal(index.chunks.length, index.chunkVectors.length);
  for (const question of questions) {
    assert.ok(index.queryVectors.has(question.id), `${question.id} has no committed query vector`);
  }
});

test("the certain input spend of a full run is under the cap for the most expensive model in models.json", () => {
  const priced = loadModels().filter((entry) => isPriced(entry) && entry.provider !== "mock");
  const dearest = priced.sort((a, b) => (b.pricing.output_per_mtok ?? 0) - (a.pricing.output_per_mtok ?? 0))[0];
  assert.ok(dearest, "models.json has no priced model to check the cap against");
  const prompts = questions.map((question) =>
    renderPrompt(question, retriever.retrieve(question.question, index.queryVectors.get(question.id), params)),
  );
  const projection = project(dearest, prompts, SYSTEM_PROMPT, DEFAULT_MAX_OUTPUT_TOKENS);
  assert.ok(projection.inputUsd !== null);
  assert.ok(
    projection.inputUsd < MAX_PROJECTED_USD,
    `${dearest.name} projects $${projection.inputUsd.toFixed(2)} of certain input spend, over the $${MAX_PROJECTED_USD.toFixed(2)} cap`,
  );
});

test("the corpus is written the way records are written", () => {
  const long = docs.filter((doc) => doc.text.length >= 1200);
  assert.ok(long.length >= 10, `${long.length} documents of 1200 characters or more`);
  assert.ok(long.every((doc) => doc.text.length <= 2500), "a deliberately long document is still under 2500 characters");

  const germanWords = /\b(?:fuer|bitte|nicht|Kunden|Woche|uebernehme|zurzeit|betreut|dazu|damit|ebenfalls|liegt|gilt|naechste[nr]?|Urlaub|Rechnungsadresse|Mailand|unpuenktlich|Kaffeeautomat|Trainstreik|Mittwoch|Donnerstag|Schweiz|englische|Deutschland|Oesterreich|melden|kommt|Vertretung|Bahn|Frage|Notizen)\b/g;
  const german = docs.filter((doc) => (doc.text.match(germanWords) ?? []).length >= 2);
  assert.ok(german.length >= 12, `${german.length} documents in German`);

  const quoted = docs.filter((doc) => doc.type === "email" && doc.text.includes("\n> "));
  assert.ok(quoted.length >= 10, `${quoted.length} emails with a quoted chain`);
  const signed = docs.filter((doc) => doc.type === "email" && doc.text.includes("Wrenfield"));
  assert.ok(signed.length >= 20, `${signed.length} emails with a signature`);

  const tables = docs.filter((doc) => /\n[^\n]*\|[^\n]*\n/.test(doc.text));
  assert.ok(tables.length >= 5, `${tables.length} documents with a plain text table`);
  const json = docs.filter((doc) => doc.text.includes('"effective_from"'));
  assert.ok(json.length >= 2, `${json.length} documents with a pasted JSON block`);

  const templates = docs.filter((doc) => doc.title?.startsWith("Weekly standup"));
  assert.ok(templates.length >= 20, `${templates.length} template standups`);

  // Every document type the design asks for is present.
  for (const type of ["slack", "issue", "issue_comment", "email", "meeting_note", "doc"] as const) {
    assert.ok(docs.some((doc) => doc.type === type), `no ${type} documents`);
  }
});

test("the corpus covers a DST change and both offsets", () => {
  assert.ok(docs.some((doc) => doc.created_at.endsWith("+01:00")), "no document written on winter time");
  assert.ok(docs.some((doc) => doc.created_at.endsWith("+02:00")), "no document written on summer time");
  assert.ok(
    docs.some((doc) => doc.text.includes("2027-03-28") || doc.text.includes("28 March")),
    "the clock change is never mentioned",
  );
});

test("gold sources are documents that state the answer, never a distractor", () => {
  const known = new Set(docs.map((doc) => doc.id));
  for (const question of questions) {
    for (const source of question.gold.sources) assert.ok(known.has(source), `${question.id} cites ${source}`);
    if (question.family === "abstain") assert.equal(question.gold.sources.length, 0);
  }
});
