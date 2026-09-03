# retrieval-bench

Given a fixed retrieval pipeline over a frozen corpus, where every document a
question needs is guaranteed to be in the retrieved window, how reliably does a
model read that window?

That is the whole benchmark. The model is the only variable: the corpus is
frozen, the retrieval is fixed and, by construction, complete. There is no LLM
judge anywhere. [DESIGN.md](DESIGN.md) is the specification and records why each
of those decisions was made.

## The pack

One question, one retrieval, one call, one JSON object. The object is the same
shape every time, so there are no per-question schemas and no field names to
leak a hint:

```json
{
  "status": "answered",
  "value": 150,
  "history": [
    { "value": 190, "from": "2027-01-12" },
    { "value": 165, "from": "2027-03-24" },
    { "value": 150, "from": "2027-05-04" }
  ],
  "sources": ["slack-eng-palisade-001", "mtg-001", "slack-eng-palisade-002"]
}
```

That is the gold pack for a real question in this corpus:

> What is the p99 latency budget for the Palisade gateway now, in ms?

The budget was set at 190 in January, cut to 165 in March and cut again to 150
in May. Two later messages repeat 190 without changing anything, a mail quotes
165 under the new number, someone floats 120 for next quarter, and a message in
June asks whether we are still at 165 rather than saying so. The answer is 150,
and the chain is all three values with the dates they took effect.

The sources are every document that asserts one of those values in its own
voice, which on this question is exactly the three that made the changes: the
mail quotes 165 rather than stating it, the June message asks rather than says,
and 120 was floated and never decided. On other questions the rule pulls more
in. Every document that states the answer as it stands is a gold source, so a
restatement, a second list of the same members and a later note confirming the
same value all count, and a model that cites one of them is right.

## The four channels

Each channel is scored deterministically, by normalizing both sides and
comparing them. A question is scored on the channels its gold declares.

| channel | correct when |
| --- | --- |
| `value` | the normalized value equals the normalized gold value |
| `status` | `answered` or `not_in_evidence`, equal to the gold status |
| `history` | the set of normalized `(value, from)` pairs equals the gold chain exactly, so a stale repeat entered as a new step, a missing step and an extra step all fail |
| `sources` | every cited id is a gold source and at least one gold source is cited; recall is reported beside it |

`value`, `status` and `sources` are scored on every question. `history` is
scored only where the gold declares a chain, which it does on 61 of the 307
questions. A pack is **fully correct** when every scored channel is correct.
The share of packs fully correct is the benchmark's score.

For an abstain question the gold is `status: not_in_evidence`, `value: null`, an
empty chain and no sources, so citing anything fails the sources channel.

A reply that cannot be parsed into an object is wrong on every channel,
including on an abstain question: refusing to emit JSON is not the same as
answering `not_in_evidence`.

## The ten families

The question type, one leaderboard column each. Every family carries at least
thirty questions; the counts are in [corpus/v1/README.md](corpus/v1/README.md).

| family | asks for | a real one |
| --- | --- | --- |
| `lookup` | a value stated once and never revised | What is the drain timeout for a Palisade gateway edge node, in seconds? |
| `current` | the value that holds now, after one or more changes | What is the p99 latency budget for the Palisade gateway now, in ms? |
| `asof` | the value in force on a stated past date | What was the Palisade rate limit for the enterprise tier on 2027-04-15, in requests per minute? |
| `join` | an answer that needs two documents linked by an id, a title or a thread | Who is the escalation contact for the customer that filed WRN-4210? |
| `multihop` | three or more documents in a chain | What is the SLA response target for Kestrel Health, in minutes? |
| `exhaustive` | every member of a set, with additions and removals | Which are the regions where the Palisade rate limiter is enabled? |
| `aggregation` | a count or a sum over several documents, with duplicates to collapse | What is the total service credit issued for the March incidents, in EUR? |
| `temporal` | arithmetic on dates | On what date does the Palisade gateway cutover to the new load balancer happen? |
| `rule` | a policy stated in one place, applied to facts stated elsewhere | Did the 11 April edge outage require a written postmortem? |
| `abstain` | nothing; the corpus does not support a value | What is the p50 latency budget for the Palisade gateway, in ms? |

