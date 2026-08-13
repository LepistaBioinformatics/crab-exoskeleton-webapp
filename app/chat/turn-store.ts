// Per-conversation turn state, held at module scope.
//
// Everything here is keyed by session id and deliberately outside React. Three
// separate symptoms all came from turn state living in ChatView: the "sent"
// indicator vanished when you switched conversations, the composer locked while
// a turn ran, and a reply that arrived after you navigated away was lost. The
// component is the wrong owner -- it resets on every `sid` change and unmounts
// entirely on a workspace change (chat-shell.tsx keys ChatView on t|s|r).
//
// The queue that used to be `pendingOutbox` lives here too, for the same reason
// it was module-scope before: a stack parked by switching chats must survive.
//
// picoclaw does NOT stream: it returns the whole answer in one frame (measured
// -- see .specs/features/chat-responsiveness/spec.md OQ-1). The reveal driver
// below is therefore the only thing that makes a reply appear progressively,
// and it runs here rather than in a component so it keeps going across a
// remount instead of freezing mid-word.

import { useSyncExternalStore } from "react";
import { historyQuery, type Workspace } from "@/app/chat/fragment";
import {
  notifyConversationsUpdated,
  syncSessionRefs,
  touchConversation,
} from "@/lib/chatSession";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// A message isn't POSTed the instant you hit send: it joins a burst and, after
// this long with no further typing/sending, the whole burst flushes as ONE
// turn. Typing again re-arms the timer.
export const SEND_DEBOUNCE_MS = 500;

// Sending retries on transport / gateway failure (fetch throws or a 5xx) with
// exponential backoff. A 4xx (auth/validation) is terminal and never retried.
export const MAX_SEND_ATTEMPTS = 10;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const retryDelay = (attempt: number) => Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reveal pacing is planned per turn, not fixed per tick.
//
// The first version ticked every 40ms and let the STEP COUNT follow from the
// length -- ~200 steps for a long reply. Each step re-renders the assistant
// band, and `MessageContent` re-parses the whole revealed markdown through
// react-markdown + remark-gfm (plus a ResizeObserver per table). So the render
// cost per step grows with what has already been revealed, making the total
// O(n²): a 2,900-word reply asked for ~200 reparses of a document growing to
// 17KB. The browser could not keep up, and the reveal ran slower than its own
// nominal rate -- shortening the tick only made it schedule more work it
// couldn't finish.
//
// So the STEP COUNT is what is capped now, and the tick is derived. Duration is
// the same; the number of expensive re-renders is bounded.
const REVEAL_MS_PER_WORD = 27; // per-word cadence for short replies
const REVEAL_TOTAL_MS = 5333; // ceiling: no reply takes longer than this
const REVEAL_MAX_STEPS = 60; // ceiling on re-renders (was effectively ~200)
const REVEAL_MIN_TICK_MS = 16; // never schedule faster than a frame

// How long the band may sit with no progress event and no content before it
// admits it's still waiting. The measured tool-free turn emitted NOTHING for 51
// seconds; without this the last event freezes and it looks hung again.
export const SILENCE_GRACE_MS = 6000;

// A cut stream is recovered by POLLING the durable transcript, never by re-sending.
//
// The proxy detaches the turn from the request (sse.go runs it on a background
// context, deliberately not on r.Context()), so losing the stream loses the VIEW of
// the turn and never the turn itself. It then folds the finished turn into the
// durable transcript, which the history endpoint prefers -- so that transcript is
// frozen for the whole turn and grows by the whole turn at once. Its growth is
// therefore an exact completion signal, and needs no string to survive the trip
// through picoclaw.
export const RECOVERY_POLL_MS = 5000;
// Must outlast the proxy's own bound on a detached turn: `turnTimeout`, 10 minutes
// in crab-shell-proxy/internal/httpapi/sse.go. Giving up sooner would report a turn
// as lost while the proxy is still legitimately running it; the extra minute covers
// the durable fold plus one poll interval.
export const RECOVERY_BUDGET_MS = 11 * 60 * 1000;

