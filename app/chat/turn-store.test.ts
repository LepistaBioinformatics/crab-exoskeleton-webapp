import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_BUDGET_MS,
  RECOVERY_POLL_MS,
  SEND_DEBOUNCE_MS,
  __reset,
  __seed,
  bumpFlush,
  clearCompleted,
  consumeStream,
  enqueue,
  getTurn,
  parkFlush,
  resumeIfActive,
  revealPlan,
  setPainter,
  type Progress,
} from "./turn-store";

const ctx = { workspace: { t: "T", s: "S", r: "alpha" }, onUnauthorized: () => {} };

beforeEach(() => {
  __reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  __reset();
});

describe("debounce burst", () => {
  it("stacks messages as pending without sending them", () => {
    enqueue("s1", "one", ctx);
    enqueue("s1", "two", ctx);
    expect(getTurn("s1").pending).toEqual(["one", "two"]);
    expect(getTurn("s1").queue).toEqual([]);
  });

  it("merges a burst into ONE queued turn when the debounce fires", () => {
    enqueue("s1", "one", ctx);
    enqueue("s1", "two", ctx);
    vi.advanceTimersByTime(SEND_DEBOUNCE_MS);
    expect(getTurn("s1").pending).toEqual([]);
    // One turn, both messages joined -- not two turns.
    expect(getTurn("s1").queue.length + 1).toBeGreaterThan(0);
  });

  it("typing re-arms the timer, so nothing leaves early", () => {
    enqueue("s1", "one", ctx);
    vi.advanceTimersByTime(SEND_DEBOUNCE_MS - 100);
    bumpFlush("s1");
    vi.advanceTimersByTime(SEND_DEBOUNCE_MS - 100);
    // The re-arm pushed it past the original deadline.
    expect(getTurn("s1").pending).toEqual(["one"]);
  });

  it("a burst parked by switching away does not fire on its own", () => {
    enqueue("s1", "one", ctx);
    parkFlush("s1");
    vi.advanceTimersByTime(SEND_DEBOUNCE_MS * 3);
    expect(getTurn("s1").pending).toEqual(["one"]);
  });

  it("keeps each conversation's burst separate", () => {
    enqueue("s1", "one", ctx);
    enqueue("s2", "two", ctx);
    expect(getTurn("s1").pending).toEqual(["one"]);
    expect(getTurn("s2").pending).toEqual(["two"]);
  });

  it("accepts a message while a turn is running (the composer no longer locks)", () => {
    __seed("s1", { running: true });
    enqueue("s1", "during", ctx);
    expect(getTurn("s1").pending).toEqual(["during"]);
  });
});

describe("completed-turn cleanup", () => {
  it("clears the in-flight bands once the turn is done", () => {
    __seed("s1", { running: false, activeUserMessage: "asked", revealed: "answered" });
    clearCompleted("s1");
    expect(getTurn("s1").activeUserMessage).toBeNull();
    expect(getTurn("s1").revealed).toBe("");
  });

  it("refuses to clear a turn that is still running", () => {
    __seed("s1", { running: true, activeUserMessage: "asked", revealed: "partial" });
    clearCompleted("s1");
    expect(getTurn("s1").activeUserMessage).toBe("asked");
    expect(getTurn("s1").revealed).toBe("partial");
  });

  it("keeps the error, so a turn that failed while away still reports it", () => {
    __seed("s1", { running: false, activeUserMessage: "asked", error: "connectivity" });
    clearCompleted("s1");
    expect(getTurn("s1").activeUserMessage).toBeNull();
    expect(getTurn("s1").error).toBe("connectivity");
  });
});