Most abstains are hard: the sibling of the asked-for thing is in the window and
stated plainly. The p99 latency budget is written down in eight documents; the
p50 budget never is, and one message says as much without giving a number.

## The fifteen traps

A trap is an annotation a question carries, and it is scored as resistance: the
share of the questions carrying that kind whose value channel was correct.
Every kind is planted in at least fifteen questions.

| trap | what is planted |
| --- | --- |
| `superseded` | an older value repeated after the change, often more than once |
| `statement_shaped_question` | the newest message asks "are we at 165 now?" and is not a statement |
| `quoted_email` | the newest email quotes the old value below the new one |
| `proposal` | a number floated in a thread next to the decided one |
| `retraction` | announced, then taken back, or ruled out, then put back |
| `scope` | the same metric differs by environment, tier or region; the question pins one |
| `relative_date` | "next Tuesday", "in two weeks", "the end of the quarter", resolved from the message timestamp |
| `unit` | EUR beside USD, seconds beside milliseconds; the question fixes the unit |
| `timezone` | a local clock with a zone word beside UTC, including the March DST change |
| `keyword` | a lexically similar document about something else |
| `same_name` | two people share a first name, and a product is renamed mid-corpus |
| `planned_vs_done` | "we migrate on the 14th" then "the migration finished on the 16th" |
| `negation` | regions not affected, customers except one, what a policy does not change |
| `chunk_split` | a long document where the subject sits in one chunk and the value in the next |
| `format` | the value inside a table, a numbered list, pasted JSON, a message with typos, or a message in German |

## The guarantee

For every question, every gold source has at least one chunk in the window the
frozen pipeline retrieves. The validator runs retrieval for all 277 questions
that have gold sources and fails on any miss, printing the question id and the
documents that were not there.

It holds at **100 percent** on this corpus with `top_n` 16. Retrieval hit rates
therefore do not appear on the leaderboard: the guarantee is a gate, not a
metric.

Getting there took rewriting, not tuning. Every miss was fixed by making a
document share the vocabulary a real record would share with the question, or by
rephrasing the question to name what the asker knows, never by adding an
expansion step to the pipeline. [corpus/v1/README.md](corpus/v1/README.md) lists
what was changed and why.

The traps still live inside the window. Distractors, stale repeats and
near-duplicates are retrieved alongside the gold documents; the guarantee is
that the truth is present, not that it is alone.

## The corpus

Wrenfield is an invented company with two products, eighteen people and eight
customers, written across the first half of 2027. There are 691 documents and
119,676 characters: 520 Slack messages across twelve channels, 63 reference
documents, 44 meeting notes, 40 emails, and thirteen issues with their comments.
Most of it is short, the way an archive is. Thirteen documents are deliberately
long enough to chunk into three or four pieces, and that is where the
`chunk_split` questions live. Weekly standups and monthly digests repeat the same template
with different numbers, and none of them answers anything: 254 of the 691
documents are a gold source for nothing at all.

It is written the way records are written, because artificial gaps make
artificial retrieval failures. Issues carry a description that names the
customer and the symptom, emails carry signatures and quoted chains, comments
say what they change, and questions name what a person asking would know. Values
sit in eleven plain text tables, in three numbered lists, in three pasted JSON
blocks, in two messages with a typo left in, and in nineteen messages in German.
The clocks go forward on 2027-03-28 and the timezone questions turn on that
hour.

## The pipeline and its parameters

Ingest is contextual chunking and nothing else. Every document becomes one or
more chunks of at most 500 characters, packed on sentence boundaries, and every
chunk gets a prefix carrying the document id, the type, the channel or project,
the author, the date and the title. That prefix is part of what is indexed and
part of what is embedded, and the document id leads it because the sources
channel is only answerable when the id is on the extract the answer came from.
A Slack message is always exactly one chunk. No LLM runs at ingest.

