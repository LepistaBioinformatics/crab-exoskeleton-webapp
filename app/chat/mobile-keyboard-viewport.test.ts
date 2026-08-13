import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// On mobile, opening the soft keyboard pushed the top bar off the screen, reachable only
// by scrolling back to it.
//
// The cause is two defaults meeting. `100vh` is the LARGE viewport — it ignores both the
// retractable browser UI and the keyboard — so the shell's column stayed taller than the
// screen. And the default `interactive-widget=resizes-visual` leaves the layout viewport
// at full height and merely SCROLLS it to keep the focused input visible. The shell has
// `overflow-hidden` and no scroll of its own, so it could not compensate; `position:
// sticky` could not either, since sticky tracks a scroll CONTAINER and the thing moving
// here is the viewport.
//
// NEITHER HALF WORKS ALONE, which is why they are asserted together: `h-dvh` with the
// default widget behaviour still measures a viewport the keyboard did not shrink, and
// `resizes-content` with `h-screen` still pins the column to the large viewport. Reverting
// either one silently restores the bug.
describe("mobile keyboard does not push the top bar away", () => {
  // Source, not an import: app/layout.tsx pulls in next/font, which does not load under
  // the test runner. The value is a static literal in a `viewport` export, so reading it
  // is exact rather than approximate.
  it("asks the keyboard to resize the layout viewport", () => {
    const src = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("export const viewport"));
    expect(block).toContain('interactiveWidget: "resizes-content"');
  });

  it("sizes the shell to the DYNAMIC viewport", () => {
    // Source, not a render: chat-shell pulls in the whole panel tree and this assertion is
    // about one class on its outermost element.
    const src = readFileSync(new URL("./chat-shell.tsx", import.meta.url), "utf8");
    const shellRoot = src.slice(src.indexOf("flex-col overflow-hidden") - 60, src.indexOf("flex-col overflow-hidden"));
    expect(shellRoot).toContain("h-dvh");
    expect(shellRoot).not.toContain("h-screen");
  });
});
