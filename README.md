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

Read the **Reading** table first. It conditions on *full* retrieval: every gold
document of the field was in the retrieved set, so the model had the evidence and
the number is about what it did with it. The **Everything** table is every scored
field, retrieval misses included, which is what the pipeline as a whole delivers.
Rows are grouped by retrieval parameters, and the `top_n` 12 group is the one run
made before v2 was retuned, kept for the record and not comparable with the rest.

<!-- LEADERBOARD:v2:START -->

Corpus version **v2**, pipeline hash `f7bbdd5fe0812c4d`, prompt hash `1c5c35327076c6b6`. Rows are only comparable when those match AND the retrieval parameters match, which is why every row names its parameter hash and the tables are grouped by it.

The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.

Two accuracies per model, because a raw score mixes two different failures. A field whose answer needs two documents and got one of them was handed half the evidence, and the any-document hit flag still calls that a hit. `given full retrieval` conditions on all of a field's gold documents being there, so it is the reading number; `overall` is every field and is the pipeline number.

Scored with scorer hash `63032ea7a9d6d0ed`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

### Retrieval parameters `e8438123`: top_n 32, rrf_k 60, recency_weight 0.1, max_chunks_per_doc 2

**Reading.** Accuracy over the fields whose every gold document was in the retrieved set, so the model had the evidence and the number is about what it did with it. Abstain fields have no gold documents, are never full, and have no column here.

| model | fields with full retrieval | given full retrieval | entities | facts | supersession | conflict | asof | join | exhaustive | aggregation |
|---|---|---|---|---|---|---|---|---|---|---|
| oracle | 339 | 100.0% | 100.0% (n=52) | 100.0% (n=41) | 100.0% (n=47) | 100.0% (n=52) | 100.0% (n=52) | 100.0% (n=23) | 100.0% (n=30) | 100.0% (n=42) |
| deepseek-v4-flash | 339 | 80.8% | 82.7% (n=52) | 92.7% (n=41) | 97.9% (n=47) | 96.2% (n=52) | 42.3% (n=52) | 95.7% (n=23) | 66.7% (n=30) | 78.6% (n=42) |
| null | 339 | 0.0% | 0.0% (n=52) | 0.0% (n=41) | 0.0% (n=47) | 0.0% (n=52) | 0.0% (n=52) | 0.0% (n=23) | 0.0% (n=30) | 0.0% (n=42) |

**Everything.** Accuracy over every scored field, retrieval misses included, which is what the pipeline as a whole delivers.

| model | params | fields | overall | entities | facts | supersession | conflict | abstain | asof | join | exhaustive | aggregation | cases | case fully correct | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | `e8438123` | 468 | 100.0% | 100.0% (n=59) | 100.0% (n=42) | 100.0% (n=51) | 100.0% (n=53) | 100.0% (n=69) | 100.0% (n=52) | 100.0% (n=49) | 100.0% (n=50) | 100.0% (n=43) | 123 | 100.0% | 100.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |
| deepseek-v4-flash | `e8438123` | 468 | 78.0% | 72.9% (n=59) | 90.5% (n=42) | 90.2% (n=51) | 94.3% (n=53) | 98.6% (n=69) | 42.3% (n=52) | 77.6% (n=49) | 54.0% (n=50) | 76.7% (n=43) | 123 | 40.7% | 76.9% | 0 | 1152 | 1534 | 942 | 367708 | 4061 | 0 | $0.1449 |
| null | `e8438123` | 468 | 14.7% | 0.0% (n=59) | 0.0% (n=42) | 0.0% (n=51) | 0.0% (n=53) | 100.0% (n=69) | 0.0% (n=52) | 0.0% (n=49) | 0.0% (n=50) | 0.0% (n=43) | 123 | 3.3% | 0.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |

Full-retrieval rate for these parameters: **85.0%** of the 399 fields that have gold documents. A field is full when every one of its own gold documents has a chunk in the retrieved set. It is a property of the corpus and of these parameters, not of any model, so it is the same for every row above. Abstain fields have no gold documents and are excluded from that denominator.

