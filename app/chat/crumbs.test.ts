import { describe, it, expect, vi } from "vitest";
import { chatCopy } from "@/lib/i18n/chat";
import type { Project } from "@/lib/projects";
import { buildCrumbs } from "./crumbs";
import type { Workspace } from "./fragment";
import { SECTION_ORDER, SECTIONS } from "./workspace-sections";

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "2f9a1c4e-0000-4000-8000-000000000001", r: "alpha" };
const project: Project = { id: "legal", name: "Legal", instructions: "", createdAt: "" };

function crumbs(input: Partial<Parameters<typeof buildCrumbs>[0]> = {}) {
  return buildCrumbs({
    workspace,
    subscription: "Acme",
    project: null,
    conversationTitle: null,
    destination: null,
    t,
    onWorkspace: () => {},
    onProjects: () => {},
    onProject: () => {},
    ...input,
  });
}

// FR-1's table, walked row by row. Each segment is omitted when it has no value, and the
// combination of `p` and `v` decides the tail.
describe("which segments the breadcrumb shows", () => {
  it("shows nothing before a workspace is chosen — the agent grid names itself", () => {
    expect(crumbs({ workspace: null })).toEqual([]);
  });

  it("shows the workspace alone when nothing is open inside it", () => {
    expect(crumbs().map((c) => c.key)).toEqual(["workspace"]);
  });

  it("adds the conversation when one is open", () => {
    const result = crumbs({ conversationTitle: "Parecer TBDC" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "leaf"]);
    expect(result[1].label).toBe("Parecer TBDC");
  });

  // FR-1.1, and the correction this feature exists for. `Projects` is the level a member
  // walks THROUGH to reach a project, so it stands above it. It used to be the last
  // segment, which rendered the list as a child of a project it contains.
  it("puts the projects list above the project, not below it", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "projects", "project", "leaf"]);
    expect(result[1].label).toBe(t.projects.title);
    expect(result[2].label).toBe("Legal");
    expect(result[3].label).toBe("Parecer TBDC");
  });

  // FR-1.3. On the list the path ends at the project: the list is where the member came
  // through, the project is where they are, and the grid marks it.
  it("ends at the project when the projects list is what the centre shows", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC", destination: "projects" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "projects", "project"]);
    expect(result[2].label).toBe("Legal");
  });

  // FR-1.4.
  it("ends at the list when no project is open", () => {
    const result = crumbs({ destination: "projects" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "projects"]);
    expect(result[1].label).toBe(t.projects.title);
  });

  // FR-1.5. An agent with no project and no list is not somewhere below a list of
  // projects, so naming one would be a level the member never walked through.
  it("says nothing about projects when neither a project nor the list is open", () => {
    const result = crumbs({ conversationTitle: "Parecer TBDC" });
    expect(result.map((c) => c.key)).not.toContain("projects");
  });
});

// Asserted against the dictionary rather than against the literal "Projects": the
// sidebar row, the screen's heading and this segment name one place, and a literal here
// would keep passing while the three of them drifted apart.
describe("what the segments are called", () => {
  it("takes the projects list's name from the projects copy", () => {
    expect(crumbs({ destination: "projects" })[1].label).toBe(t.projects.title);
  });

  // THE FIVE SECTIONS NEVER REACH THIS BAR, and this is the assertion that keeps them
  // out. They were leaves while they were centre destinations; they open in a pane
  // beside the conversation now, and a breadcrumb reading `… / Files` over a transcript
  // that is still on screen names somewhere the member has not gone.
  it("never names a workspace section, open pane or not", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC" });
    const labels = result.map((c) => c.label);
    for (const section of SECTION_ORDER) {
      expect(labels).not.toContain(SECTIONS[section].label(t));
    }
    expect(labels[labels.length - 1]).toBe("Parecer TBDC");
  });
});

// The information today's chat header leads with, in its new place. It must not start
// answering "where am I" with something a member cannot read.
describe("the workspace segment", () => {
  it("leads with the subscription and qualifies it with the agent", () => {
    expect(crumbs({ conversationTitle: "Parecer TBDC" })[0].label).toBe("Acme · alpha");
  });

  it("falls back to the agent alone before the subscription has a name", () => {
    const result = crumbs({ subscription: null, conversationTitle: "Parecer TBDC" });
    expect(result[0].label).toBe(`${t.view.agentPrefix} alpha`);
  });

  it("never shows the subscription's id in the slot a name belongs in", () => {
    const result = crumbs({ subscription: null, conversationTitle: "Parecer TBDC" });
    expect(result[0].label).not.toContain(workspace.s);
  });
});

