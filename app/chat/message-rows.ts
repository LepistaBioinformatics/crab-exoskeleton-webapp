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
  /**
   * Names this call's durable record: the FULL command and the output, neither
   * of which is in the transcript. `arguments` above is capped at 200 runes by
   * the harness and a tool result is never written to history at all, so this
   * is the only way to either.
   *
   * ABSENT IS THE COMMON CASE and it means "there is nothing to open": every
   * transcript written before the harness minted these, every conversation
   * under picoclaw, and every event that is not a tool call. A row only becomes
   * clickable when it has one.
   */
  // Snake case, like `created_at` on ChatMessage below: these objects are the
  // proxy's JSON re-serialised whole, with no mapping layer anywhere between,
  // so a camelCase name here would simply be undefined at runtime.
  audit_id?: string;
  /** How many of something: for "compact", the messages that were dropped. */
  count?: number;
}

/**
 * Whether this event has a record a member can open.
 *
 * BOTH HALVES ARE REQUIRED and each rules out a different thing. The kind rules
 * out the events that have no command and no output to show at all -- a model
 * fallback, a depth change, a compaction -- which would open a sheet with two
 * empty sections. The id rules out the tool calls that DO have both but whose
 * record was never written: every conversation older than the record, every one
 * under a harness that writes none, and any call whose write failed.
 *
 * Here rather than in the component because it decides two things that must not
 * drift apart -- whether the row is a button, and whether the sheet has anything
 * to fetch -- and because a rule in a 1500-line client component is a rule no
 * test reaches.
 */
export function opensRecord(e: TurnEvent): boolean {
  return e.kind === "tool" && !!e.audit_id;
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
  | { row: "steps"; items: StepItem[] }
  /**
   * The harness shortened the context window. Carries `m` like a message row so
   * `rowRole` keeps working off one field; it is a separate variant because it
   * is neither something anyone said nor work the agent did.
   */
  | { row: "compaction"; m: ChatMessage; i: number }
  /**
   * A member was asked whether a tool call could run, and answered. Carries `m`
   * for the same reason the compaction variant does; it is separate from both
   * of them because it is neither work the agent did nor something that
   * happened to the conversation -- it is the one row whose subject is the
   * member.
   */
  | { row: "approval"; m: ChatMessage; i: number };

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
    // BEFORE the step test, because a compaction record reaches us in the same
    // shape as a silent tool call -- an entry with no content carrying events --
    // and the only thing separating them is the kind the proxy assigned.
    if (m.kind === KIND_COMPACTION) {
      rows.push({ row: "compaction", m, i });
      return;
    }
    // Same reason, same position: an approval record is an events-only entry
    // too, and folded into a run it would read as "3 steps" with the decision
    // the member made hidden inside it.
    if (m.kind === KIND_APPROVAL) {
      rows.push({ row: "approval", m, i });
      return;
    }
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

/**
 * The kind the proxy stamps on the harness's record that it shortened the
 * context window, and the event kind inside it.
 */
export const KIND_COMPACTION = "compaction";
const EVENT_COMPACT = "compact";

/**
 * The kind the proxy stamps on the harness's record of an approval decision,
 * and the event kind inside it.
 */
export const KIND_APPROVAL = "approval";
const EVENT_APPROVAL = "approval";

/** How an approval ended, as the harness records it. */
export type ApprovalStatus = "ok" | "denied" | "expired" | "failed";

/** One approval decision, as the row renders it. */
export interface ApprovalRecord {
  /** The gated tool. Empty only on a record written by something older. */
  tool: string;
  /**
   * The outcome. `expired` is NOT `denied`: the member did not refuse, they
   * were not there -- which is the half of this that nothing recorded before,
   * because the proxy drops a request it never got an answer for.
   */
  status: ApprovalStatus;
  /**
   * The member's own words on a refusal, and nothing else. The harness writes
   * no detail on the other three outcomes: the sentences it composes for them
   * are English, written for the model, and this app renders every word the
   * member reads from `status` instead.
   */
  reason: string;
  /**
   * The call's arguments, FLATTENED AND CAPPED by the harness. A display
   * string, never JSON: a truncated document is not one, so this is shown
   * verbatim and never parsed.
   */
  args: string;
}

const APPROVAL_STATUSES: ApprovalStatus[] = ["ok", "denied", "expired", "failed"];

/**
 * What an approval record says, or null when the entry carries no such event.
 *
 * An unrecognised status falls back to "failed" rather than being dropped: the
 * decision DID happen, and a row that says "something went wrong with the
 * permission" is honest about a code this client does not know, where no row at
 * all would claim nobody was ever asked.
 */
export function approvalRecord(m: ChatMessage): ApprovalRecord | null {
  const e = (m.events ?? []).find((ev) => ev.kind === EVENT_APPROVAL);
  if (!e) return null;
  const status = APPROVAL_STATUSES.find((s) => s === e.status) ?? "failed";
  return { tool: e.name ?? "", status, reason: e.detail ?? "", args: e.arguments ?? "" };
}

/**
 * How many messages a compaction record says were dropped, or 0 when the record
 * does not say. Zero is rendered as the divider without a count rather than as
 * "0 messages", which would claim something false about a real event.
 */
export function compactedCount(m: ChatMessage): number {
  const e = (m.events ?? []).find((ev) => ev.kind === EVENT_COMPACT);
  return e?.count ?? 0;
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
    // A compaction divider is skipped for the same reason a step is: opening a
    // conversation on "12 earlier messages were compacted" lands the member on
    // a note about the transcript instead of on the transcript. An approval
    // record is skipped on the same ground -- it is a note about a decision,
    // and what the member wants to see on opening is what was said.
    const k = messages[i].kind;
    if (k !== "step" && k !== KIND_COMPACTION && k !== KIND_APPROVAL) return i;
  }
  return messages.length - 1;
}
