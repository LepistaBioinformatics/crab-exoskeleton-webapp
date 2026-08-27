// @vitest-environment jsdom
//
// turn-stream-continuity Group D, design test 17.
//
// jsdom rather than the suite's default node environment, and that is the whole
// point of a separate file: the `online` / `visibilitychange` listeners are
// registered at MODULE SCOPE, guarded on `typeof window !== "undefined"`. Under
// `environment: "node"` that guard is false at import time, so the wiring this file
// tests would never exist — and `vi.stubGlobal("window", …)` cannot help, because it
// runs long after the import.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_POLL_MS, SEND_DEBOUNCE_MS, __reset, enqueue, getTurn } from "./turn-store";

const ctx = { workspace: { t: "T", s: "S", r: "alpha" }, onUnauthorized: () => {} };

/** A stream that just ends: no [DONE], no finish_reason — the observed shape of a cut. */
function cutStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

/** Counts history reads, which is how a poll makes itself observable. */
function stubFetch() {
  const reads: number[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    const u = String(url);
    if (u.includes("/history?")) {
      reads.push(Date.now());
      return Promise.resolve({
        ok: true,
        status: 200,
        // Never grows: the recovery must keep polling for the whole test.
        json: async () => ({ messages: [{ role: "user", content: "x" }, { role: "user", content: "x" }] }),
      });
    }
    if (u.startsWith("/api/chat/")) {
      return Promise.resolve({ ok: true, status: 200, body: cutStream() });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  return reads;
}

async function sendAndCut() {
  enqueue("s1", "a very long task", ctx);
  await vi.advanceTimersByTimeAsync(SEND_DEBOUNCE_MS);
  await vi.advanceTimersByTimeAsync(0);
}

describe("waking a recovery when the network comes back", () => {
  beforeEach(() => {
    __reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // FR-20. Without this the member waits up to a whole RECOVERY_POLL_MS past the
  // moment they were reachable again — the poll is blind, and the interval was sized
  // for a quiet background wait, not for the instant someone leaves a tunnel.
  it("takes the next sample immediately on `online`, without waiting out the interval", async () => {
    const reads = stubFetch();
    await sendAndCut();
    expect(getTurn("s1").recovering).toBe(true);

    // The baseline read has happened; the loop is now parked on its first sleep.
    const baseline = reads.length;

    // Nowhere near the poll interval: on a blind timer nothing may happen here.
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS / 5);
    expect(reads.length).toBe(baseline);

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(reads.length).toBeGreaterThan(baseline);
  });

  // FR-21. Mobile browsers throttle timers in a backgrounded tab, so the sample a
  // member returns to can be minutes stale even though the poll "ran".
  it("also takes one when a backgrounded tab becomes visible", async () => {
    const reads = stubFetch();
    await sendAndCut();
    const baseline = reads.length;

    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS / 5);
    expect(reads.length).toBe(baseline);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(reads.length).toBeGreaterThan(baseline);
  });

  // The wake must not become a way to poll forever: the budget is wall-clock, so
  // waking early samples SOONER and never extends the wait. A wake that reset the
  // deadline would turn a flaky connection into an eleven-minute wait per flap.
  it("does not extend the wait when it fires repeatedly", async () => {
    stubFetch();
    await sendAndCut();

    const before = getTurn("s1").recoveringSince;
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(getTurn("s1").recoveringSince).toBe(before);
    expect(getTurn("s1").recovering).toBe(true);
  });
});
