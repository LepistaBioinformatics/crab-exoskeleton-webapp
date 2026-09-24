// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// chat-shell-redesign FR-2. The project grid moved from the top of the chats sidebar
// into the centre pane. What it does did not change — the same client calls, the same
// confirm, the same silence for a harness that has no projects — so this suite asserts
// the behaviour rather than the layout, and mocks `@/lib/projects` (the one module the
// screen and its hook both reach the proxy through) rather than the hook itself.

const listProjects = vi.fn();
const createProject = vi.fn();
const updateProject = vi.fn();
const deleteProject = vi.fn();

vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: (...args: unknown[]) => listProjects(...args),
    createProject: (...args: unknown[]) => createProject(...args),
    updateProject: (...args: unknown[]) => updateProject(...args),
    deleteProject: (...args: unknown[]) => deleteProject(...args),
  };
});

const ProjectsScreen = (await import("./projects-screen")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Project } from "@/lib/projects";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Legal",
    instructions: "Cite the contract clause first.",
    createdAt: "2026-03-04T10:00:00Z",
    ...over,
  };
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  listProjects.mockReset();
  createProject.mockReset();
  updateProject.mockReset();
  deleteProject.mockReset();
});

async function mount(browsedProject: string | null = null, onBrowse = () => {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <ProjectsScreen
        workspace={workspace}
        browsedProject={browsedProject}
        onBrowse={onBrowse}
      />,
    );
  });
  return host;
}

// The cards live in the screen's own list; the edit/delete controls are siblings of the
// card button, so "the cards" is the buttons that carry a project name.
//
// The FIRST entry of that list is the agent's own workspace, which is not a project — it
// is the way OUT of one. It is sliced off here and asserted on its own below, so every
// count and every index in this file goes on meaning "projects".
function cards(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll("ul > li > button")].slice(1) as HTMLButtonElement[];
}

function ownWorkspaceCard(host: HTMLElement): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>("ul > li > button");
  if (!el) throw new Error("the grid rendered no cards at all");
  return el;
}

