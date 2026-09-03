// The frozen corpus has to keep satisfying its own rules. If one of these fails
// the corpus changed, and a changed corpus is a new version, not an edit.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadAliases, loadDocs, loadItems } from "../src/corpus.js";
import { chunkCorpus } from "../src/chunk.js";
import { loadIndex } from "../src/index-io.js";
import { validateCorpus } from "../src/validate.js";
import type { Axis } from "../src/types.js";

const version = "v1";
const docs = loadDocs(version);
const items = loadItems(version);
const aliases = loadAliases(version);

test("corpus v1 passes every structural rule", () => {
  assert.deepEqual(validateCorpus(docs, items), []);
});

test("corpus v1 has the doc and item counts the README states", () => {
  assert.equal(docs.length, 120);
  assert.equal(items.length, 204);
  const perAxis: Record<string, number> = {};
  for (const item of items) perAxis[item.axis] = (perAxis[item.axis] ?? 0) + 1;
  for (const axis of ["entities", "facts", "supersession", "conflict", "abstain"] as Axis[]) {
    const count = perAxis[axis] ?? 0;
    assert.ok(count >= 40 && count <= 50, `${axis} has ${count} items, expected 40 to 50`);
  }
});

test("every document type in the mix is present", () => {
  const types = new Set(docs.map((doc) => doc.type));
  for (const type of ["slack", "issue", "issue_comment", "email", "meeting_note", "doc"]) {
    assert.ok(types.has(type as never), `no ${type} documents`);
  }
});

test("item ids are stable and follow the versioned scheme", () => {
  for (const item of items) {
    assert.match(item.id, /^v1-(ent|fac|sup|con|abs)-\d{3}$/, `${item.id} is not a stable versioned id`);
  }
});

test("a clock time is typed time, not string", () => {
  const clock = /^\d{1,2}:\d{2}/;
  for (const item of items) {
    for (const [field, value] of Object.entries(item.expected)) {
      if (typeof value !== "string" || !clock.test(value)) continue;
      assert.equal(
        item.schema.properties[field]?.type,
        "time",
        `${item.id}.${field} holds a clock time and must be typed time`,
      );
    }
  }
  const timed = items.filter((item) => Object.values(item.schema.properties).some((p) => p.type === "time"));
  assert.equal(timed.length, 3, "corpus v1 has three clock-time items");
});

test("aliases map to canonical values and never chain", () => {
  const values = new Set(Object.values(aliases));
  for (const [alias, canonical] of Object.entries(aliases)) {
    assert.equal(alias, alias.toLowerCase().trim(), `alias "${alias}" is not normalized`);
    assert.notEqual(alias, canonical, `alias "${alias}" points at itself`);
    assert.ok(!(canonical in aliases), `alias "${alias}" points at "${canonical}", which is itself an alias`);
  }
  assert.ok(values.size > 0);
});

test("the committed index matches the corpus and the chunker", () => {
  const index = loadIndex(version);
  const chunks = chunkCorpus(docs);
  assert.equal(index.meta.corpus_version, version);
  assert.equal(index.meta.doc_count, docs.length);
  assert.equal(index.chunks.length, chunks.length, "the committed index is stale, rebuild it as a new version");
  assert.deepEqual(index.chunks.map((chunk) => chunk.id), chunks.map((chunk) => chunk.id));
  assert.equal(index.chunkVectors.length, chunks.length);
  assert.equal(index.chunkVectors[0]?.length, index.meta.dims);
});

test("every item has a committed query vector, so a bench run needs no embedding key", () => {
  const index = loadIndex(version);
  assert.equal(index.queryVectors.size, items.length);
  for (const item of items) {
    assert.ok(index.queryVectors.has(item.id), `${item.id} has no committed query vector`);
  }
});
