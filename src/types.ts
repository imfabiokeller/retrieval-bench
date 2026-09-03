// Shared shapes for the corpus, the fixed pipeline and a bench run.

export type DocType = "slack" | "issue" | "issue_comment" | "email" | "meeting_note" | "doc";

export interface Doc {
  id: string;
  type: DocType;
  author: string;
  /** ISO 8601 with a timezone offset. */
  created_at: string;
  channel?: string;
  project?: string;
  thread_id?: string;
  parent_id?: string;
  title?: string;
  text: string;
}

export type FieldType = "string" | "number" | "date" | "boolean" | "string[]";

export interface ItemSchema {
  type: "object";
  properties: Record<string, { type: FieldType }>;
  required: string[];
  additionalProperties: false;
}

export type Axis = "entities" | "facts" | "supersession" | "conflict" | "abstain";

export type FieldValue = string | number | boolean | string[] | null;

export interface Item {
  id: string;
  axis: Axis;
  question: string;
  schema: ItemSchema;
  expected: Record<string, FieldValue>;
  gold_doc_ids: string[];
  notes: string;
}

export interface Chunk {
  /** `${doc_id}#${ordinal}` */
  id: string;
  doc_id: string;
  ordinal: number;
  /** Contextual prefix plus body. This exact string is indexed by BM25 and embedded. */
  text: string;
  /** The body without the contextual prefix, used when rendering evidence. */
  body: string;
  /** The contextual prefix on its own. */
  prefix: string;
  type: DocType;
  author: string;
  created_at: string;
  channel?: string;
  project?: string;
  title?: string;
}

export interface IndexMeta {
  corpus_version: string;
  embedding_model: string;
  embedding_endpoint: string;
  dims: number;
  chunk_count: number;
  doc_count: number;
  query_count: number;
  /** null when the provider did not report embedding token usage. */
  embedding_tokens: number | null;
  built_at: string;
  chunk_target_chars: number;
}

export interface RetrievalParams {
  top_n: number;
  rrf_k: number;
  recency_weight: number;
  max_chunks_per_doc: number;
}

export interface Retrieved {
  chunk: Chunk;
  rrf: number;
  score: number;
  bm25_rank: number | null;
  vector_rank: number | null;
}

export interface FieldResult {
  field: string;
  expected: FieldValue;
  got: FieldValue;
  correct: boolean;
}

export interface ItemResult {
  item_id: string;
  axis: Axis;
  question: string;
  retrieved_chunk_ids: string[];
  retrieved_doc_ids: string[];
  retrieval_hit: boolean | null;
  prompt: string;
  raw_output: string;
  parsed: Record<string, FieldValue> | null;
  expected: Record<string, FieldValue>;
  fields: FieldResult[];
  correct: boolean;
  latency_ms: number;
  ttft_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_cached: number | null;
  cost_usd: number | null;
  retries: number;
  finish_reason: string | null;
  error: string | null;
}

export interface RunParams extends RetrievalParams {
  temperature: number;
  max_tokens: number;
}

export interface RunMeta {
  run_id: string;
  model_name: string;
  provider: string;
  model_id: string;
  params: RunParams;
  corpus_version: string;
  pipeline_hash: string;
  prompt_hash: string;
  git_commit: string | null;
  started_at: string;
  finished_at: string;
  item_count: number;
  correct_count: number;
  accuracy: number;
  retrieval_hit_rate: number | null;
  projected_cost_usd: number | null;
  actual_cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  errors: number;
  retries: number;
}