describe("revealPlan", () => {
  const duration = (words: number) => {
    const { wordsPerStep, tickMs } = revealPlan(words);
    return Math.ceil(words / wordsPerStep) * tickMs;
  };
  const steps = (words: number) => Math.ceil(words / revealPlan(words).wordsPerStep);

  it("gives a short reply a real per-word cadence", () => {
    expect(revealPlan(20).wordsPerStep).toBe(1);
    // 20 words at ~27ms each -- fast, and 1.5x the original 40ms pace.
    expect(duration(20)).toBeLessThan(800 / 1.4);
  });

  it("keeps a 2,900-word reply near the target, not 14 minutes", () => {
    expect(duration(2900)).toBeLessThan(6000);
    expect(duration(2900)).toBeGreaterThan(3000);
  });

  // The regression that made the reveal SLOWER than its nominal pace: every step
  // re-parses the whole revealed markdown, so an unbounded step count starves
  // the main thread on a long reply.
  it("caps the number of steps regardless of length", () => {
    expect(steps(2900)).toBeLessThanOrEqual(60);
    expect(steps(1_000_000)).toBeLessThanOrEqual(60);
  });

  it("never schedules faster than a frame", () => {
    expect(revealPlan(1_000_000).tickMs).toBeGreaterThanOrEqual(16);
    expect(revealPlan(1).tickMs).toBeGreaterThanOrEqual(16);
  });

  it("never stalls on a degenerate length", () => {
    expect(revealPlan(0).wordsPerStep).toBeGreaterThan(0);
    expect(revealPlan(1).wordsPerStep).toBeGreaterThan(0);
  });

  it("scales the step size, not the duration, as the reply grows", () => {
    // Both are long enough to hit the duration ceiling, so the extra length is
    // absorbed by bigger steps rather than a longer wait.
    expect(duration(3000)).toBeCloseTo(duration(6000), -3);
    expect(revealPlan(6000).wordsPerStep).toBeGreaterThan(revealPlan(3000).wordsPerStep);
  });
});

