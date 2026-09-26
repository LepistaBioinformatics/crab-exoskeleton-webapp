import { describe, it, expect } from "vitest";
import { SECTION_ORDER, asSection, nextSidebarValue } from "./workspace-sections";

// right-rail-discoverability FR-1.2. ONE source of order, and it outlived the three
// surfaces it was written for: the sidebar's section rows, the collapsed rail and the
// pane's own heading all read it now. Several renderings of the same list is several
// places that can disagree about what a workspace holds.
describe("the workspace's sections", () => {
  // The one section that is not this workspace's at all -- shared memory spans
  // subscriptions and tenants -- used to sit last for that reason. It leads now,
  // because it became a tool opened beside a live conversation and reach is what
  // that move was for. Position never carried the scope; the source says so.
  it("leads with the mangrove, then what the agent knows, does and the member manages", () => {
    expect(SECTION_ORDER).toEqual([
      // FIRST, and this is the assertion that would catch it silently drifting back.
      // The mangrove stopped being a screen and became a tool in this pane; leading
      // the list is what that move was for. The source records why the old
      // "odd one out goes last" argument no longer applies.
      "mangrove",
      "memory",
      "graph",
      "tasks",
      "files",
      "secrets",
      // SKILLS JOINED THE THIRD RUN, not the end. It is one more thing the member
      // manages about this workspace, so it sits with secrets and files.
      "skills",
    ]);
  });
});

// The sidebar row and the collapsed rail are the only controls that can both open and
// close the pane, so the toggle lives beside the list rather than inside either of them.
describe("clicking a section row", () => {
  it("opens the section that was clicked", () => {
    expect(nextSidebarValue(null, "files")).toBe("files");
  });

  it("closes the pane when the open section is clicked again", () => {
    expect(nextSidebarValue("files", "files")).toBeNull();
  });

  it("switches sections without closing", () => {
    expect(nextSidebarValue("files", "memory")).toBe("memory");
  });

  // The raw fragment value reaches here, so it can be a stale link's `rs=menu` — the
  // list pane this shell no longer has. From there a click is an open, never a close.
  it("opens from a value that names no section at all", () => {
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

  it("refuses the list pane this shell no longer has", () => {
    expect(asSection("menu")).toBeNull();
  });

  it("refuses anything else, rather than handing the panel a name it cannot render", () => {
    expect(asSection("garbage")).toBeNull();
    expect(asSection(null)).toBeNull();
    expect(asSection("")).toBeNull();
  });
});
