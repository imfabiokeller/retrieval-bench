# retrieval-bench

**Given a fixed retrieval pipeline over a frozen corpus of realistic company
data, how reliably does a model turn retrieved evidence into a correct
structured object, per axis, and at what latency and cost?**

That is the only question this repository answers. The corpus is frozen, the
chunker is frozen, the retrieval is frozen, the prompt is frozen and its hash is
recorded, the scorer is deterministic. The model is the only thing that changes
between two rows of the leaderboard.

There is no LLM judge anywhere. Every field has a gold value, every answer is
normalized by published rules, and a field is correct when the normalized model
value equals the normalized gold value. You can reproduce any number in the
leaderboard from the files in `results/`.

## Leaderboards

There is one leaderboard per corpus version, and rows from different versions are
never comparable: different documents, different index, different retrieval
parameters, different scale.

### Corpus v2

The hard one. 449 documents, 123 items, 468 scored fields. An item is a **case**:
one question, one retrieval, one model call, and a schema of three to six fields
that each carry their own axis and their own gold documents. The per-axis numbers
are accuracies over **fields**; `case fully correct` is the strictness column
beside them.

<!-- LEADERBOARD:v2:START -->

| model | fields | overall | entities | facts | supersession | conflict | abstain | asof | join | exhaustive | aggregation | cases | case fully correct | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 468 | 100.0% | 100.0% (n=59) | 100.0% (n=42) | 100.0% (n=51) | 100.0% (n=53) | 100.0% (n=69) | 100.0% (n=52) | 100.0% (n=49) | 100.0% (n=50) | 100.0% (n=43) | 123 | 100.0% | 100.0% | 0 | 8 | 8 | 5 | 0 | 0 | 0 | $0.0000 |
| null | 468 | 14.7% | 0.0% (n=59) | 0.0% (n=42) | 0.0% (n=51) | 0.0% (n=53) | 100.0% (n=69) | 0.0% (n=52) | 0.0% (n=49) | 0.0% (n=50) | 0.0% (n=43) | 123 | 3.3% | 0.0% | 0 | 8 | 8 | 5 | 0 | 0 | 0 | $0.0000 |

Corpus version **v2**, pipeline hash `f7bbdd5fe0812c4d`, prompt hash `1c5c35327076c6b6`, top 12 chunks. Rows are only comparable when all of those match.

The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.

Scored with scorer hash `623dc719c2a745bb`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

Twin gap. A twin asks one hard field of a case on its own, with the same gold documents and the same expected value, so the difference is what the rest of the case costs:

- `oracle`: 100.0% on the 33 twin fields, 100.0% on the same fields inside their cases, +0.0 points.
- `null`: 0.0% on the 33 twin fields, 0.0% on the same fields inside their cases, +0.0 points.

Retrieval hit rate for this corpus version: **88.2%** of the 399 fields that have gold documents. A field is a hit when at least one retrieved chunk comes from one of that field's own gold documents. It is a property of the frozen pipeline, not of any model, so it is the same for every row. Abstain fields have no gold documents and are excluded from that denominator.

Per axis: entities 86.4% (n=59), facts 78.6% (n=42), supersession 66.7% (n=51), conflict 83.0% (n=53), asof 98.1% (n=52), join 100.0% (n=49), exhaustive 96.0% (n=50), aggregation 97.7% (n=43).

Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:

- `oracle`: temperature 0, max output tokens 512, 0 call errors.
- `null`: temperature 0, max output tokens 512, 0 call errors.

<!-- LEADERBOARD:v2:END -->

### Corpus v1

The first one, and too easy: the one real model that has run it answered 99% of
its items. It is kept because it is published and reproducible, and because it is
the reference point that made v2 worth building. A v1 item states one axis for
the whole item, so each of its fields inherits that axis and the table below
reads the way it always did.

<!-- LEADERBOARD:v1:START -->

| model | fields | overall | entities | facts | supersession | conflict | abstain | cases | case fully correct | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 218 | 100.0% | 100.0% (n=40) | 100.0% (n=42) | 100.0% (n=51) | 100.0% (n=45) | 100.0% (n=40) | 204 | 100.0% | 100.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |
| deepseek-v4-flash | 218 | 99.1% | 97.5% (n=40) | 100.0% (n=42) | 98.0% (n=51) | 100.0% (n=45) | 100.0% (n=40) | 204 | 99.0% | 99.4% | 0 | 859 | 1276 | 723 | 178996 | 1647 | 0 | $0.0567 |
| null | 218 | 18.3% | 0.0% (n=40) | 0.0% (n=42) | 0.0% (n=51) | 0.0% (n=45) | 100.0% (n=40) | 204 | 19.6% | 0.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |

