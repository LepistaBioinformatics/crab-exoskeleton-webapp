import { describe, it, expect } from "vitest";
import { CLAMP_LIMIT, clampText } from "./clamp-text";

const long = (n: number) => "palavra ".repeat(Math.ceil(n / 8)).slice(0, n);

describe("clampText", () => {
  it("leaves a short line alone and offers no toggle", () => {
    expect(clampText("uma tarefa curta")).toEqual({
      head: "uma tarefa curta",
      truncated: false,
    });
  });

  // The toggle exists exactly when something is hidden. That is the property the
  // character count buys over CSS line-clamp, which cannot know.
  it("reports truncation only when it actually cut something", () => {
    expect(clampText(long(CLAMP_LIMIT)).truncated).toBe(false);
    expect(clampText(long(CLAMP_LIMIT + 50)).truncated).toBe(true);
  });

  it("cuts at a word boundary rather than mid-word", () => {
    const out = clampText(long(400));
    expect(out.head.endsWith(" ")).toBe(false);
    expect(out.head).not.toMatch(/palav$|palavr$/);
  });

  // One long unbroken token is the case that overflows a sidebar, so it is cut
  // at the limit rather than spared for lack of a space.
  it("cuts an unbroken token at the limit", () => {
    const out = clampText("x".repeat(400));
    expect(out.head).toHaveLength(CLAMP_LIMIT);
    expect(out.truncated).toBe(true);
  });

  // A boundary early in the budget would throw most of it away, which reads as
  // a bug rather than as tidiness.
  it("ignores a word boundary that would waste the budget", () => {
    const out = clampText("ab " + "x".repeat(400));
    expect(out.head.length).toBeGreaterThan(CLAMP_LIMIT * 0.6);
  });

  it("trims before measuring, so whitespace does not trip the cut", () => {
    expect(clampText("   curta   ")).toEqual({ head: "curta", truncated: false });
  });
});
