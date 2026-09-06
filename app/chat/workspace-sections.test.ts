import { describe, it, expect } from "vitest";
import { SECTION_ORDER, asSection, nextSidebarValue } from "./workspace-sections";

// right-rail-discoverability FR-1.2. ONE source of order, shared by the rail, the
// mobile expander and the sidebar's own legacy menu — three renderings of the same
// list is three places that can disagree about what a workspace holds.
describe("the workspace's sections", () => {
  it("lists what the agent knows, then what it does, then what the member manages", () => {
    expect(SECTION_ORDER).toEqual(["memory", "graph", "tasks", "files", "secrets"]);
  });
});

// FR-2.1 / FR-2.2. The rail is the only control that can both open and close the
// sidebar, so the toggle lives beside the list rather than inside the component.
describe("clicking a rail entry", () => {
  it("opens the section that was clicked", () => {
    expect(nextSidebarValue(null, "files")).toBe("files");
  });

  it("closes the sidebar when the open section is clicked again", () => {
    expect(nextSidebarValue("files", "files")).toBeNull();
  });

  it("switches sections without closing", () => {
    expect(nextSidebarValue("files", "memory")).toBe("memory");
  });

  // `rs=menu` is the legacy list pane (FR-5.1): a shared link can still land on it,
  // and from there a click is an open, never a close.
  it("opens from the legacy menu pane", () => {
    expect(nextSidebarValue("menu", "graph")).toBe("graph");
  });
});

// The fragment is user-editable text. `rs=garbage` used to be cast straight to a
// Section and handed to the panel, which indexes SECTIONS by it and calls
// `.label(t)` on the result — a crash from a hand-edited link. The cast is now a
// check, and it lives here because this module owns what a Section is.
describe("reading a section out of the fragment", () => {
  it("accepts every real section", () => {
    for (const key of SECTION_ORDER) expect(asSection(key)).toBe(key);
  });

  it("refuses the legacy menu pane, which is not a section", () => {
    expect(asSection("menu")).toBeNull();
  });

  it("refuses anything else, rather than handing the panel a name it cannot render", () => {
    expect(asSection("garbage")).toBeNull();
    expect(asSection(null)).toBeNull();
    expect(asSection("")).toBeNull();
  });
});