Per axis: entities 88.1% (n=59), facts 97.6% (n=42), supersession 92.2% (n=51), conflict 98.1% (n=53), asof 100.0% (n=52), join 46.9% (n=49), exhaustive 60.0% (n=50), aggregation 97.7% (n=43).

Retrieval hit rate for these parameters: **96.7%** of the 399 fields that have gold documents. A field is a hit when at least ONE retrieved chunk comes from one of its gold documents, which on a field that needs two documents is half the evidence. It is the looser of the two flags and is kept for continuity.

Per axis: entities 88.1% (n=59), facts 97.6% (n=42), supersession 92.2% (n=51), conflict 98.1% (n=53), asof 100.0% (n=52), join 100.0% (n=49), exhaustive 100.0% (n=50), aggregation 100.0% (n=43).

### Retrieval parameters `c288fd0c`: top_n 12, rrf_k 60, recency_weight 0.1, max_chunks_per_doc 2

**Reading.** Accuracy over the fields whose every gold document was in the retrieved set, so the model had the evidence and the number is about what it did with it. Abstain fields have no gold documents, are never full, and have no column here.

| model | fields with full retrieval | given full retrieval | entities | facts | supersession | conflict | asof | join | exhaustive | aggregation |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4-flash | 281 | 78.6% | 84.3% (n=51) | 93.9% (n=33) | 100.0% (n=34) | 95.5% (n=44) | 37.3% (n=51) | 100.0% (n=15) | 59.1% (n=22) | 77.4% (n=31) |

**Everything.** Accuracy over every scored field, retrieval misses included, which is what the pipeline as a whole delivers.

| model | params | fields | overall | entities | facts | supersession | conflict | abstain | asof | join | exhaustive | aggregation | cases | case fully correct | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4-flash | `c288fd0c` | 468 | 67.5% | 72.9% (n=59) | 73.8% (n=42) | 66.7% (n=51) | 79.2% (n=53) | 97.1% (n=69) | 36.5% (n=52) | 69.4% (n=49) | 44.0% (n=50) | 55.8% (n=43) | 123 | 30.1% | 70.5% | 1 | 950 | 1364 | 722 | 172102 | 4030 | 0 | $0.0670 |

Full-retrieval rate for these parameters: **70.4%** of the 399 fields that have gold documents. A field is full when every one of its own gold documents has a chunk in the retrieved set. It is a property of the corpus and of these parameters, not of any model, so it is the same for every row above. Abstain fields have no gold documents and are excluded from that denominator.

Per axis: entities 86.4% (n=59), facts 78.6% (n=42), supersession 66.7% (n=51), conflict 83.0% (n=53), asof 98.1% (n=52), join 30.6% (n=49), exhaustive 44.0% (n=50), aggregation 72.1% (n=43).

Retrieval hit rate for these parameters: **88.5%** of the 399 fields that have gold documents. A field is a hit when at least ONE retrieved chunk comes from one of its gold documents, which on a field that needs two documents is half the evidence. It is the looser of the two flags and is kept for continuity.

Per axis: entities 86.4% (n=59), facts 78.6% (n=42), supersession 66.7% (n=51), conflict 83.0% (n=53), asof 98.1% (n=52), join 100.0% (n=49), exhaustive 96.0% (n=50), aggregation 100.0% (n=43).

Runs whose score moved when they were re-scored:

- `deepseek-v4-flash` (params `c288fd0c`): 25.2% of cases at run time, 30.1% now.

Twin gap. A twin asks one hard field of a case on its own, with the same gold documents and the same expected value, so the difference is what the rest of the case costs:

- `oracle` (params `e8438123`): 100.0% on the 33 twin fields, 100.0% on the same fields inside their cases, +0.0 points.
- `deepseek-v4-flash` (params `e8438123`): 57.6% on the 33 twin fields, 60.6% on the same fields inside their cases, -3.0 points.
- `deepseek-v4-flash` (params `c288fd0c`): 54.5% on the 33 twin fields, 51.5% on the same fields inside their cases, +3.0 points.
- `null` (params `e8438123`): 0.0% on the 33 twin fields, 0.0% on the same fields inside their cases, +0.0 points.

