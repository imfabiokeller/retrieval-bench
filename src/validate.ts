// What a frozen corpus has to satisfy. Used by `npm run validate` and by the
// test suite, so a corpus that breaks one of these fails CI rather than quietly
// producing a wrong leaderboard.
//
// Four kinds of check:
//
//   structure   ids, dates, types, the shape of every question and its gold pack
//   grounding   every gold value is literally in the text of its gold sources,
//               and every `from` date in a chain is on or after the document
//               that states that step
//   coverage    every family and every trap kind carries at least the minimum
//               number of questions the design asks for
//   guarantee   the frozen retrieval is run for every question and every gold
//               source must have a chunk in the window. This is the check the
//               corpus is written until it passes at 100 percent.

import { baseNormalize, normalizeField } from "./normalize.js";
import type { Aliases } from "./normalize.js";
import { Retriever } from "./retrieve.js";
import { FAMILIES, TRAPS } from "./types.js";
import type { AnswerType, AnswerValue, Doc, Family, Question, RetrievalParams, Trap } from "./types.js";

const TYPES = new Set<AnswerType>(["string", "number", "date", "time", "boolean", "string[]"]);
const FAMILY_SET = new Set<Family>(FAMILIES);
const TRAP_SET = new Set<Trap>(TRAPS);

// The design's floors. A shortfall is a failure, not a warning.
//
// DESIGN.md asks for thirty or more questions per family "cost permitting", and
// the cost does not permit thirty: a full run has to project under five dollars
// for the most expensive model in models.json, and at this window size that line
// falls at roughly two hundred questions in total. The per-family floor is
// therefore the design's number cut evenly across the ten families, and the
// design's own number is kept here beside it so the gap is visible rather than
// forgotten. The trap floor is met in full.
export const DESIGN_MIN_PER_FAMILY = 30;
export const MIN_PER_FAMILY = 20;
export const MIN_PER_TRAP = 15;
/** Questions whose gold carries a scored chain. */
export const MIN_HISTORY_SCORED = 40;
/** Steps a scored chain needs, so a chain is a chain and not one change. */
export const MIN_CHAIN_STEPS = 3;

/** Families whose answer is only defined by walking more than one document. */
const MULTI_DOC_FAMILIES = new Set<Family>(["join", "multihop", "exhaustive", "aggregation"]);

function typeOf(value: unknown, declared: AnswerType): boolean {
  switch (declared) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "time":
      return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    case "string[]":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string");
    default:
      return false;
  }
}