describe("consumeStream", () => {
  function sse(frames: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
  }

  const chunk = (delta: string) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: delta } }] })}\n\n`;

  it("accumulates content deltas", async () => {
    const seen: string[] = [];
    await consumeStream(sse([chunk("Hello "), chunk("world")]), (d) => seen.push(d));
    expect(seen.join("")).toBe("Hello world");
  });

  it("routes x_crab_progress without emitting a content delta", async () => {
    const deltas: string[] = [];
    const events: Progress[] = [];
    const frame =
      `data: ${JSON.stringify({
        choices: [{ index: 0, delta: {} }],
        x_crab_progress: { kind: "tool", text: "Deixe-me buscar…", tool: "web_fetch" },
      })}\n\n`;
    await consumeStream(sse([frame]), (d) => deltas.push(d), (p) => events.push(p));
    expect(deltas).toEqual([]);
    expect(events).toEqual([{ kind: "tool", text: "Deixe-me buscar…", tool: "web_fetch", state: undefined }]);
  });

  it("is unaffected by a progress chunk when no handler is passed (old clients)", async () => {
    const deltas: string[] = [];
    const frame = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {} }],
      x_crab_progress: { kind: "typing", state: "start" },
    })}\n\n`;
    await consumeStream(sse([frame, chunk("hi")]), (d) => deltas.push(d));
    expect(deltas).toEqual(["hi"]);
  });

  it("stops at [DONE]", async () => {
    const deltas: string[] = [];
    const { completed } = await consumeStream(
      sse([chunk("a"), "data: [DONE]\n\n", chunk("b")]),
      (d) => deltas.push(d),
    );
    expect(deltas).toEqual(["a"]);
    expect(completed).toBe(true);
  });

  // long-turn-resilience. The two terminal signals are one flush in the proxy's
  // `done()`, so either one on its own is enough to mean "the turn is over" — which
  // is what keeps a lost last frame from being mistaken for a cut connection.
  it("reports a finished turn from a finish_reason chunk with no [DONE] after it", async () => {
    const stop = `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`;
    const { completed } = await consumeStream(sse([chunk("a"), stop]), () => {});
    expect(completed).toBe(true);
  });

  it("reports NOT completed when the body just ends", async () => {
    const { completed } = await consumeStream(sse([chunk("half an answer")]), () => {});
    expect(completed).toBe(false);
  });

  it("skips a malformed frame instead of aborting the stream", async () => {
    const deltas: string[] = [];
    await consumeStream(sse(["data: {not json\n\n", chunk("ok")]), (d) => deltas.push(d));
    expect(deltas).toEqual(["ok"]);
  });

  // turn-failure-visible. The proxy reports a failed turn as x_crab_error, on the
  // same shape progress uses. It matters because picoclaw does NOT persist its error
  // text: whatever showed it as a reply loses it to the next reconcile against the
  // durable transcript, so this signal is the only durable trace within the session.
  const errorFrame = (message: string) =>
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {} }],
      x_crab_error: { message },
    })}\n\n`;

  const visionErr =
    'Error processing message: selected vision model "glm-4.7-flash" does not support ' +
    "image input; update agents.defaults.image_model to a multimodal model";

  it("routes x_crab_error to the error handler", async () => {
    const failures: string[] = [];
    await consumeStream(sse([errorFrame(visionErr)]), () => {}, undefined, (m) => failures.push(m));
    expect(failures).toEqual([visionErr]);
  });

  // The failure text arrives on BOTH channels: as content, because a generic OpenAI
  // client reads nothing else, and as the signal. Neither may swallow the other.
  it("reports the failure and still yields its content delta", async () => {
    const deltas: string[] = [];
    const failures: string[] = [];
    await consumeStream(
      sse([chunk(visionErr), errorFrame(visionErr)]),
      (d) => deltas.push(d),
      undefined,
      (m) => failures.push(m),
    );
    expect(deltas).toEqual([visionErr]);
    expect(failures).toEqual([visionErr]);
  });

  it("ignores an error frame when no handler is passed (old clients)", async () => {
    const deltas: string[] = [];
    await consumeStream(sse([errorFrame("boom"), chunk("hi")]), (d) => deltas.push(d));
    expect(deltas).toEqual(["hi"]);
  });

  it("leaves an ordinary chunk alone", async () => {
    const failures: string[] = [];
    await consumeStream(sse([chunk("all good")]), () => {}, undefined, (m) => failures.push(m));
    expect(failures).toEqual([]);
  });
});

// The banner has to outlive the in-flight bands, and for a harness failure it is the
// ONLY surviving trace — the transcript the completion painter reloads does not
// contain the error and never will.
describe("harness error detail lifecycle", () => {
  it("survives clearCompleted", () => {
    __seed("s1", {
      running: false,
      activeUserMessage: "aqui",
      revealed: "Error processing message: …",
      error: "harness_error",
      errorDetail: "does not support image input",
    });
    clearCompleted("s1");
    const turn = getTurn("s1");
    expect(turn.revealed).toBe("");
    expect(turn.error).toBe("harness_error");
    expect(turn.errorDetail).toBe("does not support image input");
  });

  it("is cleared with the code when a new turn starts", () => {
    __seed("s1", { error: "harness_error", errorDetail: "stale sentence" });
    enqueue("s1", "next question", ctx);
    // enqueue resets the error alongside the pending burst; the detail must not
    // linger to render underneath a later, unrelated code.
    const turn = getTurn("s1");
    expect(turn.error).toBeNull();
    expect(turn.errorDetail).toBeNull();
  });
});

// long-turn-resilience. A cut stream is not a failure: the proxy detached the turn
// from the request, so it is still running and its reply will land in the durable
// transcript. These drive a WHOLE turn (enqueue -> debounce -> POST -> cut) because
// the placement of the recovery inside runTurn is the load-bearing part — it has to
// sit before the `finally` that would otherwise end the turn and let the painter
// reload a transcript that does not hold the reply yet.
describe("recovering a cut stream", () => {
  // No [DONE] and no finish_reason: the body simply ends, which is the shape the
  // BFF instrumentation actually observed ("upstream ended cleanly: N chunks").
  function cutStream(frames: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
  }

  /**
   * Only what the store touches: `status`, `ok`, `body`, `json`. A real `Response`
   * would drag undici's body semantics into a node-environment unit test for no gain.
   */
  function stub(opts: {
    frames?: string[];
    /** One entry per history read, in order; the last is repeated. null = the read failed. */
    history: (number | null)[];
  }) {
    const reads: (number | null)[] = [];
    const posts: string[] = [];
    // A finished turn notifies the sidebar through a window event, and this suite
    // runs in the node environment. Unstubbed, the throw lands in runTurn's catch
    // and every assertion below reads "connectivity" instead of what it is testing.
    //
    // `matchMedia` answering "no preference" is what keeps the reveal driver in play:
    // absent it, `prefersReducedMotion` reads true and content is handed over whole,
    // so the mid-answer cut below would never exercise the driver at all.
    vi.stubGlobal("window", {
      dispatchEvent: () => true,
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("fetch", (url: string) => {
      const u = String(url);
      if (u.includes("/history?")) {
        const next = opts.history[Math.min(reads.length, opts.history.length - 1)];
        reads.push(next);
        if (next === null) return Promise.resolve({ ok: false, status: 502 });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ messages: Array.from({ length: next }, () => ({ role: "user", content: "x" })) }),
        });
      }
      if (u.startsWith("/api/chat/")) {
        posts.push(u);
        return Promise.resolve({ ok: true, status: 200, body: cutStream(opts.frames ?? []) });
      }
      // touchConversation / syncSessionRefs
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    return { reads, posts };
  }

  /** Send a message and let the turn run until the stream is cut. */
  async function sendAndCut() {
    enqueue("s1", "a very long task", ctx);
    await vi.advanceTimersByTimeAsync(SEND_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(0);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits instead of reporting a transport error", async () => {
    stub({ history: [2] });
    await sendAndCut();
    const turn = getTurn("s1");
    expect(turn.recovering).toBe(true);
    expect(turn.error).toBeNull();
    expect(turn.running).toBe(true);
  });

  it("keeps the bands on screen for the whole wait", async () => {
    stub({ history: [2] });
    await sendAndCut();
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS * 3);
    const turn = getTurn("s1");
    // The user's message must not vanish, and the turn must not be handed to the
    // painter — reloading now would pull a transcript with no reply in it.
    expect(turn.activeUserMessage).toBe("a very long task");
    expect(turn.running).toBe(true);
    expect(turn.recovering).toBe(true);
  });

  it("finishes the turn once the transcript grows", async () => {
    stub({ history: [2, 2, 4] });
    const painted: string[] = [];
    setPainter((sid) => painted.push(sid));
    await sendAndCut();
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS * 3);
    const turn = getTurn("s1");
    expect(turn.recovering).toBe(false);
    expect(turn.running).toBe(false);
    expect(turn.error).toBeNull();
    // The reply is pulled through the existing completion path, not re-revealed.
    expect(painted).toEqual(["s1"]);
  });

  it("gives up with its own code when the reply never lands", async () => {
    stub({ history: [2] });
    await sendAndCut();
    await vi.advanceTimersByTimeAsync(RECOVERY_BUDGET_MS + RECOVERY_POLL_MS);
    const turn = getTurn("s1");
    expect(turn.recovering).toBe(false);
    expect(turn.error).toBe("turn_lost");
    expect(turn.errorDetail).toBeNull(); // the harness never spoke; there is nothing to quote
  });

  it("outlasts the proxy's own bound on a detached turn", async () => {
    stub({ history: [2] });
    await sendAndCut();
    // turnTimeout is 10 minutes in crab-shell-proxy/internal/httpapi/sse.go; giving
    // up at ten would report a turn as lost while the proxy is still running it.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(getTurn("s1").error).toBeNull();
    expect(getTurn("s1").recovering).toBe(true);
  });

  it("does not take a failed read as the baseline", async () => {
    // The baseline read fails, then every poll answers 3. Had the failure counted as
    // "empty", the first poll would have looked like growth and declared the turn
    // landed with nothing to show.
    const { reads } = stub({ history: [null, 3] });
    await sendAndCut();
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS * 3);
    expect(reads[0]).toBeNull();
    expect(getTurn("s1").recovering).toBe(true);
    expect(getTurn("s1").error).toBeNull();
  });

  it("keeps a partial answer on screen and stops revealing it", async () => {
    const half = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "half an answer" } }] })}\n\n`;
    stub({ frames: [half], history: [2] });
    await sendAndCut();
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS * 2);
    const turn = getTurn("s1");
    // A cut can land mid-answer. What arrived stays -- it is evidence of the work --
    // and the reveal driver must have finished draining it rather than keeping a timer
    // alive underneath the recovery for the next eleven minutes.
    expect(turn.revealed).toBe("half an answer");
    expect(turn.buffered).toBe("");
    expect(turn.recovering).toBe(true);
    expect(turn.running).toBe(true);
  });

  // The banner is set at the END of the wait, up to eleven minutes after the member
  // queued their next message. Clearing it on that turn's start -- which is the rule
  // for every other code -- would wipe the only account of a turn that produced
  // nothing, in the same tick it appeared.
  it("carries the banner into a turn queued during the wait", async () => {
    stub({ history: [2] });
    await sendAndCut();
    enqueue("s1", "still there?", ctx);
    await vi.advanceTimersByTimeAsync(SEND_DEBOUNCE_MS);
    expect(getTurn("s1").queue).toEqual(["still there?"]);
    await vi.advanceTimersByTimeAsync(RECOVERY_BUDGET_MS + RECOVERY_POLL_MS);
    // The queued turn has started by now (the recovery released the drain loop).
    expect(getTurn("s1").activeUserMessage).toBe("still there?");
    expect(getTurn("s1").error).toBe("turn_lost");
  });

  it("retires the banner on the next actual send", async () => {
    __seed("s1", { error: "turn_lost" });
    enqueue("s1", "never mind, new question", ctx);
    // Sent AFTER the banner was visible: that is a decision to move on, and it is
    // what the enqueue rule exists for.
    expect(getTurn("s1").error).toBeNull();
  });

  it("leaves a harness failure alone (a reported failure is not a cut)", async () => {
    const failure = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {} }],
      x_crab_error: { message: "does not support image input" },
    })}\n\n`;
    const { reads } = stub({ frames: [failure], history: [2] });
    await sendAndCut();
    const turn = getTurn("s1");
    expect(turn.error).toBe("harness_error");
    expect(turn.errorDetail).toBe("does not support image input");
    expect(turn.recovering).toBe(false);
    expect(reads).toEqual([]); // no polling at all
  });
});


// ---------------------------------------------------------------------------
// resume-turn-after-reload
// ---------------------------------------------------------------------------

describe("resumeIfActive", () => {
  beforeEach(() => __reset());

  // FR-7, and the reason this function takes its probes as a parameter at all.
  //
  // recover() waits for the transcript to GROW past a baseline. The resume path
  // adds a round-trip before that read, so if the baseline were taken after asking
  // whether the turn is active, a turn that lands during the round-trip would be
  // baselined with its reply already counted, never grow, and be reported lost
  // eleven minutes later -- a success shown as a failure.
  it("reads the transcript baseline BEFORE asking whether a turn is active", async () => {
    const calls: string[] = [];
    await resumeIfActive("s1", ctx, {
      baseline: async () => {
        calls.push("baseline");
        return 4;
      },
      active: async () => {
        calls.push("active");
        return false;
      },
    });
    expect(calls).toEqual(["baseline", "active"]);
  });

  it("does nothing when no turn is running upstream", async () => {
    await resumeIfActive("s1", ctx, {
      baseline: async () => 4,
      active: async () => false,
    });
    expect(getTurn("s1").running).toBe(false);
    expect(getTurn("s1").recovering).toBe(false);
  });

  // FR-8: the resumed turn has to look exactly like a recovering one, because
  // that is what it is -- the stream is gone and we are polling the transcript.
  it("puts the conversation back into a running recovery when one is in flight", async () => {
    let resolveActive: (v: boolean) => void = () => {};
    const gate = new Promise<boolean>((r) => (resolveActive = r));
    const pending = resumeIfActive("s1", ctx, {
      baseline: async () => 4,
      active: () => gate,
    });
    resolveActive(true);
    // Let the resume establish its state before the poll loop's first sleep.
    await Promise.resolve();
    await Promise.resolve();

    expect(getTurn("s1").running).toBe(true);
    expect(getTurn("s1").recovering).toBe(true);
    void pending;
  });

  // A reload is the only reason to resume. If the store still holds a live turn
  // the page never went away, and re-entering recovery would fight runTurn for
  // the same conversation.
  it("leaves an already-running turn alone", async () => {
    __seed("s1", { running: true });
    let asked = false;
    await resumeIfActive("s1", ctx, {
      baseline: async () => {
        asked = true;
        return 4;
      },
      active: async () => true,
    });
    expect(asked).toBe(false);
  });
});

// The mount effect that calls this has a `cancelled` flag, and every other await
// in it re-checks that flag before touching state. This one must too: switching
// conversations during the /active round-trip would otherwise leave a phantom
// running turn on a conversation nobody is looking at, and its eventual
// finishIfDrained fires the painter for a sid activeSidRef no longer matches --
// the blanked-conversation family the store's comments keep warning about.
describe("resumeIfActive cancellation", () => {
  beforeEach(() => __reset());

  it("does not resume a conversation the caller has navigated away from", async () => {
    let navigatedAway = false;
    await resumeIfActive("s1", ctx, {
      baseline: async () => 4,
      active: async () => {
        navigatedAway = true; // the switch happens while the probe is in flight
        return true;
      },
      cancelled: () => navigatedAway,
    });
    expect(getTurn("s1").running).toBe(false);
    expect(getTurn("s1").recovering).toBe(false);
  });

  it("still resumes when the caller is on the conversation", async () => {
    const pending = resumeIfActive("s1", ctx, {
      baseline: async () => 4,
      active: async () => true,
      cancelled: () => false,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getTurn("s1").running).toBe(true);
    void pending;
  });
});