// After an upload, picoclaw reloads to pick up the new workspace file. Give it a
// moment to settle before firing the turn, so the first message right after an
// attach doesn't hit the container mid-reload ("Can't reach the gateway").
const UPLOAD_SETTLE_MS = 1500;

let lastUploadAt = 0;

/** Called by the view after a successful upload, to arm the settle wait. */
export function noteUpload() {
  lastUploadAt = Date.now();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressKind = "thought" | "tool" | "placeholder" | "typing";

export interface Progress {
  kind: ProgressKind;
  /** Human-readable narration. Empty for `typing`. */
  text: string;
  /** The tool's function name, when kind is "tool". */
  tool?: string;
  /** "start" | "stop", only for kind "typing". */
  state?: string;
}

export interface TurnState {
  /** True while a turn is posted/streaming for this conversation. */
  running: boolean;
  /** Composed-but-not-yet-flushed messages (the debounce burst). */
  pending: string[];
  /**
   * The user message of the turn currently in flight, kept so returning to the
   * conversation re-renders it above the reply instead of showing a bare
   * assistant band. Survives the history reload; cleared by `clearCompleted`.
   */
  activeUserMessage: string | null;
  /** Flushed bursts waiting their turn. Each entry is one future turn. */
  queue: string[];
  /** Current retry attempt, or null when not retrying. */
  retrying: number | null;
  /** Latest progress event, or null. */
  progress: Progress | null;
  /** Timestamp of the last progress event or content arrival. */
  lastEventAt: number;
  /** Words already revealed for the in-flight reply. */
  revealed: string;
  /** Arrived but not yet revealed. */
  buffered: string;
  /** The upstream finished sending; the reveal may still be draining. */
  arrivalDone: boolean;
  /** Terminal error key for this conversation, or null. */
  error: string | null;
  /**
   * The harness's OWN sentence about the failure, or null.
   *
   * Separate from `error` because that one is a stable CODE which `errorText` maps
   * to localized copy, falling back to "unknown" for anything else — so putting
   * picoclaw's sentence there would render "unknown error" and discard exactly the
   * part worth reading ("update agents.defaults.image_model to a multimodal
   * model"). Free text, never translated: it is the harness talking, not us.
   */
  errorDetail: string | null;
  /**
   * The stream was cut mid-turn and we are polling the transcript for the reply.
   *
   * Not an error state: the turn is still running upstream. `running` stays true
   * throughout, so the bands stay on screen and a queued turn keeps waiting.
   */
  recovering: boolean;
  /** When the recovery wait began, for the elapsed readout. */
  recoveringSince: number;
  /** Waiting for picoclaw to reload after an attachment upload. */
  settling: boolean;
  /** A stop was asked for and the request has not answered yet. */
  stopping: boolean;
}

/** Everything a queued turn needs to actually run, captured at submit time. */
export interface RunContext {
  workspace: Workspace;
  /**
   * agent-projects: the project this conversation belongs to, null for the main
   * agent. It comes from the conversation record rather than from whatever the
   * UI currently has selected — a conversation's project is fixed at creation,
   * and sending a different one would route the turn to another agent and write
   * it into another workspace.
   */
  project?: string | null;
  /** Called on a 401 so the caller can route to signin. */
  onUnauthorized: () => void;
}

const EMPTY: TurnState = {
  running: false,
  pending: [],
  activeUserMessage: null,
  queue: [],
  retrying: null,
  progress: null,
  lastEventAt: 0,
  revealed: "",
  buffered: "",
  arrivalDone: true,
  error: null,
  errorDetail: null,
  recovering: false,
  recoveringSince: 0,
  settling: false,
  stopping: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const turns = new Map<string, TurnState>();
const contexts = new Map<string, RunContext>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getTurn(sid: string | undefined): TurnState {
  if (!sid) return EMPTY;
  return turns.get(sid) ?? EMPTY;
}

// Snapshots are replaced wholesale on every mutation, so reference equality is
// the correct bail-out for useSyncExternalStore -- no custom comparator.
function patch(sid: string, next: Partial<TurnState>) {
  const cur = turns.get(sid) ?? EMPTY;
  turns.set(sid, { ...cur, ...next });
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTurn(sid: string | undefined): TurnState {
  return useSyncExternalStore(
    subscribe,
    () => getTurn(sid),
    () => EMPTY, // server snapshot
  );
}

// ---------------------------------------------------------------------------
// Debounce burst (formerly `pendingOutbox`)
// ---------------------------------------------------------------------------

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearFlushTimer(sid: string) {
  const timer = flushTimers.get(sid);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(sid);
  }
}

/**
 * Stack a composed message as pending (pulsing, not sent) and arm the debounce.
 * Unlike the previous implementation this never refuses while a turn is running
 * -- the burst simply queues behind it.
 */
export function enqueue(sid: string, composed: string, ctx: RunContext) {
  contexts.set(sid, ctx);
  const cur = getTurn(sid);
  // The error clears HERE, on the send, not when the turn actually starts: a queued
  // burst can sit for seconds and a banner about the previous failure should not
  // outlive the member's decision to try again. `errorDetail` goes with its code —
  // separated, a stale harness sentence renders under a later, unrelated one.
  patch(sid, { pending: [...cur.pending, composed], error: null, errorDetail: null });
  armFlush(sid);
}

/** A keystroke while a burst is pending pushes the flush back. */
export function bumpFlush(sid: string) {
  if (getTurn(sid).pending.length > 0) armFlush(sid);
}

function armFlush(sid: string) {
  clearFlushTimer(sid);
  flushTimers.set(
    sid,
    setTimeout(() => flushPending(sid), SEND_DEBOUNCE_MS),
  );
}

/**
 * Park the burst without sending -- used when the user navigates away. The
 * stack stays in the store and its countdown resumes only when the user
 * re-engages (types or sends), never just from looking at the conversation.
 */
export function parkFlush(sid: string | undefined) {
  if (sid) clearFlushTimer(sid);
}

/**
 * The debounce fired: the whole burst becomes ONE queued turn. Bursts separated
 * by more than the debounce window become separate turns (DEC-2).
 */
export function flushPending(sid: string) {
  clearFlushTimer(sid);
  const cur = getTurn(sid);
  if (cur.pending.length === 0) return;
  patch(sid, { pending: [], queue: [...cur.queue, cur.pending.join("\n\n")] });
  void drain(sid);
}

// ---------------------------------------------------------------------------
// Sequential turn queue
// ---------------------------------------------------------------------------

/**
 * Run queued turns one at a time. Not gated on the conversation being on
 * screen: a turn the user committed must finish (and the next must follow) even
 * if they walked away -- the proxy runs it regardless (sse.go detaches the turn
 * from the request), so abandoning it here would only lose the UI's copy.
 */
// Conversations with a drain loop already running. This must be a SYNCHRONOUS
// flag, not `state.running`: `drain` is called fire-and-forget, and `running`
// is only set once `runTurn` is entered — so two bursts flushing back to back
// would both pass a `running` check and run concurrently, clobbering each
// other's reveal buffer.
const draining = new Set<string>();

async function drain(sid: string) {
  if (draining.has(sid)) return;
  const ctx = contexts.get(sid);
  if (!ctx) return;

  draining.add(sid);
  try {
    while (getTurn(sid).queue.length > 0) {
      const [next, ...rest] = getTurn(sid).queue;
      patch(sid, { queue: rest });
      await runTurn(sid, next, ctx);
      // Wait for the reveal to finish before starting the next turn. Without
      // this the next runTurn resets `revealed`/`buffered` and the previous
      // reply is wiped off the screen mid-sentence.
      await awaitDrained(sid);
    }
  } finally {
    draining.delete(sid);
  }
}

// Resolvers waiting for a conversation's reveal to finish draining.
const drainWaiters = new Map<string, Array<() => void>>();

function awaitDrained(sid: string): Promise<void> {
  if (!getTurn(sid).running) return Promise.resolve();
  return new Promise((resolve) => {
    const list = drainWaiters.get(sid) ?? [];
    list.push(resolve);
    drainWaiters.set(sid, list);
  });
}

function releaseDrainWaiters(sid: string) {
  const list = drainWaiters.get(sid);
  if (!list) return;
  drainWaiters.delete(sid);
  for (const resolve of list) resolve();
}

/**
 * Called when a turn has fully finished (arrival done AND reveal drained), so
 * the view can pull the now-durable transcript. The in-flight bands stay in the
 * store until `clearCompleted` is called, so there is no gap between the live
 * reply disappearing and the reloaded one appearing.
 */
type ReplyDone = (sid: string) => void;

let onReplyDone: ReplyDone | null = null;

/**
 * ChatView registers the completion hook. A single global rather than per-sid:
 * only one ChatView is ever mounted, and it checks the sid itself. When no view
 * is mounted (workspace switch mid-turn) this is null and the turn simply
 * finishes into the store -- the next mount reads it from there.
 */
export function setPainter(next: ReplyDone | null) {
  onReplyDone = next;
}

/**
 * Drop the finished turn's in-flight bands. Called by the view once it has
 * reloaded the transcript, so the reply never blinks out and back in.
 */
export function clearCompleted(sid: string) {
  const cur = getTurn(sid);
  if (cur.running) return;
  if (cur.activeUserMessage === null && cur.revealed === "") return;
  // `error` AND `errorDetail` are deliberately preserved: the banner must outlive
  // the bands, or a turn that failed while the user was elsewhere would clear itself
  // silently. For a harness failure that is the ONLY surviving trace — picoclaw does
  // not persist the error, so the transcript this reload just pulled does not
  // contain it and never will.
  patch(sid, { activeUserMessage: null, revealed: "", buffered: "", progress: null });
}

// ---------------------------------------------------------------------------
// Stopping a running turn
// ---------------------------------------------------------------------------

/**
 * Conversations whose in-flight turn was stopped by the member.
 *
 * A synchronous flag rather than a field on the state, and read on every frame
 * `runTurn` is still holding: the POST returns while the stream is open, and
 * picoclaw answers the `/stop` with "Task stopped. …" ON THAT STREAM. Rendering
 * it would put a sentence in the conversation that the next history reload
 * cannot produce -- the abort rolled the turn out of the transcript.
 *
 * It is also what stops `recover()` from polling for a reply that was cancelled,
 * and what keeps the completion painter from reloading over the stopped bands.
 *
 * Cleared by `runTurn`'s finally, so it only ever covers the one turn it was set
 * for.
 */
const stopped = new Set<string>();

/**
 * Stop the turn running on this conversation and return the text that will never
 * be answered, so the caller can put it back in the composer.
 *
 * picoclaw's abort rolls session history back to before the turn, which DELETES
 * the member's own message along with it. Dropping it here as well would mean
 * Stop silently destroys what they typed, so everything uncommitted comes back:
 * the message in flight, then anything queued or still in the debounce burst
 * behind it.
 *
 * Returns null when there was nothing to stop.
 */
export async function stopTurn(sid: string): Promise<string | null> {
  const cur = getTurn(sid);
  const ctx = contexts.get(sid);
  if (!ctx || !cur.running || cur.stopping) return null;

  // Taken before the request: the state is cleared below either way, and reading
  // it afterwards would race the stream still writing into it.
  const unanswered = [cur.activeUserMessage, ...cur.queue, ...cur.pending]
    .filter((text): text is string => !!text && text.trim() !== "")
    .join("\n\n");

  patch(sid, { stopping: true });
  try {
    const res = await fetch(`/api/chat/${ctx.workspace.r}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sid,
        tenant_id: ctx.workspace.t,
        subs_acc_id: ctx.workspace.s,
        ...(ctx.project ? { project: ctx.project } : {}),
      }),
    });
    if (res.status === 401) {
      ctx.onUnauthorized();
      return null;
    }
    if (!res.ok) {
      patch(sid, { stopping: false, error: "stop_failed" });
      return null;
    }
  } catch {
    patch(sid, { stopping: false, error: "stop_failed" });
    return null;
  }

  // The turn may have LANDED while the request was in flight -- the proxy answers
  // 204 for "nothing to stop" too, so a normal completion is indistinguishable
  // from an abort here. `runTurn`'s finally has then already run and taken its
  // normal branch, and it is the only thing that clears `stopped`; setting the
  // flag now would leave it set forever and gate the NEXT turn's whole stream to
  // nothing, with `running` stuck true behind it.
  //
  // Nothing was rolled back either, so there is no text to give back: the message
  // was answered, and putting it in the composer would offer to send it twice.
  if (!getTurn(sid).running) {
    patch(sid, { stopping: false });
    return null;
  }

  // Only now, with the abort acknowledged upstream: clearing the bands on a stop
  // that did not land would hide a turn that is still running and still writing.
  stopped.add(sid);
  clearFlushTimer(sid);
  stopReveal(sid);
  patch(sid, {
    running: false,
    stopping: false,
    pending: [],
    queue: [],
    activeUserMessage: null,
    revealed: "",
    buffered: "",
    // Nothing more is arriving for this turn, whatever the stream does next.
    arrivalDone: true,
    progress: null,
    retrying: null,
    recovering: false,
    settling: false,
    error: null,
    errorDetail: null,
  });
  // Belt and braces. `drain` is awaiting `runTurn` at this point, not
  // `awaitDrained`, so there is normally nobody parked -- and the next
  // `awaitDrained` resolves on its own now that `running` is false. This only
  // matters if a waiter is ever added while a turn is still in flight.
  releaseDrainWaiters(sid);
  return unanswered || null;
}

/** Whether this conversation's in-flight turn was stopped by the member. */
export function wasStopped(sid: string): boolean {
  return stopped.has(sid);
}

// ---------------------------------------------------------------------------
// Recovering a cut stream
// ---------------------------------------------------------------------------

/**
 * How many messages the conversation's durable transcript holds right now, or null
 * when it could not be read. Same request the view's `reloadHistory` makes.
 */
async function transcriptLength(sid: string, ctx: RunContext): Promise<number | null> {
  try {
    const res = await fetch(
      `/api/chat/${ctx.workspace.r}/history?${historyQuery(ctx.workspace, sid, ctx.project)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.messages) ? data.messages.length : null;
  } catch {
    return null;
  }
}

/**
 * The stream ended without the proxy saying the turn was over. Wait for the reply to
 * land in the transcript instead of calling it a failure.
 *
 * Runs INSIDE runTurn's try, before its finally: that is what keeps `running` true
 * and `arrivalDone` false for the whole wait, so `finishIfDrained` cannot end the
 * turn early -- and the completion painter cannot reload a transcript that does not
 * hold the reply yet and then let `clearCompleted` drop the bands (the
 * blanked-conversation defect recorded in chat-view.tsx).
 *
 * It never re-POSTs. The retry ladder above covers the send, before the stream
 * exists; from here on the turn is committed upstream and sending it again would run
 * a ten-minute turn twice.
 */
async function recover(sid: string, ctx: RunContext) {
  patch(sid, { recovering: true, recoveringSince: Date.now() });
  // The baseline comes from the first SUCCESSFUL read, not the first attempt: a
  // recovery that starts while the network is briefly down would otherwise take
  // `null` for "empty" and declare the turn landed on the first poll that got
  // through.
  let baseline = await transcriptLength(sid, ctx);
  const deadline = Date.now() + RECOVERY_BUDGET_MS;
  try {
    while (Date.now() < deadline) {
      await sleep(RECOVERY_POLL_MS);
      const length = await transcriptLength(sid, ctx);
      if (length === null) continue; // one lost sample, not a failure
      if (baseline === null) {
        baseline = length;
        continue;
      }
      if (length > baseline) return; // the turn landed; the painter will pull it
    }
    patch(sid, { error: "turn_lost" });
  } finally {
    patch(sid, { recovering: false });
  }
}

async function runTurn(sid: string, composed: string, ctx: RunContext) {
  const { workspace } = ctx;
  // A `turn_lost` banner is CARRIED into the next turn, unlike every other code.
  //
  // The rule this breaks (a send retires the previous banner, see `enqueue`) assumes
  // the send came AFTER the failure was visible. A turn queued during a recovery was
  // sent up to eleven minutes BEFORE the failure existed, so starting it would wipe
  // the banner in the same tick it appeared -- and for a turn that produced nothing at
  // all, that banner is the only account of it. The next actual send still retires it.
  //
  // Safe to leave standing because the budget outlasts the proxy's own bound on the
  // turn: by the time this is set, the reply it reports as missing cannot still be on
  // its way.
  const lost = getTurn(sid).error === "turn_lost";
  patch(sid, {
    running: true,
    error: lost ? "turn_lost" : null,
    // Cleared with the code it belongs to, or a stale harness sentence would render
    // underneath a later, unrelated failure. Never set alongside `turn_lost` -- the
    // harness never spoke in that case.
    errorDetail: null,
    activeUserMessage: composed,
    revealed: "",
    buffered: "",
    arrivalDone: false,
    progress: null,
    lastEventAt: Date.now(),
  });

  try {
    // Attachments were consumed at enqueue time, so a just-uploaded file is
    // detected from the composed text's "[anexo: …]" refs.
    const settleWait = composed.includes("[anexo:")
      ? Math.max(0, UPLOAD_SETTLE_MS - (Date.now() - lastUploadAt))
      : 0;
    if (settleWait > 0) {
      patch(sid, { settling: true });
      await sleep(settleWait);
      patch(sid, { settling: false });
    }

    const body = JSON.stringify({
      message: composed,
      session_id: sid,
      tenant_id: workspace.t,
      subs_acc_id: workspace.s,
      ...(ctx.project ? { project: ctx.project } : {}),
    });

    let stream: ReadableStream<Uint8Array> | null = null;
    let terminal = false;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS && !terminal; attempt++) {
      try {
        const r = await fetch(`/api/chat/${workspace.r}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (r.status === 401) {
          ctx.onUnauthorized();
          return;
        }
        if (r.ok && r.body) {
          stream = r.body;
          break;
        }
        if (r.status < 500) {
          const data = await r.json().catch(() => null);
          patch(sid, { error: typeof data?.error === "string" ? data.error : "unknown" });
          terminal = true;
          break;
        }
      } catch {
        // transport error -> backoff and retry
      }
      if (attempt < MAX_SEND_ATTEMPTS) {
        patch(sid, { retrying: attempt });
        await sleep(retryDelay(attempt));
      }
    }
    patch(sid, { retrying: null });

    if (!stream) {
      // A terminal 4xx already recorded its reason; otherwise every attempt failed.
      if (!terminal) patch(sid, { error: "gateway_retries_exhausted" });
      return;
    }

    // The turn was accepted -- picoclaw is running it and will persist the
    // session. Only now create/bump the postgres row, so a rejected send never
    // leaves a conversation row with no transcript behind it.
    touchConversation(workspace, sid, composed, ctx.project ?? null).catch(() => {});

    let completed = false;
    try {
      ({ completed } = await consumeStream(
        stream,
        (delta) => {
          // Everything after a stop is discarded, including picoclaw's own
          // "Task stopped." reply, which arrives on this very stream.
          if (stopped.has(sid)) return;
          const cur = getTurn(sid);
          patch(sid, { buffered: cur.buffered + delta, lastEventAt: Date.now() });
          startReveal(sid);
        },
        (progress) => {
          if (stopped.has(sid)) return;
          patch(sid, { progress, lastEventAt: Date.now() });
        },
        // The turn FAILED. One code for the copy, the harness's own words for the
        // detail — see TurnState.errorDetail.
        (message) => {
          if (stopped.has(sid)) return;
          patch(sid, { error: "harness_error", errorDetail: message });
        },
      ));
    } catch {
      // The body died mid-read. Same event as a clean end with no terminal marker:
      // the stream was open, so the turn is running upstream either way. This used
      // to be the ONLY visible symptom of a cut ("Can't reach the gateway"), and it
      // named the wrong problem — nothing was unreachable, we just stopped being
      // told.
      completed = false;
    }

    // No terminal marker and no harness failure: the connection was cut while the
    // turn was still running. Wait for the reply rather than dropping the turn (the
    // clean-EOF path silently reloaded a transcript with nothing new in it, leaving
    // the member's message with no reply and no explanation).
    //
    // Not after a stop: there is no reply coming, and the transcript this would
    // poll had the turn rolled OUT of it, so the wait could only end in the
    // eleven-minute "turn lost" banner for a turn the member cancelled on purpose.
    if (!completed && !getTurn(sid).error && !stopped.has(sid)) await recover(sid, ctx);

    syncSessionRefs(workspace, sid).catch(() => {});
    notifyConversationsUpdated();
  } catch {
    // Only reachable before the stream exists now; a mid-stream failure is a
    // recovery, not a connectivity error.
    if (!stopped.has(sid)) patch(sid, { error: "connectivity" });
  } finally {
    // A stopped turn has already cleared its own state and released the drain
    // loop. Re-running the normal ending would repaint the bands it just cleared
    // and reload a transcript that no longer holds the turn.
    if (stopped.has(sid)) {
      stopped.delete(sid);
    } else {
      patch(sid, { arrivalDone: true, retrying: null, settling: false });
      // The reveal may still be draining; `running` clears when it empties so the
      // caret and the "still working" state don't disappear mid-sentence.
      startReveal(sid);
      finishIfDrained(sid);
    }
  }
}

function finishIfDrained(sid: string) {
  const cur = getTurn(sid);
  if (!cur.arrivalDone || cur.buffered !== "") return;
  if (!cur.running) return;
  patch(sid, { running: false, progress: null });
  onReplyDone?.(sid);
  releaseDrainWaiters(sid);
}

// ---------------------------------------------------------------------------
// Reveal driver ("typewriter")
// ---------------------------------------------------------------------------

const revealTimers = new Map<string, ReturnType<typeof setInterval>>();

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * How to reveal a reply of `totalWords`: how many words each step uncovers and
 * how long to wait between steps.
 *
 * The step count is capped, NOT the tick. Every step re-parses the revealed
 * markdown, so steps are the expensive unit — bounding them is what keeps a long
 * reply from starving the main thread and running slower than its own nominal
 * pace. The duration is unaffected; only its granularity is.
 */
export function revealPlan(totalWords: number): { wordsPerStep: number; tickMs: number } {
  if (totalWords <= 0) return { wordsPerStep: 1, tickMs: REVEAL_MS_PER_WORD };
  // A short reply gets a real per-word cadence; a long one is capped at the
  // total, so nothing ever crawls just because it is big.
  const durationMs = Math.min(REVEAL_TOTAL_MS, totalWords * REVEAL_MS_PER_WORD);
  const steps = Math.min(totalWords, REVEAL_MAX_STEPS);
  return {
    wordsPerStep: Math.ceil(totalWords / steps),
    tickMs: Math.max(REVEAL_MIN_TICK_MS, Math.round(durationMs / steps)),
  };
}

/**
 * Word-boundary character offsets for `text`, so a step can cut at the Nth word
 * with a single slice instead of re-splitting the remaining buffer every time
 * (which made the old driver quadratic). Whitespace rides with the word before
 * it, so markdown structure survives a partial reveal.
 */
function wordOffsets(text: string): number[] {
  const offsets: number[] = [];
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) offsets.push(m.index + m[0].length);
  return offsets;
}

// Per-turn reveal plan. Kept OUT of TurnState: it holds a large array, and every
// patch clones the state object -- there is no reason to churn that per step.
interface RevealPlan {
  full: string;
  offsets: number[];
  cursor: number; // index into offsets
  wordsPerStep: number;
}
const revealPlans = new Map<string, RevealPlan>();

function startReveal(sid: string) {
  const cur = getTurn(sid);
  if (cur.buffered === "") return;

  if (prefersReducedMotion()) {
    // No incremental reveal: hand over everything at once.
    patch(sid, { revealed: cur.revealed + cur.buffered, buffered: "" });
    revealPlans.delete(sid);
    finishIfDrained(sid);
    return;
  }

  // Re-plan whenever new content arrives. picoclaw sends the whole answer in one
  // frame, so in practice this runs once per turn.
  const full = cur.revealed + cur.buffered;
  const offsets = wordOffsets(full);
  const { wordsPerStep, tickMs } = revealPlan(offsets.length);
  const existing = revealPlans.get(sid);
  revealPlans.set(sid, {
    full,
    offsets,
    cursor: existing ? existing.cursor : 0,
    wordsPerStep,
  });

  if (revealTimers.has(sid)) return;
  revealTimers.set(sid, setInterval(() => tickReveal(sid), tickMs));
}

function stopReveal(sid: string) {
  const timer = revealTimers.get(sid);
  if (timer) {
    clearInterval(timer);
    revealTimers.delete(sid);
  }
  revealPlans.delete(sid);
}

function tickReveal(sid: string) {
  const plan = revealPlans.get(sid);
  if (!plan) {
    stopReveal(sid);
    finishIfDrained(sid);
    return;
  }
  plan.cursor = Math.min(plan.cursor + plan.wordsPerStep, plan.offsets.length);
  const cut = plan.cursor === 0 ? 0 : plan.offsets[plan.cursor - 1];
  patch(sid, { revealed: plan.full.slice(0, cut), buffered: plan.full.slice(cut) });

  if (plan.cursor >= plan.offsets.length) {
    stopReveal(sid);
    finishIfDrained(sid);
  }
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

/**
 * Parses the proxy's OpenAI-style SSE stream. Content deltas arrive as
 * `choices[0].delta.content`; progress events ride as an extra top-level
 * `x_crab_progress` on an otherwise-empty chunk, which any client that doesn't
 * know about them simply skips (it yields no content delta).
 *
 * `completed` says whether the proxy declared the turn OVER, as opposed to the body
 * merely ending. The distinction was always here structurally -- `[DONE]` returned
 * while an exhausted reader broke out of the loop -- and throwing it away is what
 * made a cut connection indistinguishable from a finished turn.
 *
 * Either terminal signal counts: `data: [DONE]` or a `finish_reason: "stop"` chunk.
 * The proxy writes both from one `done()` call in a single flush, so accepting
 * either is what makes "no marker" mean "cut" and never "we lost the last frame of
 * a turn that had already been folded into the transcript".
 */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
  onProgress?: (progress: Progress) => void,
  onError?: (message: string) => void,
): Promise<{ completed: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (payload === "[DONE]") return { completed: true };

      try {
        const parsed = JSON.parse(payload);
        const progress = parsed?.x_crab_progress;
        if (progress && typeof progress.kind === "string" && onProgress) {
          onProgress({
            kind: progress.kind,
            text: typeof progress.text === "string" ? progress.text : "",
            tool: typeof progress.tool === "string" ? progress.tool : undefined,
            state: typeof progress.state === "string" ? progress.state : undefined,
          });
        }
        // agent-projects/turn-failure-visible: x_crab_error rides the same shape as
        // x_crab_progress — an ordinary chunk with an empty delta plus one extra
        // top-level field. The failure text ALSO arrives as content, so this is
        // additional: it is what tells the view to render an error rather than a
        // reply that will be reconciled away.
        const failure = parsed?.x_crab_error;
        if (failure && typeof failure.message === "string" && onError) {
          onError(failure.message);
        }
        if (parsed?.choices?.[0]?.finish_reason === "stop") completed = true;
        const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        // skip a malformed frame rather than aborting the whole stream
      }
    }
  }

  return { completed };
}

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

/** Wipes all state. Tests only. */
export function __reset() {
  for (const sid of flushTimers.keys()) clearFlushTimer(sid);
  for (const sid of [...revealTimers.keys()]) stopReveal(sid);
  revealPlans.clear();
  turns.clear();
  contexts.clear();
  drainWaiters.clear();
  stopped.clear();
  // A test that let a turn start leaves its conversation in `draining` forever: the
  // turn is suspended on a timer that goes away with the fake clock, so its `finally`
  // never runs. Without this, the next test's `drain` for the same sid returns
  // immediately and the turn silently never starts.
  draining.clear();
  onReplyDone = null;
}

/** Directly seed a conversation's state. Tests only. */
export function __seed(sid: string, state: Partial<TurnState>) {
  patch(sid, state);
}

/**
 * Register the run context a conversation would have captured at submit time.
 * Tests only -- `stopTurn` needs one to know which workspace to address, and a
 * seeded state alone has never been through `enqueue`.
 */
export function __seedContext(sid: string, ctx: RunContext) {
  contexts.set(sid, ctx);
}
