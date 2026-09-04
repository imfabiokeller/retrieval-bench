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

/** The declared type of one question's answer. The pack is the schema; this types its `value`. */
export type AnswerType = "string" | "number" | "date" | "time" | "boolean" | "string[]";

/** The question type. One leaderboard column each. */
export type Family =
  | "lookup"
  | "current"
  | "asof"
  | "join"
  | "multihop"
  | "exhaustive"
  | "aggregation"
  | "temporal"
  | "rule"
  | "abstain";

/** What is planted in the evidence. An annotation any question can carry, scored as resistance. */
export type Trap =
  | "superseded"
  | "statement_shaped_question"
  | "quoted_email"
  | "proposal"
  | "retraction"
  | "scope"
  | "relative_date"
  | "unit"
  | "timezone"
  | "keyword"
  | "same_name"
  | "planned_vs_done"
  | "negation"
  | "chunk_split"
  | "format";

export const FAMILIES: Family[] = [
  "lookup",
  "current",
  "asof",
  "join",
  "multihop",
  "exhaustive",
  "aggregation",
  "temporal",
  "rule",
  "abstain",
];

export const TRAPS: Trap[] = [
  "superseded",
  "statement_shaped_question",
  "quoted_email",
  "proposal",
  "retraction",
  "scope",
  "relative_date",
  "unit",
  "timezone",
  "keyword",
  "same_name",
  "planned_vs_done",
  "negation",
  "chunk_split",
  "format",
];

export type AnswerValue = string | number | boolean | string[] | null;

export type Status = "answered" | "not_in_evidence";

/** One step of a chain: the value, and the date it took effect. */
export interface HistoryStep {
  value: AnswerValue;
  /** YYYY-MM-DD. */
  from: string;
}

/**
 * The reply shape, which is also the gold shape. There are no per-question
 * schemas and no field names: the pack is the schema.
 */
export interface Pack {
  status: Status;
  value: AnswerValue;
  history: HistoryStep[];
  sources: string[];
}

export interface Gold extends Pack {
  /**
   * Whether the `history` channel is scored for this question. Stated rather
   * than inferred from an empty chain, so "this thing never changed" and "this
   * chain is not part of the answer" are two different declarations.
   */
  history_scored: boolean;
}

/** One question, one retrieval, one call, one pack. */
export interface Question {
  id: string;
  family: Family;
  question: string;
  answer_type: AnswerType;
  traps: Trap[];
  gold: Gold;
  /** Why the answer is the answer. Never shown to the model. */
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

/** One channel of one pack, scored. `scored` is false for a channel this question does not declare. */
export interface ChannelResult {
  scored: boolean;
  correct: boolean;
}

export interface Scored {
  value: ChannelResult;
  status: ChannelResult;
  history: ChannelResult;
  sources: ChannelResult;
  /** Gold sources cited over gold sources, or null when the gold cites none. */
  sources_recall: number | null;
  /** Every scored channel correct. */
  fully_correct: boolean;
}

export interface ItemResult {
  item_id: string;
  family: Family;
  traps: Trap[];
  question: string;
  answer_type: AnswerType;
  retrieved_chunk_ids: string[];
  retrieved_doc_ids: string[];
  /** Whether every gold source had a chunk in the window. Null when the question has no gold sources. */
  guarantee_met: boolean | null;
  prompt: string;
  raw_output: string;
  parsed: Pack | null;
  gold: Gold;
  scored: Scored;
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
  /** The model id the provider reported on this reply. */
  served_model_id: string | null;
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
  /** Every distinct model id the provider reported across the run's replies. */
  served_model_ids: string[];
  params: RunParams;
  corpus_version: string;
  pipeline_hash: string;
  prompt_hash: string;
  params_hash: string;
  git_commit: string | null;
  started_at: string;
  finished_at: string;
  item_count: number;
  /** Which repeat of the same model on the same corpus and parameters this is, 1-based. */
  run_index: number;
  /** The score as the run itself computed it. The report re-scores from raw_output and may differ. */
  packs_fully_correct_at_run: number;
  pack_accuracy_at_run: number;
  projected_cost_usd: number | null;
  actual_cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  tokens_reasoning: number;
  tokens_cached: number;
  errors: number;
  retries: number;
}
