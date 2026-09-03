// Reading and writing the committed index.
//
// corpus/<version>/index/
//   chunks.jsonl     one line per chunk, in embedding order
//   embeddings.f32   raw Float32Array, chunk_count * dims, same order as chunks.jsonl
//   queries.jsonl    one line per item id, in query-vector order
//   queries.f32      raw Float32Array, query_count * dims, same order as queries.jsonl
//   meta.json        embedding model, dims and counts
//
// The query vectors are committed alongside the chunk vectors on purpose: a
// bench run then needs no embedding key at all, only a key for the model under
// test. Both files are part of the corpus version. A different embedding model,
// or a different chunking, means a new corpus version.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpusDir, readJsonl } from "./corpus.js";
import type { Chunk, IndexMeta } from "./types.js";

export function indexDir(version: string): string {
  return join(corpusDir(version), "index");
}

export function writeVectors(path: string, vectors: number[][]): void {
  const dims = vectors[0]?.length ?? 0;
  const flat = new Float32Array(vectors.length * dims);
  vectors.forEach((vector, row) => flat.set(vector, row * dims));
  writeFileSync(path, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));
}

export function readVectors(path: string, dims: number): Float32Array[] {
  const buffer = readFileSync(path);
  const flat = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  const rows: Float32Array[] = [];
  for (let offset = 0; offset + dims <= flat.length; offset += dims) {
    rows.push(flat.subarray(offset, offset + dims));
  }
  return rows;
}

export interface WrittenIndex {
  chunks: Chunk[];
  chunkVectors: number[][];
  queryIds: string[];
  queryVectors: number[][];
  meta: IndexMeta;
}

export function writeIndex(version: string, written: WrittenIndex): void {
  const dir = indexDir(version);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "chunks.jsonl"), written.chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
  writeVectors(join(dir, "embeddings.f32"), written.chunkVectors);
  writeFileSync(join(dir, "queries.jsonl"), written.queryIds.map((id) => JSON.stringify({ item_id: id })).join("\n") + "\n");
  writeVectors(join(dir, "queries.f32"), written.queryVectors);
  writeFileSync(join(dir, "meta.json"), JSON.stringify(written.meta, null, 2) + "\n");
}

export interface LoadedIndex {
  meta: IndexMeta;
  chunks: Chunk[];
  chunkVectors: Float32Array[];
  /** item id to its committed query vector. */
  queryVectors: Map<string, Float32Array>;
}

export function loadIndex(version: string): LoadedIndex {
  const dir = indexDir(version);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as IndexMeta;
  const chunks = readJsonl<Chunk>(join(dir, "chunks.jsonl"));
  const chunkVectors = readVectors(join(dir, "embeddings.f32"), meta.dims);
  const queryIds = readJsonl<{ item_id: string }>(join(dir, "queries.jsonl"));
  const rows = readVectors(join(dir, "queries.f32"), meta.dims);
  const queryVectors = new Map<string, Float32Array>();
  queryIds.forEach((entry, row) => {
    const vector = rows[row];
    if (vector) queryVectors.set(entry.item_id, vector);
  });
  if (chunks.length !== chunkVectors.length) {
    throw new Error(`index for ${version} is inconsistent: ${chunks.length} chunks, ${chunkVectors.length} vectors`);
  }
  return { meta, chunks, chunkVectors, queryVectors };
}