Corpus version **v1**, pipeline hash `f7bbdd5fe0812c4d`, prompt hash `1c5c35327076c6b6`, top 8 chunks. Rows are only comparable when all of those match.

The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.

Scored with scorer hash `5510bad67a41e16d`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

Retrieval hit rate for this corpus version: **98.3%** of the 178 fields that have gold documents. A field is a hit when at least one retrieved chunk comes from one of that field's own gold documents. It is a property of the frozen pipeline, not of any model, so it is the same for every row. Abstain fields have no gold documents and are excluded from that denominator.

Per axis: entities 100.0% (n=40), facts 100.0% (n=42), supersession 96.1% (n=51), conflict 97.8% (n=45).

Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:

- `oracle`: temperature 0, max output tokens 512, 0 call errors.
- `deepseek-v4-flash`: temperature 0, max output tokens 512, 0 call errors.
- `null`: temperature 0, max output tokens 512, 0 call errors.

<!-- LEADERBOARD:v1:END -->

`oracle` and `null` are offline mocks rather than models: the oracle returns the
gold object for every item and the null model returns nulls. They are the harness
checking itself, so read every other row against them: the oracle has to be at
100% on every axis or the scorer is broken, and the null model has to be at 100%
on abstain and 0% everywhere else or the abstain axis is free points.

## Try it without an API key

The corpora, the indexes and the query vectors are all committed, and two of the
models are offline mocks, so the whole harness runs with no key and no network:

```bash
npm install
npm test                                             # 114 tests, no key needed
npm run bench -- --version v2 --model oracle         # returns the gold object: must score 100%
npm run bench -- --version v2 --model null           # returns all nulls: the abstain baseline
npm run report -- --version v2                       # regenerates the CSV and the leaderboard
```

Swap `v2` for `v1` to run the older corpus. Every command takes `--version`, and
`npm run report` writes one CSV and one leaderboard per version.

## Run a real model

```bash
export ANTHROPIC_API_KEY=...        # or DEEPSEEK_API_KEY, ALIBABA_API_KEY, ...
npm run bench -- --version v2 --model claude-haiku-4-5
npm run bench -- --version v2 --model all
npm run report -- --version v2
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
npm run bench -- --version v2 --model my-model && npm run report -- --version v2
```

## The case, and the nine axes

A v2 item is one question, one retrieval, one model call and one object. Every
field of that object carries its own `axis` and its own `gold_doc_ids`, so a
single case is scored on four or five different kinds of reading at once, and
most cases mix fields that are answerable with fields that are not:

```json
{"id":"v2-case-011","axis":"facts",
 "question":"Summarize the 19 January outage: the start time in UTC, the confirmed duration in minutes, the issue that tracks the root cause, the regions confirmed as affected, and the customer credits paid out in euros.",
 "schema":{"type":"object","properties":{"start_utc":{"type":"time"},"duration_minutes":{"type":"number"},"root_cause_issue":{"type":"string"},"regions_affected":{"type":"string[]"},"customer_credits_eur":{"type":"number"}},"required":["start_utc","duration_minutes","root_cause_issue","regions_affected","customer_credits_eur"],"additionalProperties":false},
 "expected":{"start_utc":"15:20","duration_minutes":72,"root_cause_issue":"WRN-204","regions_affected":["Amsterdam","Frankfurt","Dublin"],"customer_credits_eur":null},
 "gold_doc_ids":["mtg-001","slack-eng-core-033","WRN-204","slack-eng-core-031","slack-eng-core-034","WRN-204-c1"],
 "fields":{"start_utc":{"axis":"facts","gold_doc_ids":["mtg-001"]},
           "duration_minutes":{"axis":"conflict","gold_doc_ids":["mtg-001"]},
           "root_cause_issue":{"axis":"join","gold_doc_ids":["slack-eng-core-033","WRN-204"]},
           "regions_affected":{"axis":"exhaustive","gold_doc_ids":["slack-eng-core-031","slack-eng-core-034","WRN-204-c1"]},
           "customer_credits_eur":{"axis":"abstain","gold_doc_ids":[]}},
 "notes":"Slack states the local clock and the review states UTC. ..."}
```