export function validateStructure(docs: Doc[], questions: Question[]): string[] {
  const problems: string[] = [];
  const docIds = new Set<string>();

  for (const doc of docs) {
    if (docIds.has(doc.id)) problems.push(`duplicate doc id ${doc.id}`);
    docIds.add(doc.id);
    if (!/^\d{4}-\d{2}-\d{2}T[\d:]+(\.\d+)?([+-]\d{2}:\d{2}|Z)$/.test(doc.created_at)) {
      problems.push(`${doc.id}: created_at is not ISO 8601 with a timezone`);
    }
    if (doc.text.trim().length === 0) problems.push(`${doc.id}: empty text`);
    if (doc.type === "slack" && !doc.channel) problems.push(`${doc.id}: slack doc without a channel`);
    if (doc.type === "issue_comment" && !doc.parent_id) problems.push(`${doc.id}: comment without a parent_id`);
  }
  for (const doc of docs) {
    if (doc.parent_id && !docIds.has(doc.parent_id)) {
      problems.push(`${doc.id}: parent_id ${doc.parent_id} does not exist`);
    }
  }

  const questionIds = new Set<string>();
  for (const question of questions) {
    const where = question.id;
    if (questionIds.has(where)) problems.push(`duplicate question id ${where}`);
    questionIds.add(where);
    if (!FAMILY_SET.has(question.family)) problems.push(`${where}: unknown family ${question.family}`);
    if (!TYPES.has(question.answer_type)) problems.push(`${where}: unknown answer type ${String(question.answer_type)}`);
    if (question.question.trim().length === 0) problems.push(`${where}: empty question`);
    if (question.notes.trim().length === 0) problems.push(`${where}: no note saying why the answer is the answer`);
    if (!Array.isArray(question.traps)) problems.push(`${where}: traps is not a list`);
    else {
      for (const trap of question.traps) {
        if (!TRAP_SET.has(trap)) problems.push(`${where}: unknown trap ${trap}`);
      }
      if (new Set(question.traps).size !== question.traps.length) problems.push(`${where}: a trap is listed twice`);
    }

    const gold = question.gold;
    if (gold === null || typeof gold !== "object") {
      problems.push(`${where}: no gold pack`);
      continue;
    }
    if (gold.status !== "answered" && gold.status !== "not_in_evidence") {
      problems.push(`${where}: gold status is ${String(gold.status)}`);
    }
    if (typeof gold.history_scored !== "boolean") problems.push(`${where}: history_scored must be stated as true or false`);
    if (!Array.isArray(gold.sources)) problems.push(`${where}: gold sources is not a list`);
    else {
      for (const id of gold.sources) {
        if (!docIds.has(id)) problems.push(`${where}: gold source ${id} does not exist`);
      }
      if (new Set(gold.sources).size !== gold.sources.length) problems.push(`${where}: a gold source is listed twice`);
    }

    const abstain = question.family === "abstain";
    if (abstain !== (gold.status === "not_in_evidence")) {
      problems.push(`${where}: an abstain question is exactly a question whose gold status is not_in_evidence`);
    }
    if (gold.status === "not_in_evidence") {
      if (gold.value !== null) problems.push(`${where}: an abstain gold has a null value`);
      if (gold.sources.length !== 0) problems.push(`${where}: an abstain gold cites nothing`);
      if (gold.history.length !== 0) problems.push(`${where}: an abstain gold has an empty history`);
      if (gold.history_scored) problems.push(`${where}: an abstain gold does not score history`);
    } else {
      if (gold.value === null) problems.push(`${where}: an answered gold needs a value`);
      else if (!typeOf(gold.value, question.answer_type)) {
        problems.push(`${where}: gold value does not match answer type ${question.answer_type}`);
      }
      if (gold.sources.length === 0) problems.push(`${where}: an answered gold needs at least one source`);
      if (MULTI_DOC_FAMILIES.has(question.family) && gold.sources.length < 2) {
        problems.push(`${where}: a ${question.family} question needs at least two gold sources`);
      }
    }

    if (!Array.isArray(gold.history)) {
      problems.push(`${where}: gold history is not a list`);
    } else if (gold.history_scored) {
      if (gold.history.length < MIN_CHAIN_STEPS) {
        problems.push(`${where}: a scored chain needs ${MIN_CHAIN_STEPS} steps or more, this one has ${gold.history.length}`);
      }
      const dates = gold.history.map((step) => step.from);
      for (const step of gold.history) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(step.from)) problems.push(`${where}: history step from "${step.from}" is not YYYY-MM-DD`);
        if (step.value === null) problems.push(`${where}: a history step has a null value`);
        else if (!typeOf(step.value, question.answer_type)) {
          problems.push(`${where}: a history step value does not match answer type ${question.answer_type}`);
        }
      }
      for (let i = 1; i < dates.length; i += 1) {
        if ((dates[i] ?? "") < (dates[i - 1] ?? "")) problems.push(`${where}: history is not oldest first`);
      }
      const keys = gold.history.map((step) => `${step.from}=>${JSON.stringify(step.value)}`);
      if (new Set(keys).size !== keys.length) problems.push(`${where}: history repeats a step`);
      const values = gold.history.map((step) => JSON.stringify(step.value));
      for (let i = 1; i < values.length; i += 1) {
        if (values[i] === values[i - 1]) problems.push(`${where}: history has the same value twice in a row, which is not a change`);
      }
      const last = gold.history[gold.history.length - 1];
      if (question.family === "current" && last && JSON.stringify(last.value) !== JSON.stringify(gold.value)) {
        problems.push(`${where}: a current question answers the newest step of its own chain`);
      }
    } else if (gold.history.length !== 0) {
      problems.push(`${where}: history_scored is false, so history must be empty`);
    }
  }

  return problems;
}

/**
 * Every gold value has to be readable in the text of its own gold sources, and
 * every `from` date has to be on or after the document that states that step.
 *
 * Four things are exempt from the literal check, because their answer is derived
 * rather than quoted: an aggregation answer is arithmetic over several
 * documents, a temporal answer is arithmetic on dates, a rule answer is a policy
 * applied to a fact, and a boolean is a yes or a no that no document writes as
 * "true". A question carrying the `relative_date` trap is exempt for the same
 * reason: the document says "next Tuesday" and the date is what that resolves
 * to. An abstain question has nothing to ground.
 */