Every run uses temperature 0 and a 512 token output budget unless the model rejects one of those, in which case models.json records the override:

- `oracle` (params `e8438123`): temperature 0, max output tokens 512, 0 call errors.
- `deepseek-v4-flash` (params `e8438123`): temperature 0, max output tokens 512, 0 call errors.
- `deepseek-v4-flash` (params `c288fd0c`): temperature 0, max output tokens 512, 0 call errors.
- `null` (params `e8438123`): temperature 0, max output tokens 512, 0 call errors.

<!-- LEADERBOARD:v2:END -->

### Corpus v1

The first one, and too easy: the one real model that has run it answered 99% of
its items. It is kept because it is published and reproducible, and because it is
the reference point that made v2 worth building. A v1 item states one axis for
the whole item, so each of its fields inherits that axis and the table below
reads the way it always did.

<!-- LEADERBOARD:v1:START -->

Corpus version **v1**, pipeline hash `f7bbdd5fe0812c4d`, prompt hash `1c5c35327076c6b6`. Rows are only comparable when those match AND the retrieval parameters match, which is why every row names its parameter hash and the tables are grouped by it.

The unit is the field. An item is a case: one question, one retrieval, one call, and a schema whose fields each carry their own axis and their own gold documents, so a per-axis number is an accuracy over the fields tagged with that axis and carries its own n. `case fully correct` is the strictness column: the share of cases where every field was right.

Two accuracies per model, because a raw score mixes two different failures. A field whose answer needs two documents and got one of them was handed half the evidence, and the any-document hit flag still calls that a hit. `given full retrieval` conditions on all of a field's gold documents being there, so it is the reading number; `overall` is every field and is the pipeline number.

Scored with scorer hash `e1710b94bb0ea85c`. Every row is re-scored at report time from the raw replies stored in `items.jsonl`, so a fix to the parser, the normalizer, the scorer or the alias table reaches every run without a paid re-run.

**Reading.** Accuracy over the fields whose every gold document was in the retrieved set, so the model had the evidence and the number is about what it did with it. Abstain fields have no gold documents, are never full, and have no column here.

| model | fields with full retrieval | given full retrieval | entities | facts | supersession | conflict |
|---|---|---|---|---|---|---|
| oracle | 162 | 100.0% | 100.0% (n=39) | 100.0% (n=42) | 100.0% (n=41) | 100.0% (n=40) |
| deepseek-v4-flash | 162 | 99.4% | 97.4% (n=39) | 100.0% (n=42) | 100.0% (n=41) | 100.0% (n=40) |
| null | 162 | 0.0% | 0.0% (n=39) | 0.0% (n=42) | 0.0% (n=41) | 0.0% (n=40) |

**Everything.** Accuracy over every scored field, retrieval misses included, which is what the pipeline as a whole delivers.

| model | params | fields | overall | entities | facts | supersession | conflict | abstain | cases | case fully correct | acc given retrieval hit | retries | mean latency ms | p95 latency ms | mean ttft ms | tokens in | tokens out | tokens reasoning | run cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oracle | `a606bd24` | 218 | 100.0% | 100.0% (n=40) | 100.0% (n=42) | 100.0% (n=51) | 100.0% (n=45) | 100.0% (n=40) | 204 | 100.0% | 100.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |
| deepseek-v4-flash | `a606bd24` | 218 | 99.1% | 97.5% (n=40) | 100.0% (n=42) | 98.0% (n=51) | 100.0% (n=45) | 100.0% (n=40) | 204 | 99.0% | 99.4% | 0 | 859 | 1276 | 723 | 178996 | 1647 | 0 | $0.0567 |
| null | `a606bd24` | 218 | 18.3% | 0.0% (n=40) | 0.0% (n=42) | 0.0% (n=51) | 0.0% (n=45) | 100.0% (n=40) | 204 | 19.6% | 0.0% | 0 | 8 | 9 | 5 | 0 | 0 | 0 | $0.0000 |

