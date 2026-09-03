# retrieval-bench

**Given a fixed retrieval pipeline over a frozen corpus of realistic company
data, how reliably does a model turn retrieved evidence into a correct
structured object, per axis, and at what latency and cost?**

That is the only question this repository answers. The corpus is frozen, the
chunker is frozen, the retrieval is frozen, the prompt is frozen and its hash is
recorded, the scorer is deterministic. The model is the only thing that changes
between two rows of the leaderboard.

There is no LLM judge anywhere. Every item has a gold object, every answer is
normalized by published rules, and a field is correct when the normalized model
value equals the normalized gold value. You can reproduce any number in the
leaderboard from the files in `results/`.

## Leaderboard

<!-- LEADERBOARD:START -->

| model | items | overall | entities | facts | supersession | conflict | abstain | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 204 | 100.0% | 100.0% (n=40) | 100.0% (n=41) | 100.0% (n=42) | 100.0% (n=41) | 100.0% (n=40) | 100.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |
| null | 204 | 19.6% | 0.0% (n=40) | 0.0% (n=41) | 0.0% (n=42) | 0.0% (n=41) | 100.0% (n=40) | 0.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |

Corpus version **v1**, pipeline hash `f7bbdd5fe0812c4d`, prompt hash `1c5c35327076c6b6`. Rows are only comparable when all three match.

Scored with scorer hash `a00a18f53f3c962d`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

Retrieval hit rate for this corpus version: **98.8%** of the 164 items that have gold documents. It is a property of the frozen pipeline, not of any model, so it is the same for every row. The abstain items have no gold documents and are excluded from that denominator.

Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:

- `oracle`: temperature 0, max output tokens 512, 0 call errors.
- `null`: temperature 0, max output tokens 512, 0 call errors.

<!-- LEADERBOARD:END -->

`oracle` and `null` are offline mocks rather than models: the oracle returns the
gold object for every item and the null model returns nulls. They are the
harness checking itself, so read every other row against them: the oracle has to
be at 100% on every axis or the scorer is broken, and the null model has to be at
100% on abstain and 0% everywhere else or the abstain axis is free points.

## Try it without an API key

The corpus, the index and the query vectors are all committed, and two of the
models are offline mocks, so the whole harness runs with no key and no network:

```bash
npm install
npm test                                             # 91 tests, no key needed
npm run bench -- --version v1 --model oracle         # returns the gold object: must score 100%
npm run bench -- --version v1 --model null           # returns all nulls: the abstain baseline
npm run report -- --version v1                       # regenerates the CSV and the leaderboard
```

## Run a real model

```bash
export ANTHROPIC_API_KEY=...        # or DEEPSEEK_API_KEY, ALIBABA_API_KEY, ...
npm run bench -- --version v1 --model claude-haiku-4-5
npm run bench -- --version v1 --model all
npm run report -- --version v1
```

Keys come from the process environment first, then from a gitignored `.env` in
the repository root, then from the file named by `RETRIEVAL_BENCH_ENV_FILE`.
There is no other source. Key values are never printed, logged or written into
results.

Flags: `--limit N` runs only the first N items, `--force` overrides the spend
cap, `--allow-unpriced` runs a model whose price could not be verified.

## Adding a model

One entry in `models.json` and one command. No code.

```json
{
  "name": "my-model",
  "provider": "openai-compatible",
  "providerName": "myprovider",
  "modelId": "my-model-v1",
  "baseURL": "https://api.example.com/v1",
  "apiKeyEnv": "MY_PROVIDER_API_KEY",
  "providerOptions": { "myprovider": { "some_body_field": false } },
  "pricing": { "input_per_mtok": 0.5, "output_per_mtok": 1.5, "cached_input_per_mtok": null },
  "pricing_verified": "2026-09-03"
}
```

