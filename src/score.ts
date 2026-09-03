// Deterministic scoring of one pack against one gold pack. There is no LLM
// judge anywhere: every channel is an equality between normalized values.
//
//   value    the normalized value equals the normalized gold value
//   status   answered or not_in_evidence, equal to the gold status
//   history  the SET of normalized (value, from) pairs equals the gold chain
//            exactly, so a stale repeat entered as a new step, a missing step
//            and an extra step all fail. Scored only when the gold declares
//            history_scored.
//   sources  every cited id is a gold source AND at least one gold source is
//            cited. Recall is reported beside it as a number. When the gold
//            cites nothing, which is every abstain question, citing anything
//            fails.
//
// A reply that could not be parsed into an object is incorrect on every
// channel, including on an abstain question: refusing to emit JSON is not the
// same as answering not_in_evidence.

import { normalizeField } from "./normalize.js";
import type { Aliases } from "./normalize.js";
import type { AnswerType, ChannelResult, Gold, HistoryStep, Pack, Scored } from "./types.js";

const WRONG: ChannelResult = { scored: true, correct: false };
const UNSCORED: ChannelResult = { scored: false, correct: false };

function historyKey(step: HistoryStep, type: AnswerType, aliases: Aliases): string {
  const value = normalizeField(step.value, type, aliases).key;
  const from = normalizeField(step.from, "date", aliases).key;
  return `${from}=>${value}`;
}

/** The chain as a set of normalized (value, from) keys. Duplicates collapse, so a repeated step is one step. */
function historyKeys(steps: HistoryStep[], type: AnswerType, aliases: Aliases): Set<string> {
  return new Set(steps.map((step) => historyKey(step, type, aliases)));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const entry of a) if (!b.has(entry)) return false;
  return true;
}

export function scoreSources(cited: string[], gold: string[]): { correct: boolean; recall: number | null } {
  const wanted = new Set(gold);
  const got = new Set(cited);
  if (wanted.size === 0) {
    // Nothing supports a value, so any citation is a citation of something that
    // does not support it.
    return { correct: got.size === 0, recall: null };
  }
  let found = 0;
  for (const id of wanted) if (got.has(id)) found += 1;
  const everyCitedIsGold = [...got].every((id) => wanted.has(id));
  return { correct: everyCitedIsGold && found > 0, recall: found / wanted.size };
}

export function scorePack(pack: Pack | null, gold: Gold, type: AnswerType, aliases: Aliases): Scored {
  const historyChannel = gold.history_scored;
  if (pack === null) {
    return {
      value: WRONG,
      status: WRONG,
      history: historyChannel ? WRONG : UNSCORED,
      sources: WRONG,
      sources_recall: gold.sources.length === 0 ? null : 0,
      fully_correct: false,
    };
  }

  const value: ChannelResult = {
    scored: true,
    correct: normalizeField(pack.value, type, aliases).key === normalizeField(gold.value, type, aliases).key,
  };
  const status: ChannelResult = { scored: true, correct: pack.status === gold.status };
  const history: ChannelResult = historyChannel
    ? {
        scored: true,
        correct: sameSet(historyKeys(pack.history, type, aliases), historyKeys(gold.history, type, aliases)),
      }
    : UNSCORED;
  const sourcesScore = scoreSources(pack.sources, gold.sources);
  const sources: ChannelResult = { scored: true, correct: sourcesScore.correct };

  const channels = [value, status, history, sources];
  return {
    value,
    status,
    history,
    sources,
    sources_recall: sourcesScore.recall,
    fully_correct: channels.every((channel) => !channel.scored || channel.correct),
  };
}
