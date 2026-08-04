import { describe, it, expect } from "vitest";
import { content } from "./resizable-pane";

// The hover preview of a collapsed pane shipped broken once, and neither the build nor
// any existing test noticed: the peeking element carried `md:hidden` AND `md:block`,
// and because Tailwind emits `.md\:hidden` after `.md\:block` at equal specificity,
// `display: none` won and the preview never rendered. Two utilities of the same
// property on one element is invisible to tsc, so it gets asserted here instead.
describe("pane content modes", () => {
  it("hides a collapsed pane in a way that also takes it out of the tab order", () => {
    const collapsed = content({ mode: "collapsed" });
    // `visibility`, not pointer-events: an off-frame pane that is merely unclickable
    // is still tabbable, and a keyboard user would land inside an invisible sidebar.
    expect(collapsed).toContain("md:invisible");
    expect(collapsed).toContain("md:-translate-x-full");
  });

  it("never hides and reveals at the same time", () => {
    const peeking = content({ mode: "peeking" });
    for (const hiding of ["md:hidden", "md:invisible"]) {
      expect(
        peeking,
        `${hiding} on the peeking element wins over the reveal and the preview disappears`,
      ).not.toContain(hiding);
    }
  });

  it("can animate, which means it must not be display-toggled", () => {
    for (const mode of ["collapsed", "peeking"] as const) {
      const cls = content({ mode });
      expect(cls).toContain("md:transition-transform");
      expect(
        cls,
        "a display change cannot be transitioned, so the slide would pop",
      ).not.toContain("md:hidden");
    }
  });

  it("overlays at the pane's width while peeking, instead of widening the column", () => {
    const peeking = content({ mode: "peeking" });
    expect(peeking).toContain("md:absolute");
    expect(peeking).toContain("md:w-[var(--pane-w)]");
    expect(peeking).toContain("md:translate-x-0");
  });

  // At left-0 the overlay covered the rail, which made the expand button — the control
  // that pins the pane open — unclickable the moment hovering revealed the preview.
  it("starts after the rail so it never covers the expand control", () => {
    for (const mode of ["collapsed", "peeking"] as const) {
      expect(content({ mode })).toContain("md:left-12");
      expect(content({ mode })).not.toContain("md:left-0");
    }
  });

  it("leaves an expanded pane's content in normal flow", () => {
    const expanded = content({ mode: "expanded" });
    expect(expanded).not.toContain("md:absolute");
    expect(expanded).not.toContain("md:invisible");
    expect(expanded).not.toContain("md:hidden");
  });
});

