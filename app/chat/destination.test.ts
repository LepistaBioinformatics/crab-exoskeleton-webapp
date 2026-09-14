import { describe, it, expect } from "vitest";
import { asDestination, resolveCentre } from "./destination";
import { SECTION_ORDER } from "./workspace-sections";
import type { Workspace } from "./fragment";

const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

// The fragment is user-editable text and the centre pane picks a screen by it.
describe("reading a destination out of the fragment", () => {
  it("accepts the one destination it offers", () => {
    expect(asDestination("projects")).toBe("projects");
  });

  // The reversal's own regression: a link written while the sections were centre
  // destinations still says `v=files`, and answering it with the files screen in the
  // middle would put the section back where the owner took it out of.
  it("refuses a workspace section, which is a pane and not a screen", () => {
    for (const section of SECTION_ORDER) expect(asDestination(section)).toBeNull();
  });

  it("refuses anything else, rather than handing the centre a screen it does not have", () => {
    expect(asDestination("garbage")).toBeNull();
    expect(asDestination("menu")).toBeNull();
    expect(asDestination(null)).toBeNull();
    expect(asDestination("")).toBeNull();
  });
});

// FR-1.3, in its resolution order. The conflicting rows are the ones with teeth — a
// reordered chain passes every tidy input and fails these.
describe("what the centre pane shows", () => {
  const centre = (over: Partial<Parameters<typeof resolveCentre>[0]>) =>
    resolveCentre({ resolved: true, workspace, destination: null, sid: "s-1", ...over });

  it("waits for the fragment before deciding anything", () => {
    expect(centre({ resolved: false, workspace: null, sid: null })).toEqual({ kind: "loading" });
  });

  it("keeps waiting even with a workspace and a destination already in hand", () => {
    expect(centre({ resolved: false, destination: "projects" })).toEqual({ kind: "loading" });
  });

  it("offers the agent grid until a workspace is chosen", () => {
    expect(centre({ workspace: null })).toEqual({ kind: "agents" });
  });

  // A destination is scoped to a workspace, so it cannot outrank not having one.
  it("offers the agent grid even when a destination is named", () => {
    expect(centre({ workspace: null, destination: "projects" })).toEqual({ kind: "agents" });
  });

  it("shows the destination once one is named", () => {
    expect(centre({ destination: "projects" })).toEqual({ kind: "destination", at: "projects" });
  });

  // A destination outranks the landing for the same reason it outranks the chat: it is
  // what the member ASKED the centre to show, and `sid` is only what is waiting.
  it("shows the destination even with no conversation open", () => {
    expect(centre({ destination: "projects", sid: null })).toEqual({
      kind: "destination",
      at: "projects",
    });
  });

  it("shows the conversation when one is open", () => {
    expect(centre({})).toEqual({ kind: "chat" });
  });

  // FR-3.1, and the row that used to read `chat`. What made THAT honest was an effect
  // in ChatView minting a conversation on sight of an absent `sid` -- so entering a
  // project, which drops `sid`, dropped the member into a blank transcript instead of
  // into the project.
  it("offers the landing when no conversation is open", () => {
    expect(centre({ sid: null })).toEqual({ kind: "landing" });
  });

  // One state, one answer: the agent's root and a project's root are the same absent
  // `sid`, and the scope is what differs -- which is the list's business, not this
  // function's.
  it("offers the same landing at an agent's root and inside a project", () => {
    const inProject: Workspace = { ...workspace, p: "legal" };
    expect(centre({ workspace: inProject, sid: null })).toEqual({ kind: "landing" });
  });
});
