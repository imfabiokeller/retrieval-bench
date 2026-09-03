// Loading the frozen corpus. Nothing here writes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Aliases } from "./normalize.js";
import type { Doc, Item } from "./types.js";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export function corpusDir(version: string): string {
  return join(REPO_ROOT, "corpus", version);
}

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function loadDocs(version: string): Doc[] {
  return readJsonl<Doc>(join(corpusDir(version), "docs.jsonl"));
}

export function loadItems(version: string): Item[] {
  return readJsonl<Item>(join(corpusDir(version), "items.jsonl"));
}

export function loadAliases(version: string): Aliases {
  const raw = JSON.parse(readFileSync(join(corpusDir(version), "aliases.json"), "utf8")) as {
    aliases: Aliases;
  };
  return raw.aliases;
}
