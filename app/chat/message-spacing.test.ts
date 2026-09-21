import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// EVERY MESSAGE IS SPACED THE SAME, whoever said it.
//
// The bug this pins was not a role variant -- both roles read the same helper,
// which is why it survived review. It was POSITIONAL: padding depended on
// whether a message had a same-role neighbour, and an agent turn is
// `user message -> steps -> answer` with `rowRole` mapping a steps row to the
// assistant. So the answer always had a neighbour and the question never did,
// and the member saw py-10 over their own message and py-6 over the reply, on
// every turn where the agent narrated anything.
//
// Asserted against the SOURCE for the reason `pane-weight.test.ts` records: two
// utilities of the same property on one element are invisible to tsc and to
// every behavioural test.
const src = readFileSync(new URL("./chat-view.tsx", import.meta.url), "utf8");

/** Vertical padding utilities, including the arbitrary-value form. */
const VERTICAL_PAD = /\b(py|pt|pb)-(\[[^\]]+\]|[\w.]+)/g;

const band = src.slice(src.indexOf("const messageBand = cva("), src.indexOf("const bandGap"));

describe("the message band", () => {
  it("declares its vertical padding exactly once, on the base", () => {
    const base = band.slice(band.indexOf("cva("), band.indexOf("variants:"));
    expect(base.match(VERTICAL_PAD) ?? []).toHaveLength(1);
  });

  // A role variant would be the obvious way to reintroduce the difference, and
  // the only one a reader would spot.
  it("puts no vertical padding in a role variant", () => {
    const variants = band.slice(band.indexOf("variants:"));
    expect(variants.match(VERTICAL_PAD) ?? []).toEqual([]);
  });

  // And the way it ACTUALLY got in: appended at the call site, per message,
  // from a positional flag. Every band composes the same class string now.
  it("has no call site that adds padding of its own", () => {
    const uses = src.split("\n").filter((line) => line.includes("messageBand("));
    expect(uses.length, "no message bands found -- the anchor moved").toBeGreaterThan(3);
    for (const line of uses) {
      expect(line.match(VERTICAL_PAD) ?? [], line.trim()).toEqual([]);
    }
  });

  // The spacing between two messages is the sum of two bands' padding, so it is
  // the same pair of numbers everywhere or it is nothing.
  it("keeps the padding symmetric, so a message sits the same distance from each neighbour", () => {
    const base = band.slice(band.indexOf("cva("), band.indexOf("variants:"));
    const [pad] = base.match(VERTICAL_PAD) ?? [];
    expect(pad, "padding must be py-*, not a pt-/pb- pair").toMatch(/^py-/);
  });
});
