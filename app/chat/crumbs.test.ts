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
    onProject: () => {},
    ...input,
  });
}

// FR-3.2's table, walked row by row. Each segment is omitted when it has no value, and
// the combination that decides it is the last one.
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

  it("names the project between them when the conversation is inside one", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "project", "leaf"]);
    expect(result[1].label).toBe("Legal");
  });

  it("puts the projects screen where the conversation's title was, because that is where the member is", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC", destination: "projects" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "project", "leaf"]);
    expect(result[2].label).toBe(t.projects.title);
  });

  // FR-1.5, and the row an implementer gets wrong: asking to see the list of projects
  // does not leave the project. `p` survives `v=projects`, so the segment naming it does.
  it("still names the project when the destination is the projects grid itself", () => {
    const result = crumbs({ project, conversationTitle: "Parecer TBDC", destination: "projects" });
    expect(result.map((c) => c.key)).toEqual(["workspace", "project", "leaf"]);
    expect(result[1].label).toBe("Legal");
    expect(result[2].label).toBe(t.projects.title);
  });
});

// Asserted against the dictionary rather than against the literal "Projects": the
// sidebar row, the screen's heading and this segment name one place, and a literal here
// would keep passing while the three of them drifted apart.
describe("what the leaf is called", () => {
  it("takes the projects grid's name from the projects copy", () => {
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
  it("leaves the leaf unlinked — the place you already are is not somewhere to go", () => {
    for (const input of [
      { conversationTitle: "Parecer TBDC" },
      { project, conversationTitle: "Parecer TBDC" },
      { project, conversationTitle: "Parecer TBDC", destination: "projects" as const },
    ]) {
      const result = crumbs(input);
      const last = result[result.length - 1];
      expect(last.key).toBe("leaf");
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

  it("links the earlier ones to what the caller supplied", () => {
    const onWorkspace = vi.fn();
    const onProject = vi.fn();
    const result = crumbs({
      project,
      conversationTitle: "Parecer TBDC",
      onWorkspace,
      onProject,
    });

    result[0].go?.();
    result[1].go?.();
    expect(onWorkspace).toHaveBeenCalledOnce();
    expect(onProject).toHaveBeenCalledOnce();
  });

  // The projects grid is reached from here, so the segment above it stays a link even
  // while that grid is what the centre shows: it is the project, not the list.
  it("keeps the project a link while the projects grid is open", () => {
    const result = crumbs({ project, destination: "projects" });
    expect(typeof result[1].go).toBe("function");
  });
});
