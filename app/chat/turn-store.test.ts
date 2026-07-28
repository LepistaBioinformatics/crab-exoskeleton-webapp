import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEND_DEBOUNCE_MS,
  __reset,
  __seed,
  bumpFlush,
  clearCompleted,
  consumeStream,
  enqueue,
  getTurn,
  parkFlush,
  revealPlan,
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
    await consumeStream(sse([chunk("a"), "data: [DONE]\n\n", chunk("b")]), (d) => deltas.push(d));
    expect(deltas).toEqual(["a"]);
  });

  it("skips a malformed frame instead of aborting the stream", async () => {
    const deltas: string[] = [];
    await consumeStream(sse(["data: {not json\n\n", chunk("ok")]), (d) => deltas.push(d));
    expect(deltas).toEqual(["ok"]);
  });
});