Retrieval is two arms fused: Okapi BM25 over the chunk text, and cosine over
committed `gemini-embedding-001` vectors of the same text. The two ranked lists
are fused with reciprocal rank fusion at k=60, given a soft recency boost,
capped at two chunks per document, and cut to `top_n`. There is no rerank, no
neighbour expansion and no reference expansion.

`corpus/v1/params.json` holds the parameters, because they belong to the corpus
rather than to the harness:

```json
{ "top_n": 16, "rrf_k": 60, "recency_weight": 0.1, "max_chunks_per_doc": 2 }
```

`top_n` is the only one that was tuned, and it is where the guarantee and the
cost cap meet. At 16 the guarantee holds at 100 percent and a full run projects
at $4.80 for the most expensive model in `models.json`. At 18 the projection is
a shade over five dollars and at 20 it is $5.22, and the cap refuses both.

## Scoring

Both sides of every comparison go through the same normalizer before they are
compared. Nulls and empty strings become null; every scalar is trimmed,
lowercased, whitespace-collapsed and stripped of surrounding punctuation;
numbers lose their currency symbols, unit words and thousands separators and
gain their scale words; dates parse to `YYYY-MM-DD` from the unambiguous forms;
times parse to `HH:MM` on a 24 hour clock with the zone word dropped rather than
converted; booleans accept yes/no and 1/0; strings lose a leading `a`, `an` or
`the` and then resolve through `corpus/v1/aliases.json` by exact match on the
whole string; lists compare as sets, so order and duplicates do not matter.

The article rule and the alias table are what keep the value channel about
reading rather than phrasing: `the platform team` and `platform team` are one
answer without any table saying so, and a surname resolves to the full name. The
table has no entry for the bare first name `Ravi` or the bare first name `Anna`,
because two people carry each in this corpus.

