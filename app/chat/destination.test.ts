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
  it("waits for the fragment before deciding anything", () => {
    expect(resolveCentre({ resolved: false, workspace: null, destination: null })).toEqual({
      kind: "loading",
    });
  });

  it("keeps waiting even with a workspace and a destination already in hand", () => {
    expect(resolveCentre({ resolved: false, workspace, destination: "projects" })).toEqual({
      kind: "loading",
    });
  });

  it("offers the agent grid until a workspace is chosen", () => {
    expect(resolveCentre({ resolved: true, workspace: null, destination: null })).toEqual({
      kind: "agents",
    });
  });

  // A destination is scoped to a workspace, so it cannot outrank not having one.
  it("offers the agent grid even when a destination is named", () => {
    expect(resolveCentre({ resolved: true, workspace: null, destination: "projects" })).toEqual({
      kind: "agents",
    });
  });

  it("shows the destination once one is named", () => {
    expect(resolveCentre({ resolved: true, workspace, destination: "projects" })).toEqual({
      kind: "destination",
      at: "projects",
    });
  });

  // No `sid` here, deliberately: a workspace with no conversation open is still the
  // chat, and ChatView's empty state is what says so.
  it("shows the conversation when nothing else is named", () => {
    expect(resolveCentre({ resolved: true, workspace, destination: null })).toEqual({
      kind: "chat",
    });
  });
});
