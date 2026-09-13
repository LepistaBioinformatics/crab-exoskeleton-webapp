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

/**
 * One thing the agent's loop DID: a tool it ran, a child it dispatched, a model
 * it fell back to, a depth it changed to.
 *
 * Nothing here is a sentence, and that is the contract: the harness has no
 * locale, so `kind` and `status` are codes this app renders in the reader's own
 * language. `name`, `arguments` and `detail` are data and are shown verbatim.
 */
export interface TurnEvent {
  /** "tool" | "subagent" | "model" | "depth". */
  kind: string;
  name?: string;
  /** The call's arguments, already flattened and capped by the harness. */
  arguments?: string;
  /**
   * "ok" | "denied" | "failed". ABSENT is meaningful: it is a call whose outcome
   * nobody recorded -- a narration frame names its tools before they run, and a
   * turn that died inside one never learned how it ended.
   */
  status?: string;
  detail?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  /** "step" when the agent was narrating; absent on a plain answer. */
  kind?: string;
  /** The model's own chain of thought, when it emitted one. */
  reasoning?: string;
  /** What the loop did during this step. */
  events?: TurnEvent[];
}

/** One rendered row: a message, or a run of narration steps. */
export type Row =
  | { row: "message"; m: ChatMessage; i: number }
  | { row: "steps"; items: StepItem[] };

/**
 * One step inside a run: the message that narrated it, plus the events of the
 * iteration it belongs to.
 *
 * `events` is SEPARATE from `m.events` because it is a merge — the harness
 * writes an iteration's narration and its events as two entries (an event can
 * only say how a call ended once it has, and the narration is written before the
 * call runs so it survives a turn that dies inside one). One step on screen is
 * both.
 */
export interface StepItem {
  m: ChatMessage;
  i: number;
  events?: TurnEvent[];
}

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
    // AN ITERATION IS ONE STEP, written as two entries. The events entry carries
    // no content -- it is the same iteration's detail -- so it folds into the
    // step before it rather than counting as another. Without this a fourteen
    // iteration turn reads as "28 steps", and `landingIndex` walks back over
    // twice as many rows looking for the answer.
    //
    // The merge is HERE rather than in the proxy because the three rules that
    // would otherwise disagree about what a step is -- the run's label, rowRole's
    // spacing, and landingIndex's scroll target -- are all in this file.
    if (isEventsOnly(m) && last?.row === "steps" && last.items.length > 0) {
      const prev = last.items[last.items.length - 1];
      prev.events = [...(prev.events ?? []), ...(m.events ?? [])];
      return;
    }
    // An events entry with no step before it stands on its own: it happens when
    // the very first iteration narrates nothing, and dropping it would hide
    // exactly the silent tool call this feature exists to recover.
    const item: StepItem = { m, i, events: m.events };
    if (last?.row === "steps") last.items.push(item);
    else rows.push({ row: "steps", items: [item] });
  });
  return rows;
}

/** A step that is only its iteration's events -- no narration of its own. */
function isEventsOnly(m: ChatMessage): boolean {
  return m.content.trim() === "" && (m.events?.length ?? 0) > 0;
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