Full-retrieval rate for these parameters: **91.0%** of the 178 fields that have gold documents. A field is full when every one of its own gold documents has a chunk in the retrieved set. It is a property of the corpus and of these parameters, not of any model, so it is the same for every row above. Abstain fields have no gold documents and are excluded from that denominator.

Per axis: entities 97.5% (n=40), facts 100.0% (n=42), supersession 80.4% (n=51), conflict 88.9% (n=45).

Retrieval hit rate for these parameters: **98.3%** of the 178 fields that have gold documents. A field is a hit when at least ONE retrieved chunk comes from one of its gold documents, which on a field that needs two documents is half the evidence. It is the looser of the two flags and is kept for continuity.

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
npm test                                             # 122 tests, no key needed
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
> other issues carry a title that differs from a real one by a word. The title of
> a real issue aliases to its id, so answering with the title the evidence
> actually wrote is correct; the title of a decoy does not alias to anything.

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

**Retrieval is flagged per field, twice.** `retrieval_hit` is true when at least
one retrieved chunk comes from one of *that field's* gold documents.
`retrieval_full` is true when *every* one of them was retrieved. Abstain fields
have no gold documents, so they have neither flag and are excluded from both
denominators.

The difference is the whole reason the leaderboard has two tables. On a field
whose answer lives in one document the two flags agree. On a `join`,
`exhaustive` or `aggregation` field they do not, and the any-document flag
flatters the pipeline: at v2's original `top_n` 12 the hit rate on the join axis
was **100%** while only **15 of 49** join fields had both of their gold
documents. A model shown one half of a two-document answer cannot get it right,
so counting that as a reading failure is counting a retrieval failure twice.
**Accuracy given full retrieval is the reading number.** Both flags are on every
field row in `items.jsonl` and in `results.csv`, both rates are reported per
corpus version and per axis, and both conditioned accuracies are in the
leaderboard.

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

Two families of v2 alias are worth naming. Every one of the 22 real issues aliases
its **title** to its **id**, because a question that asks which issue tracks
something expects `WRN-204` and Slack only ever names the issue by its title; the
14 near-duplicate decoy issues are deliberately left out, so answering with a
decoy title stays wrong. And where the corpus writes a gold value with a
qualifier that adds nothing the schema field does not already say, the written
form is an alias (`linux-8x runner` for a `build_runner`, `request logs only`).
Where the qualifier names a *different* thing, the gold value is tightened to the
phrase the corpus writes instead, because an alias is corpus-wide and would then
make that phrase correct for a field it does not answer: the measurement point in
`v2-case-001` is `Amsterdam edge`, not `Amsterdam`, which in this corpus is a
residency region.

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
axes, 90 cases and 33 twins, read with `top_n` 32. It keeps everything v1 planted and adds as-of chains
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
| `top_n` | 8 chunks | 32 chunks |
| `rrf_k` | 60 | 60 |
| `recency_weight` | 0.1 | 0.1 |
| `max_chunks_per_doc` | 2 | 2 |
| chunk target | 500 characters | 500 characters |
| embedding | `gemini-embedding-001`, 768 dims | same |
| temperature | 0 | 0 |
| `max_tokens` | 512 | 512 |

v2 reads 32 chunks rather than 8 because a case is broader than a v1 item, its
fields sit in up to six different documents, and several of its axes are only
answerable when *every* gold document of a field is retrieved. `top_n` was set
against the full-retrieval rate, not the hit rate: 12 chunks left it at 70.4%, 32
puts it at 85.0%. `corpus/v2/README.md` has the sweep, the per-axis table and the
cost at each step. v2 had not been published as a leaderboard when that changed,
so it is a retune rather than a `v3`; the one run made at `top_n` 12 is kept and
labelled with its own parameter hash.

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

**Retrieval rates.** A property of the corpus and of the parameters above, not of
the model, so they are identical across runs made with the same parameters and
reported once per parameter group. Measured per field:

| version | fields with gold documents | full-retrieval rate | hit rate |
| --- | --- | --- | --- |
| v1 | 178 | 91.0% | 98.3% |
| v2 | 399 | 85.0% | 96.7% |
| v2 at the original `top_n` 12 | 399 | 70.4% | 88.5% |

Neither rate is near 100% and neither is meant to be: template noise and
near-duplicate distractors are there so that a leaderboard can separate a model
that read the evidence badly from a model that was handed the wrong evidence.
`test/corpus-v2.test.ts` fails if the v2 full-retrieval rate drifts out of an 83%
to 87% band, or if any axis falls under its own floor.

Two axes sit below the rest and no affordable `top_n` fixes them. A `join` names
its issue by title in a Slack message and the id is on an issue record the
question never mentions, so retrieving it is a second hop a single-shot retrieval
cannot make: `join` is at 46.9% full retrieval at `top_n` 32 and needs `top_n` 96,
which is over the $5 spend cap, to clear 70%. `exhaustive` is at 60.0% for the
same reason. That is exactly why the reading number conditions on full retrieval
rather than on a hit.

## Cost cap and the arithmetic

Before a run the harness estimates input tokens as characters over four across
the exact prompts it is about to send, adds the full output budget per item, and
prices both from `models.json`. If the projection is over **$5.00** the run
refuses to start unless you pass `--force`. Actual cost is computed from the
token counts the provider reports, not from the estimate, and both go into
`run.json`.

The projection for corpus v2, all 123 items:

- 350,011 estimated input tokens in total, which is **2,846 tokens per item**
  including the system prompt. 292 of those are the system prompt, and the rest
  is the item schema plus the 32 retrieved chunks with their metadata.
- 62,976 output tokens, which is 123 items at the 512 token ceiling. That is the
  worst case by construction: a model that answers with the object and stops uses
  a small fraction of it, and the gap between the projection and the actual cost
  in `run.json` is that fraction.
- The most expensive model in `models.json` is `claude-opus-5` at $5.00 per
  million input tokens and $25.00 per million output tokens. That projects to
  350,011 × $5 / 1e6 = **$1.75** of input plus 62,976 × $25 / 1e6 = **$1.57** of
  output, so **$3.32** for a full v2 run, under the cap.
  `deepseek-v4-flash`, the cheapest priced model here, projects to **$0.24** and
  its actual v2 run cost **$0.14**.

Every priced model projects under the cap on both corpora. The cap is also what
bounds `top_n`: at 64 chunks a v2 run projects to $4.71 at `claude-opus-5` and at
96 it projects to $6.14, which is over. For the record, v1 projects to **$3.45**
at `claude-opus-5`: it has more items, but it reads 8 chunks instead of 32 and a
v2 case answers five questions in the call where a v1 item answers one.

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
corpus version, a fresh index and a fresh leaderboard. The retrieval parameters
are the one part of that tuple that is not a hash of source code, so the report
fingerprints them separately: every leaderboard row and every CSV row names a
`params_hash`, and the tables are grouped by it so two runs made with a different
`top_n` cannot be read as a model comparison. A corpus is frozen the
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
   the normalized expected and got values, whether it is correct, and its own two
   retrieval flags: `retrieval_hit` for any of its gold documents and
   `retrieval_full` for all of them), whether the case is fully correct, latency, time to first
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
   `case_correct` where `field_ordinal = 0`, the reading accuracy is
   `field_correct` where `field_retrieval_full` is true, the looser conditioned
   accuracy is the same over `field_retrieval_hit`, and the twin gap compares
   rows whose `twin_of` is set against the same field of the item it names. Group
   by `params_hash` before comparing runs: two runs made with a different `top_n`
   read different evidence. No prompts, no raw outputs.
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
- **Long context.** v2 is about 23,000 tokens of corpus and the model is shown 32
  of its 487 chunks, roughly 2,500 tokens. This measures reading a handful of
  retrieved snippets correctly, not reading a book.
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