describe("which segments are links", () => {
  it("leaves the last one unlinked — the place you already are is not somewhere to go", () => {
    for (const input of [
      { conversationTitle: "Parecer TBDC" },
      { project, conversationTitle: "Parecer TBDC" },
      { project, conversationTitle: "Parecer TBDC", destination: "projects" as const },
      { destination: "projects" as const },
    ]) {
      const result = crumbs(input);
      const last = result[result.length - 1];
      expect("go" in last).toBe(false);
    }
  });

  // The workspace segment is the ONLY way to the agent grid, so it keeps its link even
  // when the path is one crumb long. Stripping it there — which "the last crumb has no
  // link" did — left an agent with no conversation open with no way back out of it.
  it("keeps the workspace linked even when it is the whole path", () => {
    const onWorkspace = vi.fn();
    const result = crumbs({ onWorkspace });
    expect(result).toHaveLength(1);
    result[0].go?.();
    expect(onWorkspace).toHaveBeenCalledTimes(1);
  });

  // FR-1.2, the navigation half of the inversion. The list is reached from the segment
  // that NAMES the list; the project's own name goes up to the project.
  it("sends the projects segment to the list and the project segment to the project", () => {
    const onProjects = vi.fn();
    const onProject = vi.fn();
    const result = crumbs({
      project,
      conversationTitle: "Parecer TBDC",
      onProjects,
      onProject,
    });

    result[1].go?.();
    result[2].go?.();
    expect(onProjects).toHaveBeenCalledOnce();
    expect(onProject).toHaveBeenCalledOnce();
  });

  it("links the workspace to what the caller supplied", () => {
    const onWorkspace = vi.fn();
    const result = crumbs({ project, conversationTitle: "Parecer TBDC", onWorkspace });
    result[0].go?.();
    expect(onWorkspace).toHaveBeenCalledOnce();
  });

  // The list is reached from here, so this segment stays a link even while that list is
  // what the centre shows: the member is standing on the project, not on the list.
  it("keeps the projects segment a link while the list is open", () => {
    const result = crumbs({ project, destination: "projects" });
    expect(typeof result[1].go).toBe("function");
  });
});

// EVERY DESTINATION USED TO PUSH A CRUMB LABELLED "Projects", because the code
// asked whether there was a destination and never which one. Standing in the
// mangrove read as standing in a list of projects.
//
// THERE IS ONE DESTINATION LEFT. The mangrove became a right-pane section, so the
// bug above is now unreachable by construction rather than by a branch -- and the
// rule that replaces it is the one the five sections already obeyed: a pane beside
// the transcript is not a place you are standing, so no section is ever a crumb.
describe("a destination names itself", () => {
  it("says Projects on the projects list", () => {
    const labels = crumbs({ destination: "projects" }).map((c) => c.label);
    expect(labels).toContain(t.projects.title);
  });

  // The mangrove is a section now. It was the one destination that had to argue its
  // way into the trail; as a pane it never appears, like the other five.
  it("never names the mangrove, which is a pane and not a place", () => {
    for (const trail of [
      crumbs({ destination: "projects" }),
      crumbs({ project, destination: "projects" }),
      crumbs({}),
    ]) {
      expect(trail.map((c) => c.label)).not.toContain(t.mangrove.title);
    }
  });

  // Inside a project the list IS a level the member walked through, so it stays.
  it("keeps Projects when a project is open, and ends at the project", () => {
    const labels = crumbs({ project, destination: "projects" }).map((c) => c.label);
    expect(labels).toEqual(["Acme · alpha", t.projects.title, project.name]);
  });

  // The last crumb is where you are standing, and the bar does not offer a
  // button for that.
  it("leaves the last crumb unlinked", () => {
    const trail = crumbs({ project, destination: "projects" });
    expect(trail[trail.length - 1].go).toBeUndefined();
  });
});

