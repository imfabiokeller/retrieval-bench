// API key resolution. Keys are never printed, logged or written to results.
//
// Order:
//   1. the process environment
//   2. a gitignored .env in the repo root
//   3. the file named by RETRIEVAL_BENCH_ENV_FILE, if set
//   4. LOCAL_ENV_FALLBACK below
//
// Step 4 is a convenience for the machine this benchmark was written on and is
// expected to be missing everywhere else. It is not a supported configuration
// path: set the environment variable or the repo .env instead.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./corpus.js";

const LOCAL_ENV_FALLBACK = "/Users/fabio/Developer/dos/product/braindb/.env";

function readFromFile(path: string, name: string): string | null {
  if (!existsSync(path)) return null;
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m");
  const match = readFileSync(path, "utf8").match(pattern);
  return match?.[1]?.trim() ?? null;
}

/** Returns the key, or null when it cannot be found anywhere. */
export function findKey(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env[name];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const candidates = [join(REPO_ROOT, ".env"), env.RETRIEVAL_BENCH_ENV_FILE, LOCAL_ENV_FALLBACK];
  for (const path of candidates) {
    if (!path) continue;
    const value = readFromFile(path, name);
    if (value) return value;
  }
  return null;
}

export function requireKey(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = findKey(name, env);
  if (key === null) {
    throw new Error(`${name} is not set. Export it, or put it in a .env file in the repo root.`);
  }
  return key;
}
