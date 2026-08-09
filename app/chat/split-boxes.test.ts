import { describe, it, expect } from "vitest";
import { splitBoxStyles } from "./split-boxes";

const open = { splittable: false, projectsShare: 0.4, projectsOpen: true, chatsOpen: true };

describe("splitBoxStyles", () => {
  it("splits by share while both boxes are open and draggable", () => {
    const s = splitBoxStyles({ ...open, splittable: true });
    expect(s.projects).toEqual({ flexGrow: 0.4, flexShrink: 1, flexBasis: 0 });
    expect(s.chats.flexGrow).toBeCloseTo(0.6);
  });

  // THE BUG. A collapsed box must not shrink: with `flex-shrink: 1` and a long
  // conversation list beside it, it was squeezed below its own header height and
  // the header overflowed under the box laid out after it — read on screen as the
  // conversations group sitting on top of the word "Projects".
  it("never lets a collapsed box shrink", () => {
    const collapsed = splitBoxStyles({ ...open, projectsOpen: false });
    expect(collapsed.projects).toEqual({ flex: "none" });
    // And the open one takes everything that is left.
    expect(collapsed.chats).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
  });

  it("mirrors the rule when it is the chats that are collapsed", () => {
    const collapsed = splitBoxStyles({ ...open, chatsOpen: false });
    expect(collapsed.chats).toEqual({ flex: "none" });
    expect(collapsed.projects).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
  });

  it("grows neither box when both are collapsed", () => {
    const both = splitBoxStyles({ ...open, projectsOpen: false, chatsOpen: false });
    expect(both.projects).toEqual({ flex: "none" });
    expect(both.chats).toEqual({ flex: "none" });
  });

  // Inside a project the projects box is a fixed context header (it does not
  // fold), so `splittable` is false while both boxes report open. The chats list
  // is the only list on screen and has to take the height.
  it("gives the height to the chats inside a project, where the seam is gone", () => {
    const inside = splitBoxStyles({ ...open, splittable: false });
    expect(inside.projects).toEqual({ flex: "none" });
    expect(inside.chats).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
  });

  // Exactly one box may grow, in every combination. That invariant is what keeps
  // the two from competing for the same pixels.
  it("never lets both boxes grow at once", () => {
    for (const projectsOpen of [true, false]) {
      for (const chatsOpen of [true, false]) {
        const s = splitBoxStyles({ ...open, splittable: false, projectsOpen, chatsOpen });
        // flexGrow is typed as string | number by CSSProperties, so it is
        // normalised before comparing rather than compared as whatever came out.
        const growing = [s.projects, s.chats].filter((b) => Number(b.flexGrow ?? 0) > 0);
        expect(growing.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
