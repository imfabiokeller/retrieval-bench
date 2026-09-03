# Corpus v2

The same invented company as v1, a year later. Nothing in here describes a real
company, product, person or customer. It is written to look like the material a
retrieval system actually has to read, and then made harder than v1 on purpose:
the real model that has run v1 answered 99% of its items, so v2 was built until a
strong model has somewhere to fall.

Once a corpus version is published it does not change. Editing a document, an
item, the alias table, the retrieval parameters, the chunker or the embedding
model produces `v3`, not a new `v2`. Results from different versions are not
comparable and the harness records the version on every run so that stays
visible.

## What is different from v1

**An item is a case.** One question, one retrieval, one model call, and a schema
with three to six fields. Every field carries its own axis and its own gold
documents in the item's `fields` map, so one case is scored on four different
kinds of reading at once and most cases mix fields that are answerable with
fields that are not. A v1 item states no `fields` and every one of its fields
inherits the item-level axis and gold documents, which is what keeps v1 valid and
v1 runs re-scorable.

**Nine axes instead of five.** `entities`, `facts`, `supersession`, `conflict`
and `abstain` carry over. `asof`, `join`, `exhaustive` and `aggregation` are new.

**Twins.** Thirty-three single-field items repeat the hardest field of a case,
with the same gold documents and the same expected value, asked on their own.
They carry `twin_of` and the report prints the gap between the two.

**Retrieval parameters live here.** `params.json` holds them, and the runner
reads them from there: `top_n` 12 for v2 against 8 for v1, everything else the
same. A v2 case is broader than a v1 item and its fields sit in more documents.

## The company

**Wrenfield** is remote-first and builds **Palisade**, a data residency gateway,
and **Wrenfield Relay**, a regional proxy. The records run from January to the end
of June 2027, around the v5 release: ten metrics that keep moving, a residency
region list that gains two entries and loses one, ten outages, a SOC 2 renewal,
eight vendor contracts, a public launch and one product rename.

22 named people write these documents. Two of them are called Ravi and work on
different teams, which is why the alias table has no entry for the bare first
name. Customers and vendors: Northgate Bank, Northgate Health, Calder Health,
Voss Retail, Sundara Mobility, Meridian Freight, Kalona, Tessell, Brightline,
Norlan Cloud, Skald Analytics, Perrin Security, Ostara Support, Ferrin Telemetry.

## The doc mix

449 documents, 91,261 characters of body text, 203 characters per document on
average. The shortest is 41 characters and the longest is 927, so 38 documents
pack into two chunks and the rest into one: 487 chunks in all.

| type | count | what it is |
| --- | --- | --- |
| `slack` | 235 | one message per document across `#eng-core` (116), `#eng-relay` (29), `#compliance` (27), `#infra` (26), `#launch-v5` (22) and `#support-escalations` (15), 202 of them inside 68 threads |
| `meeting_note` | 70 | 42 weekly standups across two teams, 10 incident reviews, 10 decision notes, 8 contract reviews |
| `doc` | 57 | 35 monthly digests, 10 reference lists, 10 notes on how a metric is quoted, 2 others |
| `issue` | 36 | 22 issues in the WRN project, plus 14 whose titles differ from a real one by a word and that nothing points at |
| `issue_comment` | 34 | comments on those issues, each with a `parent_id` |
| `email` | 17 | vendor quotes and contract lines, plus one announcement |

Every document carries `id`, `type`, `author`, `created_at` (ISO 8601 with a
timezone offset), `text`, and where they apply `channel`, `project`, `thread_id`,
`parent_id` and `title`.

## What is planted, and why

The corpus is built so that reading the newest evidence, reading the loudest
evidence and reading the first thing retrieval returns all give different
answers.

- **As-of chains.** Ten metrics are set in January and changed three more times
  on dated messages, and a later message repeats the second value as if it still
  held. The question is pinned to a date in the middle of the chain, so the
  newest value is wrong by construction and so is the most repeated one.
- **Joins across doc types.** Slack names an issue by its title and never by its
  id; the id, the first assignee and the labels are on the issue record; a
  comment reassigns it and raises its priority. Answering takes two documents of
  different types chained by a title or an id.
- **Exhaustive sets.** A reference list of three entries, two additions in
  separate later messages, one of the original three retired, and afterwards
  somebody working from the old sheet who lists the retired one again. Scored as
  a set.
- **Aggregations.** Three quoted line items to add up, incident durations summed
  by severity, issues counted by a label that was added in a comment, a headcount
  that starts at one number and moves twice, regions counted across two outages.
