// npm run build-index -- --version v1
//
// Chunks the frozen corpus, embeds every chunk and every item question, and
// writes the index into corpus/<version>/index/. The output is committed, so a
// bench run needs no embedding key at all. Running this again after the corpus
// or the chunker changed means a new corpus version, not an overwrite.

import { loadDocs, loadItems } from "../corpus.js";
import { CHUNK_TARGET_CHARS, chunkCorpus } from "../chunk.js";
import { EMBEDDING_DIMS, EMBEDDING_ENDPOINT, EMBEDDING_MODEL, embedTexts } from "../embed.js";
import { writeIndex } from "../index-io.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function main(): Promise<void> {
  const version = arg("version", "v1");
  const docs = loadDocs(version);
  const items = loadItems(version);
  const chunks = chunkCorpus(docs, CHUNK_TARGET_CHARS);

  console.log(`corpus ${version}: ${docs.length} docs, ${items.length} items, ${chunks.length} chunks`);
  console.log(`embedding with ${EMBEDDING_MODEL} at ${EMBEDDING_DIMS} dims`);

  const documents = await embedTexts(chunks.map((chunk) => chunk.text), "RETRIEVAL_DOCUMENT");
  console.log(`chunk vectors: ${documents.vectors.length}, embedding tokens: ${documents.tokens ?? "not reported"}`);

  const queries = await embedTexts(items.map((item) => item.question), "RETRIEVAL_QUERY");
  console.log(`query vectors: ${queries.vectors.length}, embedding tokens: ${queries.tokens ?? "not reported"}`);

  writeIndex(version, {
    chunks,
    chunkVectors: documents.vectors,
    queryIds: items.map((item) => item.id),
    queryVectors: queries.vectors,
    meta: {
      corpus_version: version,
      embedding_model: EMBEDDING_MODEL,
      embedding_endpoint: EMBEDDING_ENDPOINT,
      dims: EMBEDDING_DIMS,
      chunk_count: chunks.length,
      doc_count: docs.length,
      query_count: items.length,
      embedding_tokens: documents.tokens === null && queries.tokens === null ? null : (documents.tokens ?? 0) + (queries.tokens ?? 0),
      built_at: new Date().toISOString(),
      chunk_target_chars: CHUNK_TARGET_CHARS,
    },
  });
  console.log(`wrote corpus/${version}/index`);
}

await main();