`provider` is `anthropic` (the Messages API through `@ai-sdk/anthropic`),
`openai-compatible` (any OpenAI-shaped endpoint through
`@ai-sdk/openai-compatible`) or `mock` (offline). `providerOptions` is keyed by
`providerName`, and for an OpenAI-shaped endpoint every key under it is written
straight into the JSON request body. That is how DeepSeek gets
`thinking: {"type": "disabled"}`, DashScope gets `enable_thinking: false` and
Anthropic models get thinking disabled. `test/request-body.test.ts` captures the
outgoing request against a mock endpoint and asserts those fields are on it, so a
provider package that stopped forwarding them fails the suite instead of quietly
spending a paid run's output budget on reasoning.

Prices are US dollars per million tokens, copied from the provider's own
published pricing on the date in `pricing_verified`. Nothing is estimated: a
price that could not be read is `null`, and the runner refuses to run an
unpriced model unless you pass `--allow-unpriced`.

Then:

```bash
npm run bench -- --version v1 --model my-model && npm run report -- --version v1
```

## The five axes

204 items, 40 to 42 per axis. Every item is a question plus a small typed schema
plus a gold object.

**`entities` (40).** Who or which named thing. Includes metadata questions: who
said it, in which channel, which issue tracks it.

```json
{"id":"v1-ent-004","axis":"entities",
 "question":"Which Linear issue tracks raising the per-tenant API rate limit?",
 "schema":{"type":"object","properties":{"issue_id":{"type":"string"}},"required":["issue_id"],"additionalProperties":false},
 "expected":{"issue_id":"PAL-104"},"gold_doc_ids":["PAL-104"],
 "notes":"Exactly one issue has that title."}
```

**`facts` (41).** Values, numbers, dates and decisions that are stated and never
revised.

```json
{"id":"v1-fac-006","axis":"facts",
 "question":"How many minutes did the 21 February gateway outage last?",
 "schema":{"type":"object","properties":{"minutes":{"type":"number"}},"required":["minutes"],"additionalProperties":false},
 "expected":{"minutes":72},"gold_doc_ids":["mtg-002","PAL-106-c1"],
 "notes":"The incident review states the confirmed duration."}
```

**`supersession` (42).** The value that holds now, after later updates. The naive
answer is the older one, and the older one is usually stated more often.

```json
{"id":"v1-sup-001","axis":"supersession",
 "question":"What is the current general availability date for Palisade v4?",
 "schema":{"type":"object","properties":{"ga_date":{"type":"date"}},"required":["ga_date"],"additionalProperties":false},
 "expected":{"ga_date":"2026-04-07"},"gold_doc_ids":["slack-launch-007","slack-launch-011","email-005"],
 "notes":"Three earlier messages give older GA dates; the newest dated statement is the current one."}
```

**`conflict` (41).** A wrong statement that was later corrected, a distractor
with a similar entity or number, or a stale value repeated by someone who missed
the correction.

```json
{"id":"v1-con-007","axis":"conflict",
 "question":"What is the p99 latency SLO for the Palisade gateway after the February tightening, in milliseconds?",
 "schema":{"type":"object","properties":{"p99_ms":{"type":"number"}},"required":["p99_ms"],"additionalProperties":false},
 "expected":{"p99_ms":180},"gold_doc_ids":["slack-eng-017","slack-eng-019"],
 "notes":"108 ms was guessed in the thread and corrected in the next message."}
```

**`abstain` (40).** The answer is not in the corpus. The expected object is null.
Several of these have near misses in the retrieved evidence, which is the point.

```json
{"id":"v1-abs-005","axis":"abstain",
 "question":"On what date does the Palisade Tokyo residency region become available?",
 "schema":{"type":"object","properties":{"ga_date":{"type":"date"}},"required":["ga_date"],"additionalProperties":false},
 "expected":{"ga_date":null},"gold_doc_ids":[],
 "notes":"Tokyo is not among the six regions and is never mentioned."}
```

## The corpus

`corpus/v1/` is a frozen snapshot of the internal records of an invented
company, Wrenfield, over the three months around a product release: 120 short
documents, 15,671 characters in total. 80 Slack messages across three channels,
many in threads; 12 Linear-style issues with 14 comments; 6 emails; 5 meeting
notes; 3 documents. Every document carries an id, a type, an author, an ISO 8601
timestamp with a timezone, and where they apply a channel, a project, a thread
or parent id and a title. Nothing in it describes a real company or person.