- **Proposal against decision.** A number is floated in a thread and a different
  one is decided in the meeting note, which also states the status it moves to.
- **Retractions.** Something is announced and then taken back, or ruled out and
  then put back on, and the question is a boolean.
- **Corrections inside one message.** Every decision note corrects itself
  mid-sentence: the first number is not the decided one.
- **Corrections outnumbered and displaced.** A blast radius is corrected in an
  issue comment and then repeated wrongly in the channel afterwards.
- **Unit and currency traps.** Every vendor quote states a euro fee beside a
  dollar list price, and the question asks for euros.
- **Timezone traps.** The alert states the local clock with its zone word, the
  incident review states UTC, and the question asks for UTC.
- **A product renamed mid-corpus.** The documents before the rename use the old
  name and the documents after it use the new one. One question asks what it was
  called in January and another what it is called now, so the two names resolve
  to two different canonical values rather than to one.
- **The same first name on two teams.** One case asks for both, and neither can
  be answered from the first name.
- **Thread dependence.** The value is in the parent message and the message that
  agrees to it says only "yes, go with that".
- **Template noise.** 42 weekly standups carry the same six numbers in the same
  order with different values, and 35 monthly digests name every metric, list,
  vendor, outage, issue, decision and setting in the corpus while answering none
  of them. The digests are long enough to chunk in two, so one of them takes two
  of the twelve retrieval slots.
- **Near-duplicate distractors.** 14 issues whose titles differ from a real one
  by a word, opened by plausible people, gold for nothing.
- **Absences.** Revenue, tenant counts, investors, a Tokyo region, an Android
  SDK, on-call pay, detection times, discount rates and reporting lines are never
  written down anywhere. Four cases are unanswerable end to end and 57 more mix
  answerable and unanswerable fields.

The answers are in `items.jsonl`, not here.

## Items

123 items: 90 cases and 33 twins, 468 scored fields. Ids are `v2-case-001` and
`v2-twin-001`, stable for the life of the version.

| axis | fields | what it asks for |
| --- | --- | --- |
| `entities` | 59 | who or which named thing, including metadata: who wrote it, who was on call, who signed |
| `facts` | 42 | a value stated once and never revised |
| `supersession` | 51 | the value that holds now, after later changes |
| `conflict` | 53 | the corrected value, the decided value, the retraction |
| `abstain` | 69 | nothing in the corpus supports a value, so the answer is null |
| `asof` | 52 | the value in force on a stated past date, which is neither the first nor the newest |
| `join` | 49 | an answer that needs two documents chained by an id, a title or a thread |
| `exhaustive` | 50 | every member of a set, spread over several documents, scored as a set |
| `aggregation` | 43 | a count or a sum over several documents, deterministic arithmetic |

Cases carry 3 fields (18 of them), 4 (5), 5 (41) or 6 (26). Field types are
`string`, `number`, `date`, `time`, `boolean` and `string[]`, and every gold value
is deterministic under the published normalization rules. An abstain field has no
gold documents and expects null; a `join`, `exhaustive` or `aggregation` field has
at least two.

Only deterministically judgeable questions are in here. Anything that needed a
judgement call about phrasing, completeness or tone was not written.

## Aliases

`aliases.json` maps normalized surface forms to canonical ones: first names and
handles to full names, short vendor and product names to full ones, channel names
with and without the leading `#`, region names with and without the word
"region". Alias resolution is exact match on the whole normalized string, never
substring replacement, and aliases never chain.

Two deliberate absences. There is no alias for the bare first name **Ravi**,
because two people carry it on two teams and the first name does not identify
either of them. There is no alias for the bare word **relay**, because it is also
the name of an issue label, and a label is not a product.

## Index

`index/` holds the committed retrieval index: 487 chunks over the 449 documents,
their `gemini-embedding-001` vectors at 768 dimensions, the same embedding for
every one of the 123 item questions, and `meta.json`. Both vector files are
committed so that running the benchmark needs a key for the model under test and
nothing else.

`params.json` holds the retrieval parameters this corpus is read with: `top_n`
12, `rrf_k` 60, `recency_weight` 0.1, `max_chunks_per_doc` 2. They are part of the
corpus version, not of the harness.

With those parameters the retrieval hit rate is **88.2%** of the 399 fields that
have gold documents, which is a property of the pipeline and the corpus and not
of any model. It is deliberately not near 100%: template noise and near-duplicate
distractors were added until it landed between 85% and 90%, so that a leaderboard
can separate a model that reads badly from a model that was handed the wrong
evidence.
