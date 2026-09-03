# Corpus v1

A frozen archive of an invented company, and 236 questions asked of it. No
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
regions, under contracts that change during the period.

The archive runs from 2027-01-04 to 2027-07-01. Nothing in it is real.

## The documents

580 documents, 103,660 characters, 608 chunks after ingest.

| type | count | what it is |
| --- | --- | --- |
| `slack` | 420 | messages across twelve channels, short and casual, some in threads |
| `doc` | 59 | reference material: runbooks, policies, tables, an architecture note, a glossary, monthly digests |
| `meeting_note` | 43 | notes on one template, plus the weekly standups that use the same template every week |
| `email` | 36 | with signatures, and 17 of them with a quoted chain below the reply |
| `issue` | 11 | with a description that names the customer, the symptom and the component |
| `issue_comment` | 11 | comments that say what they change |

The twelve channels are `eng-core`, `eng-palisade`, `eng-relay`, `infra`,
`support`, `sales`, `incidents`, `general`, `dach`, `security`, `data-platform`
and `release`.

The average document is 179 characters, because most of them are Slack
messages. Ten are deliberately long, between 1,202 and 1,663 characters, and
chunk into three or four pieces: a handbook, a data processing agreement, two
runbooks, an architecture note, an onboarding guide, a glossary, a postmortem, a
support FAQ and a release process. Those are where the `chunk_split` questions
live.

## The questions

236 questions. Every family carries at least 20 and every trap kind at least 15.

| family | count |
| --- | --- |
| `lookup` | 37 |
| `temporal` | 27 |
| `rule` | 24 |
| `join` | 22 |
| `multihop` | 22 |
| `abstain` | 22 |
| `exhaustive` | 21 |
| `aggregation` | 21 |
| `current` | 20 |
| `asof` | 20 |

| trap | count |
| --- | --- |
| `superseded` | 59 |
| `negation` | 31 |
| `keyword` | 30 |
| `retraction` | 25 |
| `statement_shaped_question` | 23 |
| `proposal` | 23 |
| `format` | 23 |
| `scope` | 22 |
| `quoted_email` | 19 |
| `same_name` | 18 |
| `unit` | 17 |
| `chunk_split` | 16 |
| `relative_date` | 15 |
| `timezone` | 15 |
| `planned_vs_done` | 15 |

Answer types: 101 `number`, 53 `string`, 33 `date`, 21 `string[]`, 16 `boolean`,
12 `time`.

41 questions carry a scored history chain: 39 of three steps and 2 of four, each
with at least one stale repeat of an older value dated after the change. The
`current` and `asof` families are built on twenty such chains, which is why both
are exactly 20.

Gold sources per question: 56 questions have one, 74 have two, 79 have three, 5
have four, and the 22 abstain questions have none. A gold source is a document
that states or changes the answer. A distractor is never a gold source, however
close it reads.

## How the corpus is written

- Issues have descriptions that say what the issue is about and name the
  incident, the customer or the metric they concern. The issue key leads the
  title, the way a tracker shows it.
- Comments say what they change.
- Emails name the contract or the quote they concern, carry a signature, and
  prefix quoted lines with `>`.
- Slack threads have a parent that carries the value and replies that agree.
- Questions are phrased the way a person asks, naming what they know: the issue
  key, the customer, the metric, the component.
- Relative dates are resolved from the message timestamp. A message written on
  Thursday 11 February that says "next Tuesday" means 2027-02-16, and the
  generator refuses to write the phrase if the weekday does not match.
- The clocks go forward on 2027-03-28. Documents before that date carry a
  `+01:00` offset and documents after it carry `+02:00`, and the timezone
  questions turn on that hour.
- Seventeen messages are in German, in the DACH channel and in support. Four of
  them carry a value that is asked for in English.
- Values appear in ten plain text tables, in numbered lists, in two pasted JSON
  blocks, and in two messages with a typo left in.
- The 34 weekly standups and the 6 monthly digests are template noise: the same
  shape every time with different numbers, and none of them is a gold source.

## The guarantee

For every question, every gold source has at least one chunk in the window the
frozen pipeline retrieves. `npm run validate -- --version v1` runs retrieval for
all 214 questions that have gold sources and reports any miss with the question
id.

It holds at **100 percent** with `top_n` 16, which is what `params.json` sets.

It was not free. The first pass held at 86 percent, and every miss was fixed by
rewriting a document or a question rather than by adding a retrieval step:

- The issue key went into the issue title, because a question that names
  `WRN-4501` matched nothing when the key lived only in the document id.
- The middle document of a multihop was given the vocabulary a real record
  would carry. The contract summary that ties Kestrel Health to the premium tier
  now says Kestrel Health and says SLA, because a contract summary does.
- Near-duplicate reference documents were merged. Two identical approval band
  tables competed for the same window slot and pushed the gold one out of it.
- German messages that answer an English question were given an English subject
  line, the way a bilingual office writes them.
- Two questions were rephrased to name what the asker knows: the issue subject
  as well as the issue key.

The traps still live inside the window. Distractors, stale repeats and
near-duplicates are retrieved alongside the gold documents; the guarantee is
that the truth is present, not that it is alone.

## Aliases

`aliases.json` resolves a normalized string to a canonical spelling before the
value channel compares it, so the benchmark measures reading rather than
phrasing. Surnames resolve to full names, `platform team` and `the platform
team` are the same answer, and a handful of phrases that the corpus writes one
way and a model would write another are mapped.

There is deliberately no alias for the bare first name `Ravi` or the bare first
name `Anna`. Two people carry each of those, so only the full names and the
surnames resolve, and a reply that says only "Ravi" is not an answer.
