// Reading a reply. The parser is deliberately forgiving about how the JSON is
// wrapped and unforgiving about what it contains: a missing key is a missing
// answer, not a repaired one.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseObject, parsePack } from "../src/parse.js";

test("the object survives code fences, prose and trailing text", () => {
  assert.deepEqual(parseObject('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseObject('Here you go:\n{"a": "b"}\nHope that helps.'), { a: "b" });
  assert.deepEqual(parseObject('{"a": {"b": 2}} trailing'), { a: { b: 2 } });
  assert.deepEqual(parseObject('{"a": "brace } inside a string"}'), { a: "brace } inside a string" });
  assert.equal(parseObject("no json at all"), null);
  assert.equal(parseObject('{"a": '), null, "an unterminated object is not usable");
  assert.equal(parseObject("[1, 2, 3]"), null, "a list with no object in it is not usable");
});

test("a full pack is read as it was written", () => {
  const pack = parsePack('{"status":"answered","value":165,"history":[{"value":190,"from":"2027-01-12"}],"sources":["a","b"]}');
  assert.deepEqual(pack, {
    status: "answered",
    value: 165,
    history: [{ value: 190, from: "2027-01-12" }],
    sources: ["a", "b"],
  });
});

test("a missing status is read from the value rather than invented", () => {
  assert.equal(parsePack('{"value": 12}')?.status, "answered");
  assert.equal(parsePack('{"value": null}')?.status, "not_in_evidence");
  assert.equal(parsePack('{"status":"NOT_IN_EVIDENCE","value":null}')?.status, "not_in_evidence");
});

test("a malformed history or sources list degrades to empty rather than throwing", () => {
  const pack = parsePack('{"status":"answered","value":1,"history":"none","sources":"only-one"}');
  assert.deepEqual(pack?.history, []);
  assert.deepEqual(pack?.sources, ["only-one"], "a single id written as a string is still one citation");
  assert.deepEqual(parsePack('{"value":1,"history":[{"from":"2027-01-01"}]}')?.history, [{ value: null, from: "2027-01-01" }]);
});

test("a reply with no object at all is no pack", () => {
  assert.equal(parsePack("The evidence does not say."), null);
});
