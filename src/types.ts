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

export type FieldType = "string" | "number" | "date" | "time" | "boolean" | "string[]";

export interface ItemSchema {
  type: "object";
  properties: Record<string, { type: FieldType }>;
  required: string[];
  additionalProperties: false;
}

export type Axis =
  | "entities"
  | "facts"
  | "supersession"
  | "conflict"
  | "abstain"
  | "asof"
  | "join"
  | "exhaustive"
  | "aggregation";

export type FieldValue = string | number | boolean | string[] | null;

/**
 * What one field of a case is being asked to do, and which documents support
 * it. Kept out of `schema` on purpose: the schema is rendered into the prompt,
 * and neither the axis nor the gold documents may reach the model.
 */
export interface FieldMeta {
  axis: Axis;
  gold_doc_ids: string[];
}

/**
 * One question, one retrieval, one model call, one object. Every field carries
 * its own axis and its own gold documents in `fields`.
 *
 * A v1 item has no `fields`: its fields all inherit the item-level `axis` and
 * `gold_doc_ids`, which is what keeps v1 items valid and v1 runs re-scorable.
 * Resolve a field with `fieldMeta()` in fields.ts rather than reading either
 * shape directly.
 */
export interface Item {
  id: string;
  /** The case-level axis. With per-field axes it is the headline, not the score. */
  axis: Axis;
  question: string;
  schema: ItemSchema;
  expected: Record<string, FieldValue>;
  /** The union of the per-field gold documents when `fields` is present. */
  gold_doc_ids: string[];
  notes: string;
  /** Per-field axis and gold documents. Absent in v1. */
  fields?: Record<string, FieldMeta>;
  /** Set on a single-field twin item: the id of the case that asks the same field among others. */
  twin_of?: string;
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
  /** The field's own axis, which is what the per-axis leaderboard numbers count. */
  axis: Axis;
  expected: FieldValue;
  got: FieldValue;
  correct: boolean;
  /** Whether any retrieved chunk came from one of this field's gold documents. Null when it has none. */
  retrieval_hit: boolean | null;
}

export interface ItemResult {
  item_id: string;
  /** The case-level axis. Per-field axes are on the field rows. */
  axis: Axis;
  /** The case this single-field twin repeats one field of, or null. */
  twin_of?: string | null;
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
  /** Output tokens the provider attributed to reasoning, when it reports the split. */
  tokens_reasoning: number | null;
  tokens_cached: number | null;
  cost_usd: number | null;
  retries: number;
  finish_reason: string | null;
  error: string | null;
}

export interface RunParams extends RetrievalParams {
  /** null when the provider rejects sampling parameters, so none was sent. */
  temperature: number | null;
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
  /** The score as the run itself computed it. The report re-scores from raw_output and may differ. */
  correct_count_at_run: number;
  accuracy_at_run: number;
  retrieval_hit_rate: number | null;
  projected_cost_usd: number | null;
  actual_cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  tokens_reasoning: number;
  tokens_cached: number;
  errors: number;
  retries: number;
}
