// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readFragmentForTest, setRightSidebar } from "./fragment";

// The right sidebar moved from `localStorage["chat-files-open"]` into the URL, and the
// move was a REPLACEMENT: keeping both would have left two owners of one piece of state,
// disagreeing the moment a second tab was opened.
//
// One key covers what used to be two states — a boolean for open/closed plus a section
// that persisted nowhere, which is why every refresh landed on the section list.
//
// jsdom, because this reads and assigns `window.location.hash`. `fragment.ts` had no
// suite at all before this, so `setHistoryView` and `setView` remain uncovered.
// The round trip, and the reason it is FIRST.
//
// This suite originally tested only the write, and the feature shipped broken: `rs` was
// added to the FragmentState interface and to the setter, but not to readFragment's
// explicit key list. Every field there is optional, so TypeScript had nothing to
// complain about — the URL updated and the sidebar never opened.
//
// A setter whose value nothing can read is not half a feature, it is none of it.
describe("rs survives the trip back", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("is parsed back out of the hash", () => {
    for (const section of ["menu", "graph", "memory", "tasks", "files"]) {
      setRightSidebar(section);
      expect(readFragmentForTest().rs).toBe(section);
    }
  });

  it("reads as absent once closed", () => {
    setRightSidebar("graph");
    setRightSidebar(null);
    expect(readFragmentForTest().rs).toBeUndefined();
  });
});

describe("setRightSidebar", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("writes the open section", () => {
    setRightSidebar("graph");
    expect(new URLSearchParams(window.location.hash.slice(1)).get("rs")).toBe("graph");
  });

  it("records the section list as its own state, not as closed", () => {
    // Open-on-the-menu and closed are different things, and one key has to tell them
    // apart or reopening would always jump straight into the last section.
    setRightSidebar("menu");
    expect(new URLSearchParams(window.location.hash.slice(1)).get("rs")).toBe("menu");
  });

  it("closes by REMOVING the key, so a shared link carries no sidebar", () => {
    setRightSidebar("files");
    setRightSidebar(null);
    expect(window.location.hash).not.toContain("rs");
  });

  it("leaves the other fragment keys alone", () => {
    // t/s/r/sid are the workspace and the conversation. Clobbering them would navigate
    // the member somewhere else as a side effect of opening a panel.
    window.location.hash = "t=acme&s=growth&r=alpha&sid=abc&hv=list";
    setRightSidebar("tasks");
    const p = new URLSearchParams(window.location.hash.slice(1));
    expect([p.get("t"), p.get("s"), p.get("r"), p.get("sid"), p.get("hv")]).toEqual([
      "acme",
      "growth",
      "alpha",
      "abc",
      "list",
    ]);
    expect(p.get("rs")).toBe("tasks");
  });

  it("replaces rather than appends when the section changes", () => {
    setRightSidebar("graph");
    setRightSidebar("memory");
    expect(new URLSearchParams(window.location.hash.slice(1)).getAll("rs")).toEqual(["memory"]);
  });
});
