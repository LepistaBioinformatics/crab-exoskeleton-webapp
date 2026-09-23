import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      expect(cls).toContain("md:transition-[transform,visibility]");
      expect(
        cls,
        "a display change cannot be transitioned, so the slide would pop",
      ).not.toContain("md:hidden");
    }
  });

  // The slide OUT, which played invisibly for as long as the transition covered
  // `transform` alone: `visibility: hidden` is not gradual, so it landed at t=0 and the
  // 200ms that followed animated an element nobody could see. Transitioning visibility
  // alongside the transform holds it visible for the whole duration on the way out and
  // reveals it immediately on the way in — the asymmetry, in one property name, which is
  // why it is asserted rather than left to the shorthand.
  it("transitions the property that decides whether the slide is visible", () => {
    for (const mode of ["collapsed", "peeking"] as const) {
      expect(
        content({ mode }),
        "transform alone hides the pane before its departure can be seen",
      ).not.toContain("md:transition-transform ");
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


// THE PREVIEW ARRIVES ON A SLIDE AND LEAVES AT ONCE.
//
// The owner asked for the closing animation to go. Opening is a thing the member
// asked for, and the slide says where the panel came from; closing is them moving
// on, and 200ms of a panel sweeping out is 200ms of the page still arguing about
// something already decided.
//
// Pinned from the source, like `pane-ground.test.ts` beside it: a transition class
// is invisible to tsc and to every behavioural test, so nothing else would notice
// it coming back with the next tidy-up of this cva.
describe("the collapsed preview's transition", () => {
  const src = readFileSync(join(__dirname, "resizable-pane.tsx"), "utf8");
  const variant = (name: string) => {
    const m = src.match(new RegExp(`${name}: \`\\$\\{PEEK_BASE\\}([^\`]*)\``));
    if (!m) throw new Error(`no ${name} variant built on PEEK_BASE`);
    return m[1];
  };

  it("is off on the way out", () => {
    expect(variant("collapsed")).toContain("md:transition-none");
  });

  it("is still on on the way in", () => {
    expect(variant("peeking")).not.toContain("transition-none");
    expect(src).toContain("md:transition-[transform,visibility]");
  });

  // visibility must keep landing with the close, transition or not: an off-frame
  // pane that is merely unclickable is still tabbable.
  it("still hides the pane from the tab order", () => {
    expect(variant("collapsed")).toContain("md:invisible");
  });
});