The item-level `axis` is a headline and `gold_doc_ids` is the union of the
per-field ones. Neither is what gets scored. A v1 item has no `fields` map: every
one of its fields inherits the item-level axis and gold documents, which is what
keeps v1 items valid and v1 runs re-scorable under the same code.

Nine axes, each with a real field from the corpus.

**`entities` (59 fields in v2).** Who or which named thing, including metadata:
who wrote it, who was on call, who signed it.

> `v2-case-001.set_by` expects `"Priya Raman"` from `slack-eng-core-003`. The
> question asks who set the value that was in force on a stated date, so the
> right author is the author of the third message in a chain of four.

**`facts` (42).** A value stated once and never revised.

> `v2-case-011.start_utc` expects `"15:20"` from `mtg-001`. Slack says
> `16:20 CET` on the day and the incident review says `15:20 UTC`. The question
> asks for UTC, and the `time` type compares the clock time as stated rather than
> converting it.

**`supersession` (51).** The value that holds now, after later changes. The naive
answer is the older one, and the older one is usually stated more often.

> `v2-case-003.current_value` expects `52` from `slack-eng-core-009`, the fourth
> of four dated changes. A later message still repeats the second value.

**`conflict` (53).** A wrong value that was corrected, a proposal sitting next to
the decision, a retraction, or a correction inside a single message.

> `v2-case-011.duration_minutes` expects `72` from `mtg-001`. 95 minutes was
> quoted in the channel on the day of the outage and replaced by the measured
> duration in the review.

**`abstain` (69).** The corpus does not support a value, so the field is null. In
v2 most of these sit inside a case that is otherwise answerable.

> `v2-case-011.customer_credits_eur` expects `null`. Ten outages are written up
> in detail and no credit is ever mentioned.

**`asof` (52).** The value in force on a stated past date. The newest value is
wrong by construction, and so is the most repeated one.

> `v2-case-004.value_on_date` expects `12000` from `slack-eng-core-013`: the
> audit export batch size on 2027-04-27, after two changes and before the third.

**`join` (49).** The answer needs two documents chained by an id, a title or a
thread.

> `v2-case-012.root_cause_issue` expects `"WRN-207"` from `slack-eng-relay-013`
> and `WRN-207`. Slack names the issue by its title and never by its id, and 14
> other issues carry a title that differs from a real one by a word.

**`exhaustive` (50).** Every member of a set, spread over several documents, with
at least one entry taken off later. Scored as a set, so order and duplicates do
not matter.

> `v2-case-013.regions_affected` expects `["Frankfurt","Amsterdam"]` from the
> alert, the follow-up and the issue comment. Sydney was named on the day,
> withdrawn in the comment, and repeated afterwards by somebody who missed it.

**`aggregation` (43).** A count or a sum over several documents. Deterministic
arithmetic, never an estimate.

> `v2-case-021.total_eur` expects `25000` from `email-001`,
> `slack-compliance-011` and `email-002`: three euro line items in three
> documents, with a dollar list price sitting beside the first one.

## Scoring

**A field is the unit.** It is correct when its normalized value equals the
normalized gold value. A case is correct when every one of its fields is correct,
which the leaderboard reports separately as `case fully correct`. Per-axis
accuracy is an accuracy over the fields tagged with that axis, and every cell
carries its own n.

**Retrieval hit is per field too.** A field is a hit when at least one retrieved
chunk comes from one of *that field's* gold documents. Abstain fields have no
gold documents, so they have no flag and are excluded from the denominator. The
leaderboard reports the rate for the corpus version, the rate per axis, and each
model's accuracy conditioned on a hit.

**Twin gap.** 33 of the v2 items are twins: a single-field item that repeats the
hardest field of a case, with the same gold documents and the same expected
value, asked on its own. The only difference is the question, and therefore the
retrieval and the company the field keeps. The report prints, per model, the
accuracy on the twin fields against the accuracy on the same fields inside their
cases. That difference is what the rest of the case costs.

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
7. A `string` field is resolved through the alias table of its corpus version by
   exact match on the whole normalized string, so `dan`, `@dan` and `Dan Okonkwo`
   are one value. Alias resolution is never substring replacement and aliases
   never chain.