function byLabel(host: HTMLElement, label: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled "${label}"`);
  return el;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the grid", () => {
  it("renders one card per project", async () => {
    listProjects.mockResolvedValue([
      project({ id: "p1", name: "Legal" }),
      project({ id: "p2", name: "Field trial" }),
    ]);

    const host = await mount();

    expect(cards(host)).toHaveLength(2);
    expect(host.textContent).toContain("Legal");
    expect(host.textContent).toContain("Field trial");
  });

  it("enters the project whose card was clicked", async () => {
    listProjects.mockResolvedValue([
      project({ id: "p1", name: "Legal" }),
      project({ id: "p2", name: "Field trial" }),
    ]);
    const onBrowse = vi.fn();

    const host = await mount(null, onBrowse);
    await click(cards(host)[1]);

    expect(onBrowse).toHaveBeenCalledWith("p2");
  });

  // FR-1.5: reaching this screen from inside a project keeps `p` set, so the grid has
  // to say which card is the place the member is standing in.
  it("marks the project the member is inside", async () => {
    listProjects.mockResolvedValue([
      project({ id: "p1", name: "Legal" }),
      project({ id: "p2", name: "Field trial" }),
    ]);

    const host = await mount("p2");

    const [legal, trial] = cards(host);
    expect(legal.getAttribute("aria-current")).toBeNull();
    expect(trial.getAttribute("aria-current")).toBe("true");
    expect(trial.textContent).toContain(t.projects.current);
  });
});

// THE WAY OUT OF A PROJECT. Until 2026-09-12 there was none: the sidebar entered a
// project, the breadcrumb's project segment led here while KEEPING `p` (FR-1.5, and
// still right), and nothing named the agent's own workspace at all. A member who entered
// Legal stayed in Legal.
describe("leaving a project", () => {
  it("offers the agent's own workspace alongside the projects", async () => {
    listProjects.mockResolvedValue([project({ id: "p1", name: "Legal" })]);

    const host = await mount("p1");

    expect(ownWorkspaceCard(host).textContent).toContain(t.projects.mainAgent);
    expect(host.textContent).toContain(t.projects.mainAgentHint);
  });

  // `null`, which is the same write a project card makes: `sid`, `msg` and `v` go with
  // `p`, so the member lands in the workspace rather than back on this list.
  it("asks for no project at all when it is clicked", async () => {
    listProjects.mockResolvedValue([project({ id: "p1", name: "Legal" })]);
    const onBrowse = vi.fn();

    const host = await mount("p1", onBrowse);
    await click(ownWorkspaceCard(host));

    expect(onBrowse).toHaveBeenCalledWith(null);
  });

  // It is a place like the others, so it says when it is the one you are in — otherwise
  // a member outside every project reads a grid where nothing is current and cannot tell
  // whether they are somewhere or nowhere.
  it("marks itself when the member is in no project", async () => {
    listProjects.mockResolvedValue([project({ id: "p1", name: "Legal" })]);

    const host = await mount(null);

    expect(ownWorkspaceCard(host).getAttribute("aria-current")).toBe("true");
    expect(cards(host)[0].getAttribute("aria-current")).toBeNull();
  });

  it("is not marked while the member is inside a project", async () => {
    listProjects.mockResolvedValue([project({ id: "p1", name: "Legal" })]);

    const host = await mount("p1");

    expect(ownWorkspaceCard(host).getAttribute("aria-current")).toBeNull();
  });
});

// DEC-11: `createdAt` is the only date lib/projects.ts carries, and it is "" when the
// proxy sent none. A blank slot reads as a date that failed to load, so there is none.
describe("the card's date", () => {
  it("shows createdAt when the proxy sent one", async () => {
    listProjects.mockResolvedValue([project({ createdAt: "2026-03-04T10:00:00Z" })]);

    const host = await mount();

    expect(host.textContent).toContain("2026");
  });

  it("shows no date at all when createdAt is empty", async () => {
    listProjects.mockResolvedValue([
      project({ createdAt: "", instructions: "Cite the clause." }),
    ]);

    const host = await mount();

    const [card] = cards(host);
    expect(card.textContent).toContain("Legal");
    expect(card.textContent).toBe("LegalCite the clause.");
  });
});

describe("create, edit and delete", () => {
  it("creates through createProject and enters the new project", async () => {
    listProjects.mockResolvedValue([]);
    createProject.mockResolvedValue(project({ id: "new", name: "Soy" }));
    const onBrowse = vi.fn();

    const host = await mount(null, onBrowse);
    await click(byLabel(host, t.projects.create));

    const name = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(name, "Soy");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(createProject).toHaveBeenCalledWith(workspace, "Soy", "");
    expect(onBrowse).toHaveBeenCalledWith("new");
    expect(host.textContent).toContain(t.projects.restartNotice);
  });

  // The PATCH carries only what changed: upstream leaves an absent key alone, so
  // sending both would blank the instructions on a plain rename.
  it("patches only the field the edit changed", async () => {
    listProjects.mockResolvedValue([project({ id: "p1", name: "Legal" })]);
    updateProject.mockResolvedValue(project({ name: "Legal BR" }));

    const host = await mount();
    await click(byLabel(host, t.projects.edit));

    const name = host.querySelector<HTMLInputElement>("input")!;
    expect(name.value).toBe("Legal");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(name, "Legal BR");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(updateProject).toHaveBeenCalledWith(workspace, "p1", { name: "Legal BR" });
  });

  it("deletes only after the confirm dialog is answered", async () => {
    listProjects.mockResolvedValue([project({ id: "p1" })]);
    deleteProject.mockResolvedValue(undefined);

    const host = await mount();
    await click(byLabel(host, t.projects.delete));

    // The dialog portals to <body>, so it is not under the screen's host node.
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain(t.projects.deleteConfirmTitle);
    expect(deleteProject).not.toHaveBeenCalled();

    const confirm = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === t.projects.deleteConfirm,
    )!;
    await click(confirm);

    expect(deleteProject).toHaveBeenCalledWith(workspace, "p1");
  });

  // Deleting the project you are inside is the one place this screen clears `p`: its
  // conversations are gone, so nothing scoped to it can go on claiming to show them.
  it("leaves the project when the one you are inside is deleted", async () => {
    listProjects.mockResolvedValue([project({ id: "p1" })]);
    deleteProject.mockResolvedValue(undefined);
    const onBrowse = vi.fn();

    const host = await mount("p1", onBrowse);
    await click(byLabel(host, t.projects.delete));
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const confirm = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === t.projects.deleteConfirm,
    )!;
    await click(confirm);

    expect(onBrowse).toHaveBeenCalledWith(null);
  });

  // Write failures are the screen's own; a failed save must not read as the list being
  // unavailable, so the error appears and the cards stay.
  it("reports a failed write without losing the grid", async () => {
    listProjects.mockResolvedValue([project({ id: "p1" })]);
    deleteProject.mockRejectedValue(new Error("forbidden"));

    const host = await mount();
    await click(byLabel(host, t.projects.delete));
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const confirm = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === t.projects.deleteConfirm,
    )!;
    await click(confirm);

    expect(cards(host)).toHaveLength(1);
  });
});

// FR-2.4: an agent whose harness cannot have projects gets no screen at all — not an
// error, not an empty state with a create button that cannot work.
describe("a harness without projects", () => {
  it("renders nothing", async () => {
    listProjects.mockRejectedValue(new Error("projects_unsupported"));

    const host = await mount();

    expect(host.textContent).toBe("");
    expect(host.querySelector("button")).toBeNull();
  });
});

// A LIST IN A COLUMN, NEWEST FIRST.
//
// This was a three-column grid of tall cards at the frame's full 6xl width: a shape
// for browsing a gallery, spread across a band wider than anything else in the app,
// for a handful of entries most members can count on one hand. Each card also
// reserved height for a blurb that is usually one line or none.
describe("the shape of the list", () => {
  const rowsOf = (host: HTMLElement) => [...host.querySelectorAll("li")];

  it("orders them newest first", async () => {
    listProjects.mockResolvedValue([
      project({ id: "old", name: "Oldest", createdAt: "2026-01-01T00:00:00Z" }),
      project({ id: "new", name: "Newest", createdAt: "2026-06-01T00:00:00Z" }),
      project({ id: "mid", name: "Middle", createdAt: "2026-03-01T00:00:00Z" }),
    ]);
    const host = await mount();
    // The first row is the way OUT of a project, not a project -- it is why the
    // names are read rather than the rows counted from zero.
    const names = rowsOf(host)
      .map((li) => li.textContent ?? "")
      .filter((x) => /Oldest|Newest|Middle/.test(x));
    expect(names[0]).toContain("Newest");
    expect(names[1]).toContain("Middle");
    expect(names[2]).toContain("Oldest");
  });

  // AN UNKNOWN DATE IS NOT "THE OLDEST". `createdAt` is "" when the proxy sent none,
  // and sorting those to the top would give the least-known entries the most
  // prominent place in the list.
  it("puts the ones with no date last, not first", async () => {
    listProjects.mockResolvedValue([
      project({ id: "none", name: "Undated", createdAt: "" }),
      project({ id: "dated", name: "Dated", createdAt: "2026-01-01T00:00:00Z" }),
    ]);
    const host = await mount();
    const names = rowsOf(host)
      .map((li) => li.textContent ?? "")
      .filter((x) => /Undated|Dated/.test(x));
    expect(names[0]).toContain("Dated");
    expect(names[1]).toContain("Undated");
  });

  it("stacks them rather than laying them out in a grid", async () => {
    listProjects.mockResolvedValue([project()]);
    const host = await mount();
    const list = host.querySelector("ul")!;
    expect([...list.classList]).toContain("flex-col");
    expect(
      [...list.classList].filter((c) => c.includes("grid")),
      "the grid came back",
    ).toEqual([]);
  });
});
