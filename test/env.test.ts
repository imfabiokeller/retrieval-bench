// Key resolution. There is no machine-specific fallback path: a key comes from
// the process environment, from a gitignored .env in the repo root, or from the
// file named by RETRIEVAL_BENCH_ENV_FILE, and from nowhere else.

import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findKey, requireKey } from "../src/env.js";

const NAME = "RETRIEVAL_BENCH_TEST_KEY";

function envFileWith(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "retrieval-bench-env-")), ".env");
  writeFileSync(path, contents);
  return path;
}

test("the process environment wins over every file", () => {
  const path = envFileWith(`${NAME}=from-the-file\n`);
  const env = { [NAME]: "from-the-environment", RETRIEVAL_BENCH_ENV_FILE: path };
  assert.equal(findKey(NAME, env), "from-the-environment");
});

test("a key is read from the file named by RETRIEVAL_BENCH_ENV_FILE", () => {
  const path = envFileWith(`# a comment\nexport ${NAME}="from-the-file"\nOTHER=x\n`);
  assert.equal(findKey(NAME, { RETRIEVAL_BENCH_ENV_FILE: path }), "from-the-file");
});

test("a key that is nowhere returns null, and requireKey says where to put it", () => {
  assert.equal(findKey(NAME, {}), null);
  assert.equal(findKey(NAME, { RETRIEVAL_BENCH_ENV_FILE: "/nonexistent/.env" }), null);
  assert.throws(() => requireKey(NAME, {}), new RegExp(NAME));
});

test("an empty environment value does not shadow the file", () => {
  const path = envFileWith(`${NAME}=from-the-file\n`);
  assert.equal(findKey(NAME, { [NAME]: "", RETRIEVAL_BENCH_ENV_FILE: path }), "from-the-file");
});

test("the resolver hard-codes no absolute path from the machine it was written on", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const source = readFileSync(join(root, "src", "env.ts"), "utf8");
  const absoluteLiteral = source.match(/["'`]\/[A-Za-z][^"'`\n]*["'`]/);
  assert.equal(absoluteLiteral, null, `src/env.ts hard-codes an absolute path: ${absoluteLiteral?.[0]}`);
});