8. A `string[]` field normalizes every element as a string and compares as a
   set, so order and duplicates do not matter.

v2 needed no new rule. It did need two aliases *not* to exist: `ravi`, because
two people on two teams carry that first name, and `relay`, because it is also
the name of an issue label. Both absences are asserted in the test suite.

Anything that fails to parse falls back to its step 2 form, which simply does not
equal the gold value. A reply that could not be parsed into an object at all is
incorrect on every field, abstain fields included: refusing to emit JSON is not
the same as answering null.

None of this is frozen the way the corpus and the prompt are. Every stored run is
re-scored with the current rules when the report runs, and the rules in force are
fingerprinted as `scorer_hash`.

## The corpora

**`corpus/v1/`** is three months around a product release at an invented company,
Wrenfield: 120 short documents, 15,671 characters, 204 items on five axes, one
question per item. Around twenty values change in a later dated message, several
statements are corrected and then repeated stale, and a long list of plausible
questions has no answer at all.

**`corpus/v2/`** is the same company a year later, and it is the one to run: 449
documents, 91,261 characters, 487 chunks, 123 items, 468 scored fields on nine
axes, 90 cases and 33 twins. It keeps everything v1 planted and adds as-of chains
that change four times, joins that have to be walked across doc types, sets that
gain and lose entries, arithmetic over several documents, currency and timezone
traps, a product renamed mid-corpus, two people with the same first name on
different teams, thread dependence where the value sits in the parent message,
42 weekly standups carrying the same six numbers with different values, 35
monthly digests that name every topic and answer nothing, and 14 issues whose
titles differ from a real one by a word.

Both corpus READMEs describe the mix and the planted structures without giving
the answers away, and both corpora are frozen: a change is a new version.

## The pipeline

