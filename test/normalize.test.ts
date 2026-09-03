import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  baseNormalize,
  normalizeBoolean,
  normalizeDate,
  normalizeField,
  normalizeNumber,
  resolveAlias,
} from "../src/normalize.js";

const aliases = { dan: "dan okonkwo", "@mei": "mei-ling chen", edge: "palisade edge" };

test("baseNormalize trims, lowercases, collapses whitespace and strips edge punctuation", () => {
  assert.equal(baseNormalize('  "Dan   Okonkwo".  '), "dan okonkwo");
  assert.equal(baseNormalize("**Dublin**"), "dublin");
  assert.equal(baseNormalize("\n\tThe   gateway\n"), "the gateway");
});

test("empty and blank values normalize to null", () => {
  assert.equal(baseNormalize(""), null);
  assert.equal(baseNormalize("   "), null);
  assert.equal(baseNormalize('"" '), null);
  assert.equal(baseNormalize(null), null);
  assert.equal(baseNormalize(undefined), null);
});

test("numbers drop units, currency, percent signs and thousands separators", () => {
  assert.equal(normalizeNumber("180 ms"), 180);
  assert.equal(normalizeNumber("eur 2,900 per month"), 2900);
  assert.equal(normalizeNumber("€21500"), 21500);
  assert.equal(normalizeNumber("0.05%"), 0.05);
  assert.equal(normalizeNumber("14 200 requests per second"), 14200);
  assert.equal(normalizeNumber("no number here"), null);
});

test("numbers apply scale words", () => {
  assert.equal(normalizeNumber("120 million"), 120000000);
  assert.equal(normalizeNumber("1.2 billion"), 1200000000);
  assert.equal(normalizeNumber("14.2k"), 14200);
});

test("a decimal comma is told apart from thousands separators", () => {
  assert.equal(normalizeNumber("2,5"), 2.5);
  assert.equal(normalizeNumber("2,500"), 2500);
  assert.equal(normalizeNumber("1,234,567"), 1234567);
});

test("dates parse from the unambiguous formats only", () => {
  assert.equal(normalizeDate("2026-04-07"), "2026-04-07");
  assert.equal(normalizeDate("2026-4-7"), "2026-04-07");
  assert.equal(normalizeDate("2026-04-07t09:00:00+02:00"), "2026-04-07");
  assert.equal(normalizeDate("7 april 2026"), "2026-04-07");
  assert.equal(normalizeDate("april 7, 2026"), "2026-04-07");
  assert.equal(normalizeDate("7th april 2026"), "2026-04-07");
  assert.equal(normalizeDate("07-04-2026"), null, "day first is ambiguous and is rejected");
  assert.equal(normalizeDate("2026-02-30"), null, "an impossible date is rejected");
});

test("booleans accept yes/no, true/false, y/n and 1/0", () => {
  assert.equal(normalizeBoolean("yes"), true);
  assert.equal(normalizeBoolean("false"), false);
  assert.equal(normalizeBoolean("n"), false);
  assert.equal(normalizeBoolean("1"), true);
  assert.equal(normalizeBoolean("maybe"), null);
});

test("aliases resolve on the whole normalized string, never as substrings", () => {
  assert.equal(resolveAlias("dan", aliases), "dan okonkwo");
  assert.equal(resolveAlias("@mei", aliases), "mei-ling chen");
  assert.equal(resolveAlias("dan brown", aliases), "dan brown", "no substring replacement");
  assert.equal(resolveAlias("palisade edge", aliases), "palisade edge", "aliases do not chain");
});

test("normalizeField compares string[] as a set", () => {
  const a = normalizeField(["Go", "TypeScript"], "string[]", aliases);
  const b = normalizeField(["typescript", "go"], "string[]", aliases);
  const c = normalizeField("TypeScript and Go", "string[]", aliases);
  assert.equal(a.key, b.key);
  assert.equal(a.key, c.key);
});

test("null matches only null, and an empty string counts as null", () => {
  const expected = normalizeField(null, "string", aliases);
  assert.equal(normalizeField("", "string", aliases).key, expected.key);
  assert.equal(normalizeField("   ", "string", aliases).key, expected.key);
  assert.notEqual(normalizeField("none", "string", aliases).key, expected.key);
  assert.notEqual(normalizeField("null", "string", aliases).key, expected.key);
  assert.notEqual(normalizeField(0, "number", aliases).key, expected.key);
  assert.notEqual(normalizeField(false, "boolean", aliases).key, expected.key);
});

test("a value the schema type cannot parse falls back to its string form and does not match", () => {
  const expected = normalizeField(180, "number", aliases);
  assert.notEqual(normalizeField("about the same as before", "number", aliases).key, expected.key);
  assert.equal(normalizeField("180", "number", aliases).key, expected.key);
});

test("a one-entry list answering a scalar field is unwrapped, a longer one is not", () => {
  assert.equal(normalizeField(["Dublin"], "string", aliases).key, normalizeField("dublin", "string", aliases).key);
  assert.notEqual(
    normalizeField(["Dublin", "Frankfurt"], "string", aliases).key,
    normalizeField("dublin", "string", aliases).key,
  );
});
