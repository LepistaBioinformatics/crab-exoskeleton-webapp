// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { enterWorkspace, readFragmentForTest } from "./fragment";

// ARRIVING IN A WORKSPACE, which is not the same act as going to a conversation in one.
//
// Both doors use this: the picker's click, and the lone-workspace shortcut that skips
// the picker. They used to disagree -- the picker called `createConversation` first and
// wrote the new id, which predates shell-path-and-landing FR-3.5 ("No conversation is
// created until the member sends") and was never brought in line. What the fragment does
// NOT carry afterwards is the whole contract, so it is pinned key by key.
describe("entering a workspace", () => {
  const ws = { t: "tenant-1", s: "subs-1", r: "alpha" as const };

  beforeEach(() => {
    window.location.hash = "";
  });

  it("names the workspace", () => {
    enterWorkspace(ws);
    expect(readFragmentForTest()).toMatchObject({ t: "tenant-1", s: "subs-1", r: "alpha" });
  });

  // NO `sid`, and this is the assertion the mint regression would trip. `resolveCentre`
  // answers an absent sid with the landing, whose composer is the one place a
  // conversation is created.
  it("names no conversation, so the centre lands on the landing", () => {
    window.location.hash = "sid=old-conversation";
    enterWorkspace(ws);
    expect(readFragmentForTest().sid).toBeUndefined();
  });

  // Both are qualified by the workspace being left: a project belongs to one agent, and
  // a destination names a surface scoped to both. Either one surviving would name
  // something that does not exist in the workspace just entered.
  it("drops a project and a destination from wherever the member was", () => {
    window.location.hash = "p=legal&v=projects";
    enterWorkspace(ws);
    const fragment = readFragmentForTest();
    expect(fragment.p, "a project from another agent").toBeUndefined();
    expect(fragment.v, "a destination scoped to another workspace").toBeUndefined();
  });

  it("drops the transient scroll anchor", () => {
    window.location.hash = "msg=turn-9";
    enterWorkspace(ws);
    expect(readFragmentForTest().msg).toBeUndefined();
  });

  // How the history is drawn and what is open beside you are not places you were
  // standing, so neither is a reason to reset on arrival. Same asymmetry setWorkspace
  // and setFragmentProject already keep.
  it("keeps the history view and the pane open beside it", () => {
    window.location.hash = "hv=tree&rs=files";
    enterWorkspace(ws);
    expect(readFragmentForTest()).toMatchObject({ hv: "tree", rs: "files" });
  });
});
