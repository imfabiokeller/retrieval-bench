// Ingest. Every doc becomes one or more chunks and every chunk gets a
// contextual prefix (document id, type, channel or project, author, date,
// title). The prefix is part of the text that BM25 indexes AND part of the text
// that is embedded, which is what lets a query like "who announced the GA date
// in eng-palisade" match on metadata the message body never repeats. The
// document id leads the prefix because it is what the model cites: the sources
// channel is only answerable when the id is on the extract the answer came from.
//
// A Slack message is always exactly one chunk. Longer docs are packed into
// chunks of at most CHUNK_TARGET_CHARS on sentence boundaries.
//
// v1 runs no LLM at ingest. There is no distill or summarize step: the only
// model call in the whole benchmark is the one extraction call per item, so
// that call is the only thing the leaderboard can be measuring.

import type { Chunk, Doc } from "./types.js";

export const CHUNK_TARGET_CHARS = 500;

export function isoDate(created_at: string): string {
  return created_at.slice(0, 10);
}

export function contextPrefix(doc: Doc): string {
  let head: string;
  switch (doc.type) {
    case "slack":
      head = `slack message in #${doc.channel ?? "unknown"}`;
      break;
    case "issue":
      head = `issue ${doc.id} in project ${doc.project ?? "unknown"}`;
      break;
    case "issue_comment":
      head = `comment on issue ${doc.parent_id ?? "unknown"} in project ${doc.project ?? "unknown"}`;
      break;
    case "email":
      head = "email";
      break;
    case "meeting_note":
      head = "meeting note";
      break;
    default:
      head = "document";
  }
  const parts = [`id=${doc.id}`, head, `by ${doc.author}`, `on ${isoDate(doc.created_at)}`];
  if (doc.title) parts.push(`titled ${doc.title}`);
  return `[${parts.join(" | ")}]`;
}

/** Greedy sentence packing. Never splits mid-sentence unless a sentence alone is too long. */
export function splitBody(text: string, targetChars: number): string[] {
  if (text.length <= targetChars) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (piece.length === 0) continue;
    if (current.length === 0) {
      current = piece;
    } else if (current.length + 1 + piece.length <= targetChars) {
      current = `${current} ${piece}`;
    } else {
      parts.push(current);
      current = piece;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export function chunkDoc(doc: Doc, targetChars = CHUNK_TARGET_CHARS): Chunk[] {
  const prefix = contextPrefix(doc);
  const bodies = doc.type === "slack" ? [doc.text] : splitBody(doc.text, targetChars);
  return bodies.map((body, ordinal) => {
    const chunk: Chunk = {
      id: `${doc.id}#${ordinal}`,
      doc_id: doc.id,
      ordinal,
      text: `${prefix}\n${body}`,
      body,
      prefix,
      type: doc.type,
      author: doc.author,
      created_at: doc.created_at,
    };
    if (doc.channel) chunk.channel = doc.channel;
    if (doc.project) chunk.project = doc.project;
    if (doc.title) chunk.title = doc.title;
    return chunk;
  });
}

export function chunkCorpus(docs: Doc[], targetChars = CHUNK_TARGET_CHARS): Chunk[] {
  return docs.flatMap((doc) => chunkDoc(doc, targetChars));
}
