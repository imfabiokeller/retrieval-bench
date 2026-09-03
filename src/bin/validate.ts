// npm run validate -- --version v1
//
// Everything a frozen corpus has to satisfy, in one command: the structural
// rules, the grounding rules, the family and trap floors, and the guarantee.
//
// The guarantee is the one that decides whether the corpus is publishable. It
// runs the frozen retrieval for every question and prints every gold source that
// had no chunk in the window, with the question id, so a miss is fixed by
// rewriting a document or a question rather than by adding a retrieval step.

import { loadAliases, loadDocs, loadQuestions, loadRetrievalParams } from "../corpus.js";
import { loadIndex } from "../index-io.js";
import { RETRIEVAL_DEFAULTS, Retriever } from "../retrieve.js";
import {
  DESIGN_MIN_PER_FAMILY,
  MIN_HISTORY_SCORED,
  MIN_PER_FAMILY,
  MIN_PER_TRAP,
  checkGuarantee,
  coverageOf,
  validateCoverage,
  validateGrounding,
  validateStructure,
} from "../validate.js";
import { FAMILIES, TRAPS } from "../types.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const version = arg("version", "v1");
const docs = loadDocs(version);
const questions = loadQuestions(version);
const aliases = loadAliases(version);
const params = loadRetrievalParams(version, RETRIEVAL_DEFAULTS);

const structure = validateStructure(docs, questions);
const grounding = validateGrounding(docs, questions, aliases);
const coverage = validateCoverage(questions);
for (const problem of [...structure, ...grounding, ...coverage]) console.log(`PROBLEM ${problem}`);

const index = loadIndex(version);
const guarantee = checkGuarantee(questions, new Retriever(index.chunks, index.chunkVectors), index.queryVectors, params);
for (const miss of guarantee.misses) {
  console.log(`MISS ${miss.questionId} (${miss.family}): ${miss.missing.join(", ")} not in the window of ${miss.retrieved} documents`);
}

const counts = coverageOf(questions);
const characters = docs.reduce((total, doc) => total + doc.text.length, 0);
console.log("");
console.log(
  `${version}: ${docs.length} docs, ${characters} characters, ${questions.length} questions, ` +
    `${counts.historyScored} with a scored history chain (floor ${MIN_HISTORY_SCORED}).`,
);
console.log(`retrieval: top_n ${params.top_n}, rrf_k ${params.rrf_k}, recency_weight ${params.recency_weight}, max_chunks_per_doc ${params.max_chunks_per_doc}`);
console.log(
  `guarantee: ${guarantee.met}/${guarantee.checked} questions had every gold source in the window ` +
    `(${guarantee.checked === 0 ? "n/a" : ((guarantee.met / guarantee.checked) * 100).toFixed(1)}%).`,
);
console.log(
  `families (floor ${MIN_PER_FAMILY}, the design asks for ${DESIGN_MIN_PER_FAMILY} cost permitting): ` +
    FAMILIES.map((family) => `${family} ${counts.perFamily[family]}`).join(", "),
);
console.log(`traps (floor ${MIN_PER_TRAP}): ` + TRAPS.map((trap) => `${trap} ${counts.perTrap[trap]}`).join(", "));
console.log(
  `${structure.length} structural problems, ${grounding.length} grounding problems, ` +
    `${coverage.length} coverage shortfalls, ${guarantee.misses.length} guarantee misses.`,
);

const failures = structure.length + grounding.length + coverage.length + guarantee.misses.length;
process.exitCode = failures === 0 ? 0 : 1;
