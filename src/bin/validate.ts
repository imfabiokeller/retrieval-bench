// npm run validate -- --version v1
//
// Structural checks on the frozen corpus, plus a grounding report. The
// structural checks are also a test; the grounding report is advisory and is
// meant to be read by a human before a corpus version is frozen. It flags any
// non-abstain item whose expected value could not be found in the text of any
// of its gold documents, which is usually an authoring mistake and occasionally
// a legitimate paraphrase (a date written as "7 April 2026", a boolean).

import { loadAliases, loadDocs, loadItems } from "../corpus.js";
import { fieldMeta } from "../fields.js";
import { baseNormalize, normalizeField } from "../normalize.js";
import { validateCorpus } from "../validate.js";
import type { Axis } from "../types.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const version = arg("version", "v1");
const docs = loadDocs(version);
const items = loadItems(version);
const aliases = loadAliases(version);

const problems = validateCorpus(docs, items);
for (const problem of problems) console.log(`PROBLEM ${problem}`);

const textById = new Map(docs.map((doc) => [doc.id, [doc.id, doc.type, doc.channel ?? "", doc.project ?? "", doc.parent_id ?? "", doc.title ?? "", doc.author, doc.created_at, doc.text].join(" ")]));
// Grounding is checked per field against that field's own gold documents. An
// aggregation field is exempt: its answer is arithmetic over several documents
// and is not meant to appear anywhere as a literal.
let weak = 0;
let scoredFields = 0;
const perAxis = new Map<Axis, number>();
for (const item of items) {
  for (const field of item.schema.required) {
    const meta = fieldMeta(item, field);
    scoredFields += 1;
    perAxis.set(meta.axis, (perAxis.get(meta.axis) ?? 0) + 1);
    const type = item.schema.properties[field]?.type ?? "string";
    if (meta.axis === "abstain" || meta.axis === "aggregation" || type === "boolean") continue;
    const expected = normalizeField(item.expected[field] ?? null, type, aliases);
    if (expected.value === null) continue;
    const needles = Array.isArray(expected.value) ? expected.value : [String(expected.value)];
    const haystack = meta.gold_doc_ids.map((id) => baseNormalize(textById.get(id) ?? "") ?? "").join(" ");
    for (const needle of needles) {
      if (!haystack.includes(needle)) {
        weak += 1;
        console.log(`WEAK ${item.id}.${field}: "${needle}" is not literally in the gold documents`);
      }
    }
  }
}

const twins = items.filter((item) => item.twin_of !== undefined).length;
console.log(
  `${version}: ${docs.length} docs, ${items.length} items (${twins} twins), ${scoredFields} scored fields, ` +
    `${problems.length} structural problems, ${weak} weakly grounded fields`,
);
console.log(
  [...perAxis.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([axis, count]) => `  ${axis}: ${count} fields`)
    .join("\n"),
);
process.exitCode = problems.length === 0 ? 0 : 1;