Fixed for the life of a corpus version. Its source files are hashed into
`pipeline_hash`, which is recorded on every run. The scorer is deliberately not
part of that hash: see [Versioning](#versioning).

**Ingest.** Each document becomes one or more chunks. A Slack message is always
exactly one chunk; anything longer is packed onto sentence boundaries at a 500
character target. In v1 no document reaches that target, so the index holds one
chunk per document; in v2 the 35 digests do, so 449 documents make 487 chunks.
Every chunk gets a contextual prefix naming its type, channel or project, author,
date and title, for example:

```
[slack message in #eng-core | by Dan Okonkwo | on 2027-02-11]
gateway p99 latency budget is now 190 ms. The old number is retired. No action needed from anyone outside the team.
```

The prefix is part of the text BM25 indexes and part of the text that is
embedded, so a question about a channel or an author can match on metadata the
message body never repeats.

**Embeddings.** `gemini-embedding-001` at 768 dimensions, unit normalized,
written to `corpus/<version>/index/embeddings.f32`. Every item question is
embedded with the same model and committed to `queries.f32`. Both are part of the
corpus version, and both are committed, so a bench run needs no embedding key at
all. A different embedding model means a new corpus version.

**No LLM at ingest.** There is no distill, summarize or enrich step in either
version. The single extraction call is the only model call in the whole
benchmark, so it is the only thing a leaderboard difference can be attributed to.

**Query.** Two ranked lists over the same chunks: Okapi BM25 (k1 = 1.5, b = 0.75)
over the chunk text, and cosine over the committed vectors. They are fused with
Reciprocal Rank Fusion, given a soft recency boost worth at most a tenth of one
rank-1 RRF contribution and scaled across the corpus timeline, capped at 2 chunks
per document, and cut to the top n. There is no LLM rerank: selection among the
retrieved chunks is folded into the single extraction call.

The parameters belong to the corpus version rather than to the harness. They live
in `corpus/<version>/params.json`, the runner reads them from there, and they are
recorded on every run, so a published corpus keeps the read arm it was published
with.

| parameter | v1 | v2 |
| --- | --- | --- |
| `top_n` | 8 chunks | 12 chunks |
| `rrf_k` | 60 | 60 |
| `recency_weight` | 0.1 | 0.1 |
| `max_chunks_per_doc` | 2 | 2 |
| chunk target | 500 characters | 500 characters |
| embedding | `gemini-embedding-001`, 768 dims | same |
| temperature | 0 | 0 |
| `max_tokens` | 512 | 512 |

v2 reads 12 chunks rather than 8 because a case is broader than a v1 item: its
fields sit in up to six different documents.

**The call.** One streamed call per item. A fixed system prompt (hashed as
`prompt_hash`), the retrieved evidence rendered with its metadata, the question,
and the item schema. The model is told to reply with a JSON object matching the
schema and nothing else, to use null for anything the evidence does not support,
and to prefer the newest dated evidence when values conflict. Streaming is only
there to measure time to first token. The reply is parsed robustly, code fences
and surrounding prose included; an unparseable reply is retried exactly once and
the retry is counted in `retries`. The prompt is never changed per model or per
corpus version.

`temperature: 0` and `max_tokens: 512` apply to every model. A `models.json`
entry may override one of those only when the provider rejects the fixed value
(some models reject sampling parameters outright), and the override is recorded
in `run.json` and printed under the leaderboard.

**Retrieval hit.** A property of the frozen pipeline, not of the model, so it is
identical across runs and reported once per corpus version. Measured per field,
with the parameters above:

| version | fields with gold documents | hit rate |
| --- | --- | --- |
| v1 | 178 | 98.3% |
| v2 | 399 | 88.2% |

v2's rate is deliberately not near 100%. Template noise and near-duplicate
distractors were added until it landed between 85% and 90%, so that a leaderboard
can separate a model that read the evidence badly from a model that was handed
the wrong evidence. `test/corpus-v2.test.ts` fails if it drifts out of that band.

## Cost cap and the arithmetic

Before a run the harness estimates input tokens as characters over four across
the exact prompts it is about to send, adds the full output budget per item, and
prices both from `models.json`. If the projection is over **$5.00** the run
refuses to start unless you pass `--force`. Actual cost is computed from the
token counts the provider reports, not from the estimate, and both go into
`run.json`.

The projection for corpus v2, all 123 items:

- 167,682 estimated input tokens in total, which is **1,363 tokens per item**
  including the system prompt. 292 of those are the system prompt, and the rest
  is the item schema plus the 12 retrieved chunks with their metadata.
- 62,976 output tokens, which is 123 items at the 512 token ceiling. That is the
  worst case by construction: a model that answers with the object and stops uses
  a small fraction of it, and the gap between the projection and the actual cost
  in `run.json` is that fraction.
- The most expensive model in `models.json` is `claude-opus-5` at $5.00 per
  million input tokens and $25.00 per million output tokens. That projects to
  167,682 × $5 / 1e6 = **$0.84** of input plus 62,976 × $25 / 1e6 = **$1.57** of
  output, so **$2.41** for a full v2 run, well under the cap.
  `deepseek-v4-flash`, the cheapest priced model here, projects to **$0.16**.

Every priced model projects under the cap on both corpora, so no reduction to
`top_n` or the chunk size was needed. For the record, v1 projects to **$3.45** at
`claude-opus-5`: it has more items, but it reads 8 chunks instead of 12 and a v2
case answers five questions in the call where a v1 item answers one.

Building an index is the only other spend: `gemini-embedding-001` over the chunks
and the item questions. The provider reported no embedding token usage for either
version, so `meta.json` records `embedding_tokens: null` rather than a guess.
Both indexes are committed, so nobody has to repeat that spend either.

## Versioning

A result belongs to the tuple **corpus + embeddings + retrieval parameters +
prompt + pipeline code + scorer**. The corpus version and the embedding model are
recorded as `corpus_version` in `run.json` and inside the index's `meta.json`, and
the retrieval parameters are recorded in `run.json` under `params`. The other
three are hashes, and they are three rather than one because the things they
cover fail differently:

| hash | covers | recorded |
| --- | --- | --- |
| `pipeline_hash` | `bm25.ts`, `chunk.ts`, `retrieve.ts`, `rrf.ts` | at run time, in `run.json` |
| `prompt_hash` | the system prompt string | at run time, in `run.json` |
| `scorer_hash` | `parse.ts`, `normalize.ts`, `score.ts`, `fields.ts`, `aliases.json` | at report time, in the leaderboard header |

`pipeline_hash` and `prompt_hash` are recorded at run time because what a model
was shown cannot be replayed afterwards. `scorer_hash` is computed at report time
instead, because scoring *is* replayed: `items.jsonl` keeps the raw reply for
every item, and `npm run report` re-parses and re-scores every stored run with
the current parser, normalizer, scorer and alias table, taking the item schemas,
the gold objects and the per-field axes and gold documents from the corpus. A
scoring fix therefore reaches every run that has ever been made and never needs a
paid re-run. `run.json` keeps the score the run itself computed as
`accuracy_at_run`, and the report names any run whose score moved, both on stdout
and under the leaderboard.

**Never compare rows whose versions or hashes differ.** Changing a document, an
item, the retrieval parameters, the chunker or the embedding model means a new
corpus version, a fresh index and a fresh leaderboard. A corpus is frozen the
moment it is published. The alias table is the one exception: it is part of
`scorer_hash` rather than of the corpus version, because changing it re-scores
every existing run rather than invalidating it.

Adding a corpus version is additive by design. v2 introduced per-field axes and
gold documents and four new axes, and v1 needed no edit at all: a v1 item states
no `fields` map, so every one of its fields inherits the item-level axis and gold
documents, and every v1 run stored before the change re-scores under the new
code.

## Results layout

Three layers, none of them written by hand.

1. `results/<version>/runs/<run-id>/items.jsonl` is the source of truth: one line
   per item with the item id, the case axis, `twin_of`, the retrieved chunk ids,
   the item-level retrieval hit flag, the full rendered prompt, the raw output,
   the parsed object, the expected object, one row per field (its name, its axis,
   the normalized expected and got values, whether it is correct, and its own
   retrieval hit flag), whether the case is fully correct, latency, time to first
   token, tokens in/out/reasoning/cached, cost, retries, finish reason and any
   error. `tokens_reasoning` is the part of `tokens_out` the provider attributed
   to reasoning, and it is what makes a model that thinks its output budget away
   visible in the results rather than only in its retry count.
   `run.json` next to it holds the run id, the model, the parameters including
   `top_n`, the corpus version, the pipeline and prompt hashes, the code commit,
   the timestamps, the totals, projected against actual cost, and
   `accuracy_at_run`: the score the run computed for itself, kept for the record
   and not used by the report.
2. `results/<version>/results.csv` is generated from every `items.jsonl` after
   re-scoring: **one row per field per item per run**, with the item-level
   scalars repeated on each of that item's field rows. Filter on
   `field_ordinal = 0` for exactly one row per item before summing latency,
   tokens or cost. Every leaderboard number is recomputable from this file:
   per-axis accuracy is `field_correct` grouped by `field_axis`, case accuracy is
   `case_correct` where `field_ordinal = 0`, the conditioned accuracy is
   `field_correct` where `field_retrieval_hit` is true, and the twin gap compares
   rows whose `twin_of` is set against the same field of the item it names. No
   prompts, no raw outputs.
3. `results/<version>/LEADERBOARD.md` is generated from the same re-scored runs
   and injected into this README between that version's marker comments.

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
- **Long context.** v2 is about 23,000 tokens of corpus and the model is shown 12
  chunks of it. This measures reading a handful of retrieved snippets correctly,
  not reading a book.
- **Real-world data.** Both corpora are invented. They are built to look like
  real company records and to contain the failure modes real records contain, but
  they are not a sample of anything.

A model that scores well here is good at one narrow thing: taking a handful of
dated, partly contradictory snippets and producing the right typed object, or
correctly saying it does not know.

## Repository layout

```
corpus/v1/         docs.jsonl, items.jsonl, aliases.json, params.json, README.md, index/
corpus/v2/         the same shape, one year later and much harder
models.json        every model the benchmark can run
src/               the pipeline, the runner and the report generators
src/bin/           build-index, bench, report, validate
test/              node:test, no keys needed
results/v1/        runs/, results.csv, LEADERBOARD.md
results/v2/        the same, one directory per corpus version
```

`npm run validate -- --version v2` re-checks a frozen corpus and prints a
grounding report: the structural rules field by field, the field count per axis,
and any expected value that could not be found in the text of its own gold
documents. `npm run typecheck` runs `tsc --noEmit`.

Node 24, TypeScript run with tsx, ESM, `node:test`. The only runtime dependencies
are the Vercel AI SDK and its provider packages; BM25, the fusion, the
normalizer and the scorer are written here.

## License

MIT. See `LICENSE`.
