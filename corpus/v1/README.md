# Corpus v1

A frozen snapshot of the internal records of a fictional company. Nothing in
here describes a real company, product, person or customer. It is invented to
look like the kind of material a retrieval system actually has to read: short,
dated, partly contradictory, written by several people who do not always keep up
with each other.

Once a corpus version is published it does not change. Editing a document, an
item, the alias table, the chunker or the embedding model produces `v2`, not a
new `v1`. Results from different versions are not comparable and the harness
records the version on every run so that stays visible.

## The company

**Wrenfield** is a remote-first company of 48 people across 11 countries. It
builds **Palisade**, a data residency gateway, and **Palisade Edge**, a
lightweight regional proxy. The records cover January to early April 2026, the
run-up to the Palisade v4 general availability release: scope, an SLO
tightening, a pricing change, a residency region decision, one production
incident, a SOC 2 engagement, a CDN renewal and a launch.

Named people: Elena Marchetti (CEO), Ingrid Halvorsen, Priya Raman, Tomas Ruiz,
Jonas Weber, Aisha Nkemelu, Dan Okonkwo, Mei-Ling Chen, Sofia Brandt, Rob
Feeney, Hana Sato, Viktor Novak, plus two external contacts. Customers and
vendors: Northgate Bank, Northgate Health, Calder Health, Voss Retail, Sundara
Mobility, Meridian Freight, Tessell, Kalona, Brightline.

## The doc mix

120 documents, 15,671 characters of body text, 131 characters per document on
average. Every document is short, the longest is 499 characters.

| type | count | what it is |
| --- | --- | --- |
| `slack` | 80 | one message per document, across `#eng-palisade` (47), `#launch-v4` (18) and `#support-escalations` (15), many of them in threads |
| `issue` | 12 | Linear-style issues `PAL-101` to `PAL-112`, with status, assignee, priority and labels in the body |
| `issue_comment` | 14 | comments on those issues, each with a `parent_id` |
| `email` | 6 | two vendor threads, one customer email, one company-wide announcement |
| `meeting_note` | 5 | Q1 planning, an incident review, a pricing review, an architecture review, a launch readiness review |
| `doc` | 3 | an on-call runbook, engineering onboarding, a launch readiness checklist |

Every document carries `id`, `type`, `author`, `created_at` (ISO 8601 with a
timezone offset), `text`, and where they apply `channel`, `project`,
`thread_id`, `parent_id` and `title`.

## What is planted, and why

The corpus is built so that reading the newest evidence and reading the loudest
evidence give different answers.

- **Supersession chains.** Around twenty values are stated once and then changed
  later in a dated message: the GA date moves twice, the p99 SLO is tightened,
  the default log retention window goes 30, then 14, then 21 days, the Enterprise
  price changes, an issue changes owner, the second residency region changes
  city, the support SLA is halved. The naive answer to "what is X" is the first
  or the most repeated statement, which is the wrong one.
- **Corrections.** Several statements are simply wrong and are corrected shortly
  after by someone else, or by the same author: a transposed CVE identifier, a
  transposed latency figure, a customer named wrongly, an incident duration
  reported before it was measured, a row count off by a factor of ten, a vendor
  credited with the wrong engagement.
- **Stale repeats.** After a value changes, someone who missed the change repeats
  the old one, often confidently, and is corrected in the same thread. This is
  the trap that catches "most frequent value wins" and "most recent retrieved
  chunk wins" equally.
- **Distractors.** Similar entities and similar numbers sit next to each other on
  purpose: Northgate Bank against Northgate Health, Palisade against Palisade
  Edge, the p99 target against the p95 target, the default retention window
  against the Enterprise one, the Enterprise price against the Team price, the
  maximum upload size against the chunked-upload threshold.
- **Absences.** A long list of plausible questions has no answer anywhere:
  revenue, team sizes, an Android SDK, salaries, an audit fee, a Tokyo region,
  test coverage, contract values, investors. Several of them have near misses in
  the corpus, which is what makes them worth asking.

The answers themselves are in `items.jsonl`, not here.

## Items

`items.jsonl` holds 204 gold items, 40 to 42 per axis: `entities` (40), `facts`
(41), `supersession` (42), `conflict` (41), `abstain` (40). Every item has a
stable id (`v1-sup-001`), a question, a small typed schema, an expected object,
the ids of the documents that support it, and a note saying why it has exactly
one right answer. An abstain item has no gold documents and expects null.

Only deterministically judgeable questions are in here. Anything that needed a
judgement call about phrasing, completeness or tone was not written.

## Aliases

`aliases.json` maps normalized surface forms to canonical ones: first names and
handles to full names, short product names to full ones, channel names with and
without the leading `#`. Alias resolution is exact match on the whole normalized
string, never substring replacement, and aliases never chain.

## Index

`index/` holds the committed retrieval index: one chunk per document (no
document reaches the 500 character chunk target in this version), their
`gemini-embedding-001` vectors at 768 dimensions, the same embedding for every
item question, and `meta.json`. Both vector files are committed so that running
the benchmark needs a key for the model under test and nothing else.
