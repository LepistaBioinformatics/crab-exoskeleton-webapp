// Grouping the transcript into rendered rows.
//
// The proxy marks a message `kind: "step"` when the agent was narrating its work
// (a frame that also carried a tool call) rather than answering. Two thirds of
// the assistant messages in a real transcript are these, and rendering each as a
// full message band is both wrong -- the live stream shows them as progress, not
// as replies -- and the reason a question and its answer end up hundreds of
// pixels apart. So consecutive steps collapse into one row.
//
// Pure, and separate from chat-view, so the run boundaries and the index
// bookkeeping can be tested without mounting the view.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  /** "step" when the agent was narrating; absent on a plain answer. */
  kind?: string;
  /** The model's own chain of thought, when it emitted one. */
  reasoning?: string;
}

/** One rendered row: a message, or a run of narration steps. */
export type Row =
  | { row: "message"; m: ChatMessage; i: number }
  | { row: "steps"; items: { m: ChatMessage; i: number }[] };

/**
 * Groups messages into rows. `i` is carried through as the message's index in
 * the original array -- scroll refs and the tree's `msg` anchor are keyed by it,
 * so it must survive the grouping.
 *
 * Steps only merge with their immediate neighbours, so an answer between two
 * runs keeps them as two blocks rather than folding the answer's context away.
 */
export function toRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    if (m.kind !== "step") {
      rows.push({ row: "message", m, i });
      return;
    }
    const last = rows[rows.length - 1];
    if (last?.row === "steps") last.items.push({ m, i });
    else rows.push({ row: "steps", items: [{ m, i }] });
  });
  return rows;
}

/**
 * The speaker a row spaces against. A run is the agent's, so it counts as one
 * assistant block rather than as the several messages inside it -- otherwise the
 * padding of the messages around it would be computed against invisible
 * neighbours.
 */
export function rowRole(r: Row): "user" | "assistant" {
  return r.row === "steps" ? "assistant" : r.m.role;
}

/**
 * Where opening a conversation should land: the last message that is not a
 * narration step.
 *
 * Plain `length - 1` would land on a collapsed block whenever a transcript ends
 * on narration -- which happens when the agent narrates after answering, and
 * whenever the last entry is a reasoning-only step (those are never promoted
 * back to an answer, since they have no text of their own). Returns -1 for an
 * empty list, and falls back to the last message when every one is a step.
 */
export function landingIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind !== "step") return i;
  }
  return messages.length - 1;
}
