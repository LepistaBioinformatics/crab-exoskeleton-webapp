// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  readFragmentForTest,
  setDestination,
  setFragmentProject,
  setFragmentSid,
  setRightSidebar,
} from "./fragment";

// chat-shell-redesign: `v` names which screen the centre pane shows INSTEAD of the
// conversation; `rs` names which section is open BESIDE it. Their round trips are
// asserted rather than assumed; readFragmentForTest's comment records why that is not
// paranoia.
//
// The halves of this file assert OPPOSITE rules about `sid` and about `rs`, on purpose
// and in one place: setDestination keeps `sid` (FR-1.6), setFragmentProject drops it
// (FR-9.3), and nothing ever drops `rs`. Read apart they each look arbitrary, and the
// risk is that the wrong one gets applied to the wrong key by someone tidying up.
describe("setDestination", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("writes a destination that reads back", () => {
    setDestination("projects");
    expect(readFragmentForTest().v).toBe("projects");
  });

  it("removes the key when sent back to the conversation", () => {
    setDestination("projects");
    setDestination(null);
    expect(readFragmentForTest().v).toBeUndefined();
  });

  it("preserves everything else on the fragment", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&sid=conv-a&p=proj-x&hv=list&rs=files";
    setDestination("projects");
    const f = readFragmentForTest();
    expect(f.v).toBe("projects");
    expect(f.sid).toBe("conv-a");
    expect(f.p).toBe("proj-x");
    expect(f.t).toBe("tenant-1");
    expect(f.s).toBe("subs-1");
    expect(f.r).toBe("alpha");
    expect(f.hv).toBe("list");
    expect(f.rs).toBe("files");
  });

  it("keeps `sid` so the chat crumb returns to the conversation that was left", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&sid=conv-a";
    setDestination("projects");
    expect(readFragmentForTest().sid).toBe("conv-a");
    setDestination(null);
    expect(readFragmentForTest().sid).toBe("conv-a");
  });

  it("keeps `p` when the projects screen is opened from inside a project", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&sid=conv-a&p=proj-x";
    setDestination("projects");
    const f = readFragmentForTest();
    expect(f.v).toBe("projects");
    expect(f.p).toBe("proj-x");
  });
});

// `rs` shipped written but unparsed once: it was added to FragmentState and to the
// setter, but not to readFragment's explicit key list. Every field there is optional, so
// TypeScript had nothing to complain about — the URL updated and the pane never opened.
// A setter whose value nothing can read is not half a feature, it is none of it.
describe("setRightSidebar", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("writes a section that reads back", () => {
    for (const section of ["memory", "graph", "tasks", "files", "secrets"]) {
      setRightSidebar(section);
      expect(readFragmentForTest().rs).toBe(section);
    }
  });

  it("closes by REMOVING the key, so a shared link carries no pane", () => {
    setRightSidebar("graph");
    setRightSidebar(null);
    expect(readFragmentForTest().rs).toBeUndefined();
    expect(window.location.hash).not.toContain("rs");
  });

  it("replaces rather than appends when the section changes", () => {
    setRightSidebar("graph");
    setRightSidebar("memory");
    expect(new URLSearchParams(window.location.hash.slice(1)).getAll("rs")).toEqual(["memory"]);
  });

  // Opening a pane must not navigate. t/s/r/sid are the workspace and the conversation,
  // and `v` is the screen the member chose to be on — clobbering any of them would move
  // the member somewhere else as a side effect of opening a panel.
  it("leaves every other key alone, `v` included", () => {
    window.location.hash = "t=acme&s=growth&r=alpha&sid=abc&hv=list&p=proj-x&v=projects";
    setRightSidebar("tasks");
    const f = readFragmentForTest();
    expect([f.t, f.s, f.r, f.sid, f.hv, f.p, f.v]).toEqual([
      "acme",
      "growth",
      "alpha",
      "abc",
      "list",
      "proj-x",
      "projects",
    ]);
    expect(f.rs).toBe("tasks");
  });
});

// The contrast, asserted here rather than only in fragment-workspace-project.test.ts:
// entering a project changes WHICH WORKSPACE DIRECTORY a conversation lives in, so the
// open `sid` would name a transcript the project's workspace never held.
describe("setFragmentProject still drops `sid` and `msg`", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("drops them when entering a project", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&sid=conv-a&msg=2024-01-01";
    setFragmentProject("proj-x");
    const f = readFragmentForTest();
    expect(f.p).toBe("proj-x");
    expect(f.sid).toBeUndefined();
    expect(f.msg).toBeUndefined();
    expect(f.t).toBe("tenant-1");
  });

  it("drops them when leaving a project", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&sid=conv-a&msg=2024-01-01&p=proj-x";
    setFragmentProject(null);
    const f = readFragmentForTest();
    expect(f.p).toBeUndefined();
    expect(f.sid).toBeUndefined();
    expect(f.msg).toBeUndefined();
  });
});

// THE PAIR THAT THE TWO KEYS EXIST FOR, and the two navigation holes the owner hit.
//
// Both setters drop `v` because both are ways of ASKING FOR THE CENTRE PANE: entering a
// project is done from the projects screen, and choosing a conversation is asking for
// its transcript. A `v` left standing answered either click by re-rendering the list the
// member had just chosen from.
//
// Neither touches `rs`, because a pane is not somewhere you are. That is the coexistence
// the owner asked for in so many words: the chat has to be readable beside the files,
// the graph and the tasks.
describe("`v` is dropped by the two setters that ask for the centre, `rs` by neither", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("entering a project lands IN the project, not back on the list", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&v=projects&rs=files&sid=conv-a";
    setFragmentProject("proj-x");
    const f = readFragmentForTest();
    expect(f.v).toBeUndefined();
    expect(f.p).toBe("proj-x");
    expect(f.rs).toBe("files");
    expect(f.sid).toBeUndefined();
  });

  it("opening a conversation lands IN the transcript, with the pane still beside it", () => {
    window.location.hash = "t=tenant-1&s=subs-1&r=alpha&v=projects&rs=files";
    setFragmentSid("conv-b");
    const f = readFragmentForTest();
    expect(f.v).toBeUndefined();
    expect(f.sid).toBe("conv-b");
    expect(f.rs).toBe("files");
  });
});
