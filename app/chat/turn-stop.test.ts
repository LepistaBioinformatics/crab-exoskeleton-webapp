import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __reset, __seed, __seedContext, getTurn, stopTurn, wasStopped } from "./turn-store";

// stop-generation. Stopping is not a UI gesture: picoclaw's abort cancels the
// turn and rolls session history back to before it, which DELETES the member's
// own message. So the two things this has to get right are the request (it must
// carry the scope the turn ran under, or it stops nothing while reporting
// success) and what happens to the text that will never be answered.

const workspace = { t: "T", s: "S", r: "alpha" } as const;
const ctx = { workspace, onUnauthorized: () => {} };

/** A conversation mid-turn, with a message in flight and more behind it. */
function seedRunning(sid: string, extra: Record<string, unknown> = {}) {
  __seedContext(sid, ctx);
  __seed(sid, {
    running: true,
    activeUserMessage: "the long one",
    queue: ["queued"],
    pending: ["still typing"],
    buffered: "half an answer",
    revealed: "half",
    ...extra,
  });
}

/** Captures the cancel request and answers it. */
function stubFetch(response: { ok: boolean; status: number }) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve({ ok: response.ok, status: response.status } as Response);
  });
  return calls;
}

beforeEach(() => __reset());

afterEach(() => {
  vi.unstubAllGlobals();
  __reset();
});

describe("stopTurn", () => {
  it("asks the conversation's own agent to stop, carrying the turn's scope", async () => {
    seedRunning("s1");
    const calls = stubFetch({ ok: true, status: 204 });

    await stopTurn("s1");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/chat/alpha/cancel");
    expect(calls[0].body).toEqual({ session_id: "s1", tenant_id: "T", subs_acc_id: "S" });
  });

  // The recurring defect in this repo: `project` dropped in one layer. Without it
  // the proxy resolves the MAIN agent's session, aborts nothing, and still
  // answers 204 -- a Stop button that does nothing, with no error anywhere.
  it("carries the project, so the stop reaches the agent the turn ran on", async () => {
    __seedContext("s1", { ...ctx, project: "p1" });
    __seed("s1", { running: true, activeUserMessage: "hi" });
    const calls = stubFetch({ ok: true, status: 204 });

    await stopTurn("s1");

    expect(calls[0].body.project).toBe("p1");
  });

  it("gives back everything that will never be answered", async () => {
    seedRunning("s1");
    stubFetch({ ok: true, status: 204 });

    // The message in flight first -- picoclaw deleted it -- then what was behind
    // it, which this stop discards.
    expect(await stopTurn("s1")).toBe("the long one\n\nqueued\n\nstill typing");
  });

  it("clears the turn once the abort is acknowledged", async () => {
    seedRunning("s1");
    stubFetch({ ok: true, status: 204 });

    await stopTurn("s1");

    const turn = getTurn("s1");
    expect(turn.running).toBe(false);
    expect(turn.stopping).toBe(false);
    expect(turn.activeUserMessage).toBeNull();
    expect(turn.queue).toEqual([]);
    expect(turn.pending).toEqual([]);
    // The half-arrived reply goes with the turn: the transcript no longer holds it.
    expect(turn.buffered).toBe("");
    expect(turn.revealed).toBe("");
    // Stopping on purpose is not a failure.
    expect(turn.error).toBeNull();
  });

  it("marks the turn stopped, so the rest of its stream is ignored", async () => {
    seedRunning("s1");
    stubFetch({ ok: true, status: 204 });

    expect(wasStopped("s1")).toBe(false);
    await stopTurn("s1");
    // picoclaw answers the /stop with "Task stopped. ..." on the turn's OWN
    // stream. Rendering it would put a sentence in the conversation that the next
    // history reload cannot produce.
    expect(wasStopped("s1")).toBe(true);
  });

  // The important half of the failure case: a stop that did not land must leave
  // the turn alone. Clearing the bands would hide a turn that is still running
  // and still writing to the transcript.
  it("keeps the turn when the stop never reached the agent", async () => {
    seedRunning("s1");
    stubFetch({ ok: false, status: 502 });

    expect(await stopTurn("s1")).toBeNull();

    const turn = getTurn("s1");
    expect(turn.running).toBe(true);
    expect(turn.stopping).toBe(false);
    expect(turn.activeUserMessage).toBe("the long one");
    expect(turn.error).toBe("stop_failed");
    expect(wasStopped("s1")).toBe(false);
  });

  // The race the proxy answers 204 to: the turn finished while the member was
  // clicking. Indistinguishable from a real abort in the response, so it has to
  // be caught HERE, on the state.
  //
  // Treating it as a stop wedges the conversation: `runTurn`'s finally has
  // already run and it is the only thing that clears the stopped flag, so the
  // flag would survive into the NEXT turn, gate its entire stream to nothing, and
  // leave `running` stuck true with every later turn parked behind it.
  it("does not claim a stop when the turn landed while the request was in flight", async () => {
    seedRunning("s1");
    vi.stubGlobal("fetch", () => {
      __seed("s1", { running: false });
      return Promise.resolve({ ok: true, status: 204 } as Response);
    });

    // Nothing was rolled back, so there is nothing to give back either: the
    // message was answered, and restoring it would offer to send it twice.
    expect(await stopTurn("s1")).toBeNull();
    expect(wasStopped("s1")).toBe(false);
    expect(getTurn("s1").stopping).toBe(false);
  });

  it("does nothing when no turn is running", async () => {
    __seedContext("s1", ctx);
    __seed("s1", { running: false });
    const calls = stubFetch({ ok: true, status: 204 });

    expect(await stopTurn("s1")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("does not send a second stop while the first is in flight", async () => {
    seedRunning("s1");
    const calls = stubFetch({ ok: true, status: 204 });

    const first = stopTurn("s1");
    // `stopping` is set synchronously, before the request is awaited, so a second
    // press lands here rather than sending again.
    expect(getTurn("s1").stopping).toBe(true);
    expect(await stopTurn("s1")).toBeNull();
    await first;

    expect(calls).toHaveLength(1);
  });

  it("routes a 401 to re-signin rather than reporting a stop failure", async () => {
    let signin = 0;
    __seedContext("s1", { workspace, onUnauthorized: () => signin++ });
    __seed("s1", { running: true, activeUserMessage: "hi" });
    stubFetch({ ok: false, status: 401 });

    expect(await stopTurn("s1")).toBeNull();
    expect(signin).toBe(1);
    expect(getTurn("s1").error).toBeNull();
  });
});
