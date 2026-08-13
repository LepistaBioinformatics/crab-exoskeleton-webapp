import { describe, it, expect } from "vitest";
import { progressLine, stalledPulse } from "./turn-progress";

// A narrated progress line has no self-refreshing signal: it is painted once and
// then sits there for as long as the agent stays inside one tool call. The
// "waiting" line is different -- it swaps its own text at SILENCE_GRACE_MS
// (thinking -> working), which is already a visible change.
//
// So the pulse is for the lines that would otherwise freeze, and only once they
// actually have. These tests pin that rule; the wiring that decides WHEN `silent`
// flips lives in a useEffect, and this suite runs environment: "node", where
// effects never fire (see empty-states.test.tsx). That half is verified in the
// running app, not here.
describe("stalledPulse", () => {
  it("pulses a tool narration that has gone quiet", () => {
    expect(stalledPulse("tool", true)).toBe(true);
  });

  it("pulses a thought that has gone quiet", () => {
    expect(stalledPulse("thought", true)).toBe(true);
  });

  it("leaves the waiting line alone -- it already swapped its own text", () => {
    expect(stalledPulse("waiting", true)).toBe(false);
  });

  it("does not pulse while events are still arriving", () => {
    for (const kind of ["tool", "thought", "waiting"] as const) {
      expect(stalledPulse(kind, false)).toBe(false);
    }
  });
});

describe("progressLine", () => {
  it("carries the pulse class only when stalled", () => {
    const stalled = progressLine({ kind: "tool", stalled: true });
    const live = progressLine({ kind: "tool", stalled: false });

    expect(stalled).toContain("progress-stalled");
    expect(live).not.toContain("progress-stalled");
  });

  it("keeps the kind styling independent of the pulse", () => {
    // The pulse must not replace what the line already says about itself: a
    // stalled thought is still italic and still the quieter of the two.
    expect(progressLine({ kind: "thought", stalled: true })).toContain("italic");
  });
});