Every run is re-scored at report time from the raw replies stored in
`items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias
table reaches every run that has ever been made without a paid re-run.

## Cost

A full run has to project under five dollars for the most expensive model in
`models.json`, and the runner refuses to start otherwise unless it is given
`--force`. The estimator counts characters over four on the exact prompts it is
about to send, and bills the full output budget, so it is an upper bound.

For `claude-opus-5` at $5.00 per million input tokens and $25.00 per million
output tokens, over 307 questions with a 16 chunk window:

- input: 467,965 tokens, which is 1,524 per question including the system
  prompt, at $5.00 per million: **$2.34**
- output: 307 x 320 tokens of budget at $25.00 per million: **$2.46**
- total projected: **$4.80**

The output budget is billed in full whatever the model actually writes, so it is
where the cap was being wasted. A pack is a small JSON object: across the 307
replies below the longest is 204 output tokens and the 95th percentile is 140,
and the run that was made against a 512 token budget measured the same shape.
More than half of that projection was buying room no reply used. Cutting the
budget to 320 still leaves the longest reply half again as much room as it
needed, and it bought 71 more questions, which is what took every family to the
thirty the design asks for.

Actual cost is computed from the token counts the provider reports rather than
from the estimate. The `deepseek-v4-flash` run below projected $0.34 and cost
$0.18: the provider counted 511,483 input tokens against the estimator's
467,965, of which 172,800 were cache reads, and the replies used 18,572 output
tokens of the 98,240 budgeted.

## Leaderboard

<!-- LEADERBOARD:v1:START -->

Corpus version **v1**, pipeline hash `c9ff11afc1436a70`, prompt hash `dff88c3a4526f8e2`. Rows are only comparable when those match and the retrieval parameters match, which is why every group names its parameters.

The unit is the question: one question, one retrieval, one call, one pack, four channels. A model that has been run more than once on the same corpus and the same parameters is one row, and its cells carry the mean with the min to max spread of those runs.

Scored with scorer hash `4d813bd27519ffe6`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

**Score.** The share of packs fully correct: the value, the status, the chain where one is scored and the citations all right at once. Rows are ordered by it. Macro value accuracy beside it is the mean of value accuracy over the families, so each family weighs the same.

| model | runs | score | macro value accuracy | lookup | current | asof | join | multihop | exhaustive | aggregation | temporal | rule | abstain |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 1 | 100.0% | 100.0% | 100.0% (n=37) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) | 100.0% (n=30) |
| deepseek-v4-flash | 1 | 52.4% | 87.7% | 100.0% (n=37) | 63.3% (n=30) | 90.0% (n=30) | 100.0% (n=30) | 86.7% (n=30) | 96.7% (n=30) | 93.3% (n=30) | 63.3% (n=30) | 96.7% (n=30) | 86.7% (n=30) |
| null | 1 | 9.8% | 10.0% | 0.0% (n=37) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 0.0% (n=30) | 100.0% (n=30) |

**Channels.** Value and status are scored on every question, history only where the gold carries a chain, sources on every question. Sources recall is the share of gold sources cited, averaged over the questions whose gold cites anything.

| model | value | status | history | sources | sources recall |
|---|---|---|---|---|---|
| oracle | 100.0% (n=307) | 100.0% (n=307) | 100.0% (n=61) | 100.0% (n=307) | 100.0% |
| deepseek-v4-flash | 87.9% (n=307) | 96.7% (n=307) | 54.1% (n=61) | 57.7% (n=307) | 82.8% |
| null | 9.8% (n=307) | 9.8% (n=307) | 0.0% (n=61) | 9.8% (n=307) | 0.0% |

**Trap resistance.** The share of the questions carrying that trap whose value channel was correct.

| model | superseded | statement_shaped_question | quoted_email | proposal | retraction | scope | relative_date | unit | timezone | keyword | same_name | planned_vs_done | negation | chunk_split | format |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 100.0% (n=88) | 100.0% (n=26) | 100.0% (n=21) | 100.0% (n=28) | 100.0% (n=27) | 100.0% (n=29) | 100.0% (n=15) | 100.0% (n=21) | 100.0% (n=15) | 100.0% (n=52) | 100.0% (n=26) | 100.0% (n=15) | 100.0% (n=59) | 100.0% (n=16) | 100.0% (n=33) |
| deepseek-v4-flash | 75.0% (n=88) | 80.8% (n=26) | 85.7% (n=21) | 85.7% (n=28) | 59.3% (n=27) | 89.7% (n=29) | 53.3% (n=15) | 85.7% (n=21) | 100.0% (n=15) | 84.6% (n=52) | 88.5% (n=26) | 93.3% (n=15) | 94.9% (n=59) | 100.0% (n=16) | 84.8% (n=33) |
| null | 0.0% (n=88) | 0.0% (n=26) | 0.0% (n=21) | 0.0% (n=28) | 0.0% (n=27) | 44.8% (n=29) | 0.0% (n=15) | 9.5% (n=21) | 6.7% (n=15) | 30.8% (n=52) | 3.8% (n=26) | 0.0% (n=15) | 6.8% (n=59) | 0.0% (n=16) | 0.0% (n=33) |

**Cost and speed.** Tokens and cost are summed over the runs of the row; latency is averaged over them.

| model | questions | retries | call errors | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | cost |
|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 307 | 0 | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |
| deepseek-v4-flash | 307 | 0 | 0 | 1149 | 1613 | 817 | 511483 | 18572 | 0 | $0.1760 |
| null | 307 | 0 | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |

The guarantee held for **100.0%** of the 277 questions that have gold sources, which is a property of the corpus and of these parameters and is the same for every row above. It is a gate, not a metric: the corpus is written until it is 100 percent.

Every run uses temperature 0 and a 320 token output budget unless the model rejects one of those, in which case models.json records the override:

- `oracle`: temperature 0, max output tokens 320, 1 run.
- `null`: temperature 0, max output tokens 320, 1 run.
- `deepseek-v4-flash`: temperature 0, max output tokens 320, 1 run.

<!-- LEADERBOARD:v1:END -->

## Running it

Node 24 and `npm install`. Nothing else is needed for the offline parts.

```
npm test                                   # the suite, including the guarantee
npm run typecheck
npm run validate -- --version v1           # structure, grounding, coverage, the guarantee
npm run bench -- --version v1 --model oracle
npm run bench -- --version v1 --model null
npm run report -- --version v1             # regenerate the CSV, the leaderboard and this file
```

`oracle` and `null` are offline mock models: no key, no network, no cost. The
oracle returns the gold pack and must score 100 percent on every channel and
every family. The null model returns `not_in_evidence` for everything, which is
the abstain baseline: 100 percent on the abstain family and zero everywhere
else. Both run through the same code path as a real model, so they check the
harness rather than bypassing it.

To run a real model you need its key, which is read from the process
environment, from a gitignored `.env` in the repo root, or from the file named
by `RETRIEVAL_BENCH_ENV_FILE`, in that order. Keys are never printed, logged or
written to results.

```
npm run bench -- --version v1 --model deepseek-v4-flash
npm run bench -- --version v1 --model claude-sonnet-5 --runs 3
```

`--runs N` repeats a model N times; each repeat is its own run directory and the
leaderboard shows the mean and the min to max spread of the runs a model has on
the same corpus version and the same retrieval parameters. `--limit N` runs the
first N questions, `--force` overrides the cost cap, and `--allow-unpriced` runs
a model whose price could not be verified.

Rebuilding the index needs a `GEMINI_API_KEY`; running the benchmark does not,
because the chunk vectors and the per-question query vectors are committed with
the corpus.

```
npm run build-index -- --version v1
```

## Adding a model

One entry in `models.json` and no code:

```json
{
  "name": "some-model",
  "provider": "openai-compatible",
  "providerName": "someprovider",
  "modelId": "some-model-v1",
  "baseURL": "https://api.example.com/v1",
  "apiKeyEnv": "SOME_API_KEY",
  "providerOptions": { "someprovider": { "thinking": { "type": "disabled" } } },
  "pricing": { "input_per_mtok": 1.0, "output_per_mtok": 3.0, "cached_input_per_mtok": null },
  "pricing_verified": "2026-09-03"
}
```

`provider` is `anthropic`, `openai-compatible` or `mock`. Keys under
`providerOptions[providerName]` are spread into the JSON request body untouched,
which is how a provider-specific flag such as a thinking switch gets through;
`test/request-body.test.ts` captures the outgoing request and pins that.

Prices are copied from the provider's own published pricing on the date in
`pricing_verified`. A price that could not be read is `null`, and the runner
refuses to run an unpriced model unless it is given `--allow-unpriced`.

Every run uses temperature 0 and a 320 token output budget. A model entry may
override either only when the provider rejects the fixed value, and the override
is recorded in `run.json` and shown under the leaderboard.

## Results layout

```
results/v1/
  runs/<YYYYMMDD-HHMMSS-model>/
    items.jsonl     one line per question: the prompt, the raw reply, the parsed
                    pack, the gold pack, the four channel verdicts, tokens, cost
    run.json        the model, the parameters, the hashes, the totals
  results.csv       generated: one row per question per run
  LEADERBOARD.md    generated
```

`items.jsonl` is the source of truth. The CSV and the leaderboard are generated
from it and are never edited by hand, and the block between the markers above is
the same block, injected by `npm run report`.

## Versioning

Four fingerprints decide whether two rows are comparable, and all four are
recorded on every run:

- `pipeline_hash` over `bm25.ts`, `chunk.ts`, `retrieve.ts` and `rrf.ts`: what
  evidence the model was shown
- `prompt_hash` over the system prompt
- `params_hash` over the four retrieval parameters
- `scorer_hash` over `parse.ts`, `normalize.ts`, `score.ts` and the alias table,
  computed at report time because the report re-scores every run with it

The corpus is one version, iterated in place until the first public release. The
data and the results of earlier iterations are deleted rather than kept.

## What it does not measure

Retrieval, which is fixed and complete by construction. Embedding models.
Ingest strategies. Prose quality. Agentic behaviour. Long context. Real data.

## Licence

MIT.
