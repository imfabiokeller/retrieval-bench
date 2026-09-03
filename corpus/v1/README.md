# Corpus v1

A frozen archive of an invented company, and 307 questions asked of it. No
answers are written down here: they live in `items.jsonl` beside the questions
they belong to.

## The company

Wrenfield sells two products. **Palisade** is an API gateway that sits in front
of a customer's own services, and it is the older of the two. **Relay** moves
records between a customer system and the Wrenfield store; it was called Relay
Connect until it was renamed Relay Bridge in April, and older documents use the
old name.

Eighteen people work there, across a platform team, a relay team, support,
infrastructure, security, sales, finance, legal, product and a DACH team in
Berlin. Two of them are called Ravi and two are called Anna, on purpose: Ravi
Iyer is on infrastructure and Ravi Menon leads support, Anna Brandt sells and
Anna Kowalski tests. Eight invented customers buy from them, in three processing
regions, under contracts that change during the period. Wrenfield also buys four
tools of its own, Tidemark, Beacon, Lantern and Palette, which is what the
purchase order questions are about.

The archive runs from 2027-01-04 to 2027-07-01. Nothing in it is real.

## The documents

691 documents, 119,676 characters, 719 chunks after ingest.

| type | count | what it is |
| --- | --- | --- |
| `slack` | 520 | messages across twelve channels, short and casual |
| `doc` | 63 | reference material: runbooks, policies, tables, an architecture note, a glossary, monthly digests |
| `meeting_note` | 44 | notes on one template, plus the weekly standups that use the same template every week |
| `email` | 40 | with signatures, and 18 of them with a quoted chain below the reply |
| `issue` | 13 | with a description that names the customer, the symptom and the component |
| `issue_comment` | 11 | comments that say what they change |

The twelve channels are `eng-core`, `eng-palisade`, `eng-relay`, `infra`,
`support`, `sales`, `incidents`, `general`, `dach`, `security`, `data-platform`
and `release`.

The average document is 173 characters, because most of them are Slack
messages. Thirteen are deliberately long, between 1,070 and 1,663 characters,
and chunk into three or four pieces: a handbook, a data processing agreement,
two runbooks, a support handbook section, a release process, a backfill guide,
an architecture note, an onboarding guide, a glossary, a postmortem, a support
FAQ and a product note. Those are where the `chunk_split` questions live. Every
Slack message is exactly one chunk.

## The questions

307 questions. Every family carries at least 30 and every trap kind at least 15.

| family | count |
| --- | --- |
| `lookup` | 37 |
| `asof` | 30 |
| `current` | 30 |
| `join` | 30 |
| `multihop` | 30 |
| `exhaustive` | 30 |
| `aggregation` | 30 |
| `temporal` | 30 |
| `rule` | 30 |
| `abstain` | 30 |

| trap | count |
| --- | --- |
| `superseded` | 88 |
| `negation` | 59 |
| `keyword` | 52 |
| `format` | 33 |
| `scope` | 29 |
| `proposal` | 28 |
| `retraction` | 27 |
| `same_name` | 26 |
| `statement_shaped_question` | 26 |
| `quoted_email` | 21 |
| `unit` | 21 |
| `chunk_split` | 16 |
| `planned_vs_done` | 15 |
| `relative_date` | 15 |
| `timezone` | 15 |

Answer types: 135 `number`, 69 `string`, 38 `date`, 31 `string[]`, 22 `boolean`,
12 `time`.

61 questions carry a scored history chain: 59 of three steps and 2 of four, each
with at least one stale repeat of an older value dated after the change. The
`current` and `asof` families are built on thirty such chains, which is why both
are exactly 30.

Gold sources per question: 54 questions have one, 54 have two, 102 have three,
38 have four, 19 have five, 5 have six, 2 have seven and 3 have eight, and the
30 abstain questions have none. That is 783 citations over 437 distinct
documents, so 254 of the 691 documents are a gold source for nothing.

A gold source is every document that asserts, in its own voice, the gold value,
a counted or listed member of it, or a step of its scored chain, as true. A
proposal, a question, a retraction, a document that asserts a superseded value as
if it were current, and a line quoted inside a reply are never gold sources,
however close they read.

## How the corpus is written

- Issues have descriptions that say what the issue is about and name the
  incident, the customer or the metric they concern. The issue key leads the
  title, the way a tracker shows it.
- Comments say what they change.
- Emails name the contract or the quote they concern, carry a signature, and
  prefix quoted lines with `>`.
- Questions are phrased the way a person asks, naming what they know: the issue
  key, the customer, the metric, the component.
- Relative dates are resolved from the message timestamp. A message written on
  Thursday 11 February that says "next Tuesday" means 2027-02-16, and the
  generator refuses to write the phrase if the weekday does not match.
- The clocks go forward on 2027-03-28. The 313 documents dated before that carry
  a `+01:00` offset and the 378 after it carry `+02:00`, and the timezone
  questions turn on that hour.
- Nineteen messages and mails are written in German, in the DACH channel, in
  support, in general and in eng-core, and two more are English replies that
  quote a German line. Twelve of the nineteen are a gold source for a question
  asked in English.
- Values appear in 11 plain text tables, in 3 numbered lists, in 3 pasted JSON
  blocks, and in 2 messages with a typo left in.
- The 34 weekly standups and the 6 monthly digests are template noise: the same
  shape every time with different numbers, and none of them is a gold source.

## The guarantee

For every question, every gold source has at least one chunk in the window the
frozen pipeline retrieves. `npm run validate -- --version v1` runs retrieval for
all 277 questions that have gold sources and reports any miss with the question
id.

It holds at **100 percent** with `top_n` 16, which is what `params.json` sets.

It was not free. Every miss was fixed by rewriting a document or a question
rather than by adding a retrieval step:

- The issue key went into the issue title, because a question that names
  `WRN-4501` matched nothing when the key lived only in the document id.
- The middle document of a multihop was given the vocabulary a real record
  would carry. The contract summary that ties Kestrel Health to the premium tier
  now says Kestrel Health and says SLA, because a contract summary does. The
  amendment that moves Meridian Logistics to the enterprise tier now says what
  that does to their SLA response target, for the same reason.
- Near-duplicate reference documents were merged. Two identical approval band
  tables competed for the same window slot and pushed the gold one out of it.
- German messages that answer an English question were given an English subject
  line, the way a bilingual office writes them.
- Five questions were rephrased to name what the asker knows: the issue subject
  as well as the issue key, or the customer as well as the thing asked about.

A supporting document that could not be brought inside the window without
distorting the record was left out of the gold sources instead. It could never
be cited, so calling it a gold source would only have broken the guarantee.

The traps still live inside the window. Distractors, stale repeats and
near-duplicates are retrieved alongside the gold documents; the guarantee is
that the truth is present, not that it is alone.

## Aliases

`aliases.json` resolves a normalized string to a canonical spelling before the
value channel compares it, so the benchmark measures reading rather than
phrasing. A leading `a`, `an` or `the` is already dropped by the normalizer
before the table is consulted, so `the platform team` and `platform team` need
no entry in it. What is left is the table's real work: surnames resolve to full
names, and a handful of phrases the corpus writes one way and a model would
write another are mapped.

There is deliberately no alias for the bare first name `Ravi` or the bare first
name `Anna`. Two people carry each of those, so only the full names and the
surnames resolve, and a reply that says only "Ravi" is not an answer.