export function validateGrounding(docs: Doc[], questions: Question[], aliases: Aliases): string[] {
  const problems: string[] = [];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const searchable = new Map(
    docs.map((doc) => [
      doc.id,
      baseNormalize([doc.id, doc.type, doc.channel ?? "", doc.project ?? "", doc.parent_id ?? "", doc.title ?? "", doc.author, doc.created_at, doc.text].join(" ")) ?? "",
    ]),
  );

  const exempt = new Set<Family>(["aggregation", "temporal", "rule", "abstain"]);
  for (const question of questions) {
    const gold = question.gold;
    const derived = exempt.has(question.family) || question.answer_type === "boolean" || question.traps.includes("relative_date");
    if (!derived && gold.value !== null) {
      const haystack = gold.sources.map((id) => searchable.get(id) ?? "").join(" ");
      for (const needle of needlesOf(gold.value, question.answer_type, aliases)) {
        if (!formsOf(needle, question.answer_type).some((form) => haystack.includes(form))) {
          problems.push(`${question.id}: gold value "${needle}" is not literally in its gold sources`);
        }
      }
    }
    if (!gold.history_scored) continue;
    for (const step of gold.history) {
      const stating = gold.sources
        .map((id) => byId.get(id))
        .filter((doc): doc is Doc => doc !== undefined)
        .filter((doc) => {
          const haystack = searchable.get(doc.id) ?? "";
          return needlesOf(step.value, question.answer_type, aliases).every((needle) =>
            formsOf(needle, question.answer_type).some((form) => haystack.includes(form)),
          );
        });
      if (stating.length === 0) {
        problems.push(`${question.id}: history step ${step.from} is stated by none of the gold sources`);
        continue;
      }
      // The step takes effect on or after the first gold source that states it.
      const earliest = stating.map((doc) => doc.created_at.slice(0, 10)).sort()[0] ?? "";
      if (step.from < earliest) {
        problems.push(`${question.id}: history step ${step.from} is dated before ${earliest}, the document that states it`);
      }
    }
  }
  return problems;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * The ways a normalized value is written by a person. A date is the one that
 * matters: records write "2027-05-18" and people write "18 May 2027", and both
 * are the same date being stated once.
 */
function formsOf(needle: string, type: AnswerType): string[] {
  if (type === "date") {
    const match = needle.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return [needle];
    const [, year, month, day] = match;
    const name = MONTH_NAMES[Number(month) - 1] ?? "";
    const plainDay = String(Number(day));
    return [
      needle,
      `${plainDay} ${name} ${year}`,
      `${name} ${plainDay} ${year}`,
      `${name} ${plainDay}`,
      `${plainDay}.${month}.${year}`,
      `${plainDay}. ${name} ${year}`,
    ];
  }
  if (type === "time") {
    const match = needle.match(/^(\d{2}):(\d{2})$/);
    if (!match) return [needle];
    return [needle, `${Number(match[1])}:${match[2]}`];
  }
  return [needle];
}

function needlesOf(value: AnswerValue, type: AnswerType, aliases: Aliases): string[] {
  const normalized = normalizeField(value, type, aliases);
  if (normalized.value === null) return [];
  const parts = Array.isArray(normalized.value) ? normalized.value.map(String) : [String(normalized.value)];
  // Alias resolution returns the canonical spelling, which is not lowercased.
  // The haystack is, so both sides go through the same base form before the
  // literal check compares them.
  return parts.map((part) => baseNormalize(part) ?? part);
}

export interface Coverage {
  perFamily: Record<Family, number>;
  perTrap: Record<Trap, number>;
  historyScored: number;
}

export function coverageOf(questions: Question[]): Coverage {
  const perFamily = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as Record<Family, number>;
  const perTrap = Object.fromEntries(TRAPS.map((trap) => [trap, 0])) as Record<Trap, number>;
  let historyScored = 0;
  for (const question of questions) {
    if (perFamily[question.family] !== undefined) perFamily[question.family] += 1;
    for (const trap of question.traps) if (perTrap[trap] !== undefined) perTrap[trap] += 1;
    if (question.gold.history_scored) historyScored += 1;
  }
  return { perFamily, perTrap, historyScored };
}

export function validateCoverage(questions: Question[]): string[] {
  const coverage = coverageOf(questions);
  const problems: string[] = [];
  for (const family of FAMILIES) {
    const count = coverage.perFamily[family];
    if (count < MIN_PER_FAMILY) problems.push(`family ${family} has ${count} questions, the floor is ${MIN_PER_FAMILY}`);
  }
  for (const trap of TRAPS) {
    const count = coverage.perTrap[trap];
    if (count < MIN_PER_TRAP) problems.push(`trap ${trap} has ${count} questions, the floor is ${MIN_PER_TRAP}`);
  }
  if (coverage.historyScored < MIN_HISTORY_SCORED) {
    problems.push(`${coverage.historyScored} questions score a history chain, the floor is ${MIN_HISTORY_SCORED}`);
  }
  return problems;
}

export interface GuaranteeMiss {
  questionId: string;
  family: Family;
  missing: string[];
  retrieved: number;
}

export interface GuaranteeReport {
  checked: number;
  met: number;
  misses: GuaranteeMiss[];
}

/**
 * THE GUARANTEE. Run the frozen retrieval for every question and record any gold
 * source with no chunk in the window. A miss is fixed by rewriting the document
 * or the question until the two share the vocabulary a real record would share,
 * never by adding a retrieval step.
 */
export function checkGuarantee(
  questions: Question[],
  retriever: Retriever,
  queryVectors: Map<string, ArrayLike<number>>,
  params: RetrievalParams,
): GuaranteeReport {
  let checked = 0;
  let met = 0;
  const misses: GuaranteeMiss[] = [];
  for (const question of questions) {
    if (question.gold.sources.length === 0) continue;
    checked += 1;
    const retrieved = retriever.retrieve(question.question, queryVectors.get(question.id), params);
    const docIds = new Set(retrieved.map((entry) => entry.chunk.doc_id));
    const missing = question.gold.sources.filter((id) => !docIds.has(id));
    if (missing.length === 0) met += 1;
    else misses.push({ questionId: question.id, family: question.family, missing, retrieved: docIds.size });
  }
  return { checked, met, misses };
}
