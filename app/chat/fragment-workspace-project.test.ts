// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readFragmentForTest, setWorkspace } from "./fragment";

// background-turn-dock: a docked chip may be a PROJECT conversation in a workspace the
// shell is not currently on, and clicking it has to land workspace + project + sid in ONE
// hash write. Two writes — setWorkspace then setFragmentProjectSid — produce an
// intermediate state pointing at the right workspace with no project, and every
// per-project fetch on that frame addresses the agent root instead.
//
// The existing `params.delete("p")` is not a bug being fixed here: a project belongs to
// one agent, so carrying it across workspaces would name a directory nobody created. It
// stays as the default, and the third argument is the deliberate opt-in.
describe("setWorkspace carries a project when given one", () => {
  const ws = { t: "tenant-1", s: "subs-1", r: "alpha" as const };

  beforeEach(() => {
    window.location.hash = "";
  });

  it("drops `p` when no project is passed", () => {
    window.location.hash = "p=stale-project";
    setWorkspace(ws, "conv-a");
    const f = readFragmentForTest();
    expect(f.p).toBeUndefined();
    expect(f.sid).toBe("conv-a");
    expect(f.t).toBe("tenant-1");
  });

  it("drops `p` when the project is explicitly null", () => {
    window.location.hash = "p=stale-project";
    setWorkspace(ws, "conv-a", null);
    expect(readFragmentForTest().p).toBeUndefined();
  });

  it("lands workspace, project and sid in one write", () => {
    setWorkspace(ws, "conv-a", "proj-x");
    const f = readFragmentForTest();
    expect(f.p).toBe("proj-x");
    expect(f.sid).toBe("conv-a");
    expect(f.t).toBe("tenant-1");
    expect(f.s).toBe("subs-1");
    expect(f.r).toBe("alpha");
  });
});
