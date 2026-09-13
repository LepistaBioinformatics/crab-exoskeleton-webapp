import { describe, it, expect } from "vitest";
import { defaultPanelWidth, MIN_WIDTH } from "./workspace-pane";

// A third of the viewport, because what members open the pane FOR — a document, the
// graph, a memory note — is unreadable in a 280px column. Bounded on both sides: never
// below the minimum a file tree needs, never wider than the viewport allows.
//
// These assertions came back with the pane. They were deleted along with the surface
// they covered while the five sections filled the centre instead, and the rule did not
// change in between: a pane the member cannot read in is a pane they will not open.
describe("the pane's default width", () => {
  it("is a third of the viewport", () => {
    expect(defaultPanelWidth(1500)).toBe(500);
  });

  it("never goes below the minimum, however narrow the window", () => {
    expect(defaultPanelWidth(600)).toBe(MIN_WIDTH);
  });

  it("never exceeds what the viewport can show", () => {
    // The ceiling is the viewport minus the handle's reach, which is what keeps the
    // pane's left edge draggable instead of pushed off-screen with the width stuck.
    // A third can only hit it on a window narrow enough that the minimum already
    // applies, so the clamp is asserted through the minimum rather than invented.
    expect(defaultPanelWidth(300)).toBeLessThanOrEqual(300);
  });
});
