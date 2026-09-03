# Design

This file is the specification. The README explains the benchmark to a reader;
this file records the decisions and the reasons, so nobody re-litigates them by
accident.

## The question

Given a fixed retrieval pipeline over a frozen corpus, where every document a
question needs is guaranteed to be in the retrieved window, how reliably does a
model read that window: does it give the right value, say when there is none,
reconstruct how a value changed over time, and cite the documents that support
it?

The model is the only variable. Retrieval is fixed and, by construction,
complete. There is no LLM judge anywhere.

## The unit: one question, one pack

A question is a plain sentence a person would ask, with a declared answer type
(`string`, `number`, `date`, `time`, `boolean`, `string[]`). One question, one
retrieval, one call. Every reply has the same shape:

```json
{
  "status": "answered",
  "value": 165,
  "history": [
    {"value": 190, "from": "2027-01-12"},
    {"value": 165, "from": "2027-03-24"},
    {"value": 150, "from": "2027-05-02"}
  ],
  "sources": ["slack-eng-core-003", "slack-eng-core-041", "mtg-007"]
}
```

- `status` is `answered` or `not_in_evidence`.
- `value` is typed by the question. `null` when the status is `not_in_evidence`.
- `history` is every distinct value the asked-about thing has held, with the
  date each took effect, oldest first. Empty when the thing never changed or the
  question is not about a value.
- `sources` are document ids copied from the evidence headers.

There are no per-question schemas, no compound questions, no field names to leak
hints. The pack is the schema.

## Channels

Each channel is scored deterministically. A question is scored on the channels
its gold declares; `value`, `status` and `sources` are always scored, `history`
only when the gold carries a chain.

| channel | correct when |
| --- | --- |
| `value` | normalized value equals normalized gold (existing rules: numbers, dates, times, booleans, sets, aliases) |
| `status` | equals gold status |
| `history` | the set of normalized `(value, from)` pairs equals the gold chain exactly; a stale repeat entered as a new step, a missing step or an extra step all fail |
| `sources` | every cited id is a gold document and at least one gold document is cited; recall is reported as a number beside it |

A gold source is every document that asserts, in its own voice, the gold value,
a counted or listed member of it, or a step of its scored chain, as true; a
proposal, a question, a retraction, a document that asserts a superseded value
as if it were current, and a line quoted inside a reply are never gold sources.

A pack is fully correct when every scored channel is correct. For an
abstention the gold is `status: not_in_evidence`, `value: null`, `history: []`,
`sources: []`, and citing anything fails the sources channel.

## Families

The question type. One column each. Roughly equal counts, thirty or more per
family, cost permitting.

| family | asks for |
| --- | --- |
| `lookup` | a value or a named thing stated and never revised |
| `current` | the value that holds now after one or more changes |
| `asof` | the value in force on a stated past date, neither the first nor the newest |
| `join` | an answer that needs two documents linked by an id, a title or a thread |
| `multihop` | three or more documents in a chain |
| `exhaustive` | every member of a set, spread over several documents, with additions and removals |
| `aggregation` | a count or a sum over several documents, with duplicates to collapse |
| `temporal` | arithmetic on dates: days between, how many times changed, when last changed, which came first |
| `rule` | a policy stated in one place applied to facts stated elsewhere, answered as a boolean or a value |
| `abstain` | nothing in the corpus supports a value; most of these have a sibling value present (the other region, the other tier, p50 when p99 is stated, a quote but no signature) |

## Traps

An annotation any question can carry, scored as resistance per kind: the share
of questions carrying that trap whose value channel was correct. Fifteen or more
questions per kind.

| trap | what is planted |
| --- | --- |
| `superseded` | an older value repeated after the change, often more than once |
| `statement_shaped_question` | the newest message asks "are we at 190 now?" and is not a statement |
| `quoted_email` | the newest email quotes the old value below the new one |
| `proposal` | a number floated in a thread next to the decided one |
| `retraction` | announced, then taken back, or ruled out, then put back |
| `scope` | the same metric differs by environment, tier or region; the question pins one |
| `relative_date` | "next Tuesday", "end of the quarter", "in two weeks", resolved from the message timestamp |
| `unit` | EUR beside USD, 1.5k beside 1500, ms beside s; the question fixes the unit |
| `timezone` | a local clock with a zone word beside UTC, including a DST change |
| `keyword` | a lexically similar document about something else |
| `same_name` | two people with the same first name, a product renamed mid-corpus |
| `planned_vs_done` | "we migrate on the 2nd" then "migration finished on the 5th" |
| `negation` | regions not affected, customers except one |
| `chunk_split` | a longer document where the subject sits in one chunk and the value in the next |
| `format` | the value inside a table, a numbered list, pasted JSON, a message with typos, or a message in German |

## The guarantee

For every question, every gold document has at least one chunk in the window
the frozen pipeline retrieves. The validator runs retrieval for all questions
and fails on any miss. The corpus is written until that check passes at 100
percent. Retrieval hit rates therefore do not appear on the leaderboard; they
are a gate, not a metric.

The traps still live inside the window. Distractors, stale repeats and
near-duplicates are retrieved alongside the gold documents; the guarantee is
that the truth is present, not that it is alone.

## Corpus realism

Records are written the way records are written, because artificial gaps make
artificial retrieval failures:

- Issues have descriptions that say what the issue is about and name the
  incident, customer or metric they concern.
- Comments say what they change ("reassigning to Priya, raising to urgent").
- Emails name the contract or quote they concern.
- Slack threads have parents that carry the value and replies that agree.
- Questions are phrased the way a person asks, naming what they know (the issue
  title, the customer, the metric), not avoiding it.

Invented company, invented people, nothing real. Small parts of many document
types: Slack across channels with threads, issues with comments, emails with
quoted chains, meeting notes, decision notes, reference lists, a policy doc, a
few longer documents that chunk in two, template noise (weekly standups and
monthly digests with the same shape and different numbers), near-duplicate
distractors.

## Pipeline

Unchanged from what exists: contextual chunks, BM25 plus committed
`gemini-embedding-001` vectors, reciprocal rank fusion at k=60, soft recency
boost, per-document cap, `top_n` from the corpus `params.json`. No LLM at
ingest, no rerank, no neighbour or reference expansion. The window has to be
large enough for the guarantee and small enough for the cost cap; the corpus
is tuned to both.

## Prompt

Neutral. It explains the evidence format and the pack shape and nothing about
how to weigh evidence. No "prefer the newest", no "null is usually right". The
prompt is hashed and recorded on every run.

## Leaderboard

Headline pair: the macro average of value accuracy over families (each family
weighs the same, so saturated families cannot carry the score) and the share of
packs fully correct. Beside them: one column per family, one per channel, one
per trap kind, retries, latency, time to first token, tokens, cost.

When a model has more than one run on the same corpus and parameters, the row
shows the mean and the min to max spread.

## Versions

One corpus. It is iterated in place until the first public release, and the
data and results of earlier iterations are deleted, not kept. The version
machinery (corpus version, pipeline hash, prompt hash, scorer hash, params
hash) stays in the code because the first published release needs it.

## Cost

A full run of the corpus must project under five dollars for the most expensive
model in `models.json`. The estimator refuses otherwise. Corpus size, `top_n`
and question count are tuned to that line.

## Mocks

`oracle` returns the gold pack and must score 100 percent on every channel and
family. `null` returns `not_in_evidence` for everything and must score 100
percent on the abstain family and zero elsewhere. Both run offline.

## What it does not measure

Retrieval (fixed and complete by construction), embedding models, ingest
strategies, prose quality, agentic behaviour, long context, real data.