It is planted rather than sampled. Around twenty values are stated and then
changed later in a dated message, so the current answer and the most repeated
answer differ. Several statements are wrong and corrected shortly after, and
several corrected values are then repeated stale by somebody who missed the
correction. Similar entities and similar numbers sit next to each other on
purpose: Northgate Bank against Northgate Health, the gateway p99 against the
Palisade Edge p99, the default retention window against the Enterprise one. And
a long list of plausible questions has no answer anywhere in the corpus, which
is what the abstain axis is made of. `corpus/v1/README.md` describes the mix and
the planted structures without giving the answers away.

## The pipeline

Fixed for the life of a corpus version. Its source files are hashed into
`pipeline_hash`, which is recorded on every run. The scorer is deliberately not
part of that hash: see [Versioning](#versioning).

**Ingest.** Each document becomes one or more chunks. A Slack message is always
exactly one chunk; anything longer is packed onto sentence boundaries at a 500
character target. In v1 no document reaches that target, so the index holds one
chunk per document. Every chunk gets a contextual prefix naming its type,
channel or project, author, date and title, for example:

```
[slack message in #eng-palisade | by Dan Okonkwo | on 2026-02-11]
Tightening the gateway SLO: p99 latency is now 180 ms. p95 stays at 90 ms.
```

The prefix is part of the text BM25 indexes and part of the text that is
embedded, so a question about a channel or an author can match on metadata the
message body never repeats.

**Embeddings.** `gemini-embedding-001` at 768 dimensions, unit normalized,
written to `corpus/v1/index/embeddings.f32`. Every item question is embedded with
the same model and committed to `corpus/v1/index/queries.f32`. Both are part of
the corpus version, and both are committed, so a bench run needs no embedding key
at all. A different embedding model means a new corpus version.

**No LLM at ingest.** v1 has no distill, summarize or enrich step. This is a
deliberate v1 decision: the single extraction call is the only model call in the
whole benchmark, so it is the only thing a leaderboard difference can be
attributed to.

**Query.** Two ranked lists over the same chunks: Okapi BM25 (k1 = 1.5, b = 0.75)
over the chunk text, and cosine over the committed vectors. They are fused with
Reciprocal Rank Fusion at k = 60, given a soft recency boost worth at most a
tenth of one rank-1 RRF contribution and scaled across the corpus timeline,
capped at 2 chunks per document, and cut to the top 8. There is no LLM rerank:
selection among the 8 is folded into the single extraction call.

| parameter | value |
| --- | --- |
| `top_n` | 8 chunks |
| `rrf_k` | 60 |
| `recency_weight` | 0.1 |
| `max_chunks_per_doc` | 2 |
| chunk target | 500 characters |
| embedding | `gemini-embedding-001`, 768 dims |
| temperature | 0 |
| `max_tokens` | 512 |

**The call.** One streamed call per item. A fixed system prompt (hashed as
`prompt_hash`), the retrieved evidence rendered with its metadata, the question,
and the item schema. The model is told to reply with a JSON object matching the
schema and nothing else, to use null for anything the evidence does not support,
and to prefer the newest dated evidence when values conflict. Streaming is only
there to measure time to first token. The reply is parsed robustly, code fences
and surrounding prose included; an unparseable reply is retried exactly once and
the retry is counted in `retries`. The prompt is never changed per model.

`temperature: 0` and `max_tokens: 512` apply to every model. A `models.json`
entry may override one of those only when the provider rejects the fixed value
(some models reject sampling parameters outright), and the override is recorded
in `run.json` and printed under the leaderboard.

**Retrieval hit.** Each item records whether any chunk from a gold document made
the top 8. That is a property of the frozen pipeline, not of the model, so it is
identical across runs, reported once, and the leaderboard also reports accuracy
conditioned on it. Abstain items have no gold documents and are excluded from
that denominator.

## Scoring

A field is correct when its normalized value equals the normalized gold value.
An item is correct when every one of its fields is correct. Per-field
correctness is recorded too, so a near miss is visible in the results rather
than rounded away.

The normalization rules, applied in this order:

1. `null`, a missing field and the empty string all become null. Null matches
   only null.
2. Every scalar is stringified, trimmed, lowercased, its whitespace collapsed to
   single spaces, and its surrounding punctuation and quotes stripped.
3. A `number` field then has currency symbols, unit words, percent signs and
   thousands separators removed and scale words applied, so `180 ms`,
   `EUR 2,900`, `0.05%` and `120 million` all parse. A comma is read as a decimal
   separator only when it is followed by one or two digits at the end.
4. A `date` field is parsed to `YYYY-MM-DD` from ISO, `YYYY/MM/DD`,
   `7 April 2026` and `April 7, 2026`. A bare `07-04-2026` is rejected because it
   cannot be told apart from `MM-DD-YYYY`.
5. A `time` field is parsed to `HH:MM` on a 24 hour clock, so `09:41`, `9:41`,
   `09:41 UTC`, `15:00 CET`, `3 pm` and `15:00h` are one value. The zone word is
   dropped rather than used to convert, because the gold value is the time as the
   corpus states it. A bare hour is not a time, and neither is anything else.
6. A `boolean` field accepts yes/no, true/false, y/n and 1/0.
7. A `string` field is resolved through `corpus/v1/aliases.json` by exact match
   on the whole normalized string, so `dan`, `@dan` and `Dan Okonkwo` are one
   value. Alias resolution is never substring replacement and aliases never
   chain.
8. A `string[]` field normalizes every element as a string and compares as a
   set, so order and duplicates do not matter.

Anything that fails to parse falls back to its step 2 form, which simply does not
equal the gold value. A reply that could not be parsed into an object at all is
incorrect on every field, abstain items included: refusing to emit JSON is not
the same as answering null.

None of this is frozen the way the corpus and the prompt are. Every stored run is
re-scored with the current rules when the report runs, and the rules in force are
fingerprinted as `scorer_hash`.

## Cost cap and the arithmetic

Before a run the harness estimates input tokens as characters over four across
the exact prompts it is about to send, adds the full output budget per item, and
prices both from `models.json`. If the projection is over **$5.00** the run
refuses to start unless you pass `--force`. Actual cost is computed from the
token counts the provider reports, not from the estimate, and both go into
`run.json`.

The projection for corpus v1, all 204 items:

- 167,302 estimated input tokens in total, which is **820 tokens per item**
  including the system prompt. 292 of those are the system prompt, and the rest
  is the item schema plus the 8 retrieved chunks with their metadata.
- 104,448 output tokens, which is 204 items at the 512 token ceiling. That is the
  worst case by construction: a model that answers with the object and stops uses
  a small fraction of it, and the gap between the projection and the actual cost
  in `run.json` is that fraction.
- The most expensive model in `models.json` is `claude-opus-5` at $5.00 per
  million input tokens and $25.00 per million output tokens. That projects to
  167,302 × $5 / 1e6 = **$0.84** of input plus 104,448 × $25 / 1e6 = **$2.61** of
  output, so **$3.45** for a full run, under the cap. `deepseek-v4-flash`, the
  cheapest priced model here, projects to **$0.21**.

Every priced model in `models.json` projects under the cap, so no reduction to
`top_n` or the chunk size was needed.

Building the index is the only other spend: `gemini-embedding-001` over 120
chunks and 204 questions. The provider reported no embedding token usage, so
`corpus/v1/index/meta.json` records `embedding_tokens: null` rather than a guess.
The index is committed, so nobody has to repeat that spend either.

## Versioning

A result belongs to the tuple **corpus + embeddings + prompt + pipeline code +
scorer**. The corpus version and the embedding model are recorded as
`corpus_version` in `run.json` and inside `corpus/v1/index/meta.json`. The other
three are hashes, and they are three rather than one because the things they
cover fail differently:

| hash | covers | recorded |
| --- | --- | --- |
| `pipeline_hash` | `bm25.ts`, `chunk.ts`, `retrieve.ts`, `rrf.ts` | at run time, in `run.json` |
| `prompt_hash` | the system prompt string | at run time, in `run.json` |
| `scorer_hash` | `parse.ts`, `normalize.ts`, `score.ts`, `aliases.json` | at report time, in the leaderboard header |

`pipeline_hash` and `prompt_hash` are recorded at run time because what a model
was shown cannot be replayed afterwards. `scorer_hash` is computed at report time
instead, because scoring *is* replayed: `items.jsonl` keeps the raw reply for
every item, and `npm run report` re-parses and re-scores every stored run with
the current parser, normalizer, scorer and alias table, taking the item schemas
and the gold objects from the corpus. A scoring fix therefore reaches every run
that has ever been made and never needs a paid re-run. `run.json` keeps the score
the run itself computed as `accuracy_at_run`, and the report names any run whose
score moved, both on stdout and under the leaderboard.

**Never compare rows whose versions or hashes differ.** Changing a document, an
item, the chunker or the embedding model means `corpus/v2`, a fresh index and a
fresh leaderboard. A corpus is frozen the moment it is published. The alias table
is the one exception: it is part of `scorer_hash` rather than of the corpus
version, because changing it re-scores every existing run rather than
invalidating it.

## Results layout

Three layers, none of them written by hand.

1. `results/v1/runs/<run-id>/items.jsonl` is the source of truth: one line per
   item with the item id, axis, retrieved chunk ids, the retrieval hit flag, the
   full rendered prompt, the raw output, the parsed object, the expected object,
   per-field correctness, whether the item is correct, latency, time to first
   token, tokens in/out/reasoning/cached, cost, retries, finish reason and any
   error. `tokens_reasoning` is the part of `tokens_out` the provider attributed
   to reasoning, and it is what makes a model that thinks its output budget away
   visible in the results rather than only in its retry count.
   `run.json` next to it holds the run id, the model, the parameters, the corpus
   version, the pipeline and prompt hashes, the code commit, the timestamps, the
   totals, projected against actual cost, and `accuracy_at_run`: the score the
   run computed for itself, kept for the record and not used by the report.
2. `results/v1/results.csv` is generated from every `items.jsonl` after
   re-scoring: one row per item per run, all the scalar columns plus a compact
   expected and got object. No prompts, no raw outputs.
3. `results/v1/LEADERBOARD.md` is generated from the same re-scored runs and
   injected into this README between the marker comments.

Run ids are `YYYYMMDD-HHMM-<model-name>` in UTC, and that is also the directory
name.

## What this does not measure

- **Embedding models and retrieval strategies.** The read arm is fixed on
  purpose. Changing it is a different experiment and needs a new corpus version.
- **Ingest strategies.** There is no distill, enrich or summarize step to compare.
- **Prose quality.** The model emits a JSON object and nothing else. Nothing here
  says anything about how well a model writes, explains or summarizes.
- **Agentic behaviour.** One call, no tools, no follow-up queries, no
  multi-turn.
- **Long context.** The whole corpus is about 4,000 tokens. This measures
  reading 8 retrieved chunks correctly, not reading a book.
- **Real-world data.** The corpus is invented. It is built to look like real
  company records and to contain the failure modes real records contain, but it
  is not a sample of anything.

A model that scores well here is good at one narrow thing: taking a handful of
dated, partly contradictory snippets and producing the right typed object, or
correctly saying it does not know.

## Repository layout

```
corpus/v1/         docs.jsonl, items.jsonl, aliases.json, README.md, index/
models.json        every model the benchmark can run
src/               the pipeline, the runner and the report generators
src/bin/           build-index, bench, report, validate
test/              node:test, no keys needed
results/v1/        runs/, results.csv, LEADERBOARD.md
```

`npm run validate -- --version v1` re-checks the frozen corpus and prints a
grounding report. `npm run typecheck` runs `tsc --noEmit`.

Node 24, TypeScript run with tsx, ESM, `node:test`. The only runtime dependencies
are the Vercel AI SDK and its provider packages; BM25, the fusion, the
normalizer and the scorer are written here.

## License

MIT. See `LICENSE`.
