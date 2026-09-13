import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// The suite runs `environment: "node"`, so no effect fires and nothing fetches: this is
// FIRST PAINT, before any of the five panels has been answered. That is the right thing
// to assert here — the question is whether the dispatcher hands each section its own
// body under its own name, not what any of those bodies eventually shows.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import WorkspaceScreen from "./workspace-screen";
import { SECTIONS, SECTION_ORDER, type Section } from "./workspace-sections";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const screen = (section: Section) =>
  renderToStaticMarkup(
    <WorkspaceScreen
      workspace={workspace}
      section={section}
      onClose={() => {}}
      onReference={() => {}}
      onRestartNeeded={() => {}}
    />,
  );

// One string per body that only that body renders, so a dispatcher wired to the wrong
// component fails instead of passing on a heading it would have drawn anyway.
const BODY: Record<Section, string> = {
  memory: t.memory.hint,
  graph: t.memoryGraph.hint,
  tasks: t.scheduledTasks.hint,
  files: t.uploads.organiseHint,
  secrets: t.secrets.savedForYou,
};

describe("WorkspaceScreen", () => {
  for (const section of SECTION_ORDER) {
    it(`renders ${section} inside the pane, under its own name`, () => {
      const html = screen(section);
      // `h2`, not `h1`: the centre pane holds the heading for where the member IS, and
      // this is what is open beside it.
      expect(html).toContain(`>${SECTIONS[section].label(t)}</h2>`);
      expect(html, `the ${section} section did not render its own body`).toContain(
        BODY[section],
      );
    });
  }

  // The names come from SECTIONS, which is also what the sidebar row and the
  // breadcrumb's last segment read. Spelled out here, a member would have one name for
  // the row they clicked and another for the screen it opened.
  it("names each destination with the same string the sidebar row uses", () => {
    for (const section of SECTION_ORDER) {
      expect(screen(section)).toContain(SECTIONS[section].label(t));
    }
  });

  // The panel header carried one refresh control and relabelled it per section. The
  // pane has an actions slot instead, and only the two sections that go stale on their
  // own claim it: the graph because the agent writes to it mid-conversation, tasks
  // because it schedules them between visits.
  it("offers refresh on the graph and on tasks, each labelled for itself", () => {
    expect(screen("graph")).toContain(t.memoryGraph.refreshAria);
    expect(screen("tasks")).toContain(t.scheduledTasks.refreshAria);
  });

  // Files has one too, but it belongs to the listing rather than to the frame — it sits
  // beside upload and new-folder, which are the other things you do to the tree.
  it("leaves the files listing to carry its own refresh", () => {
    const html = screen("files");
    expect(html).toContain(t.uploads.refreshAria);
    expect(html).not.toContain(t.memoryGraph.refreshAria);
  });

  it("offers no refresh where nothing goes stale behind the member's back", () => {
    for (const section of ["memory", "secrets"] as const) {
      const html = screen(section);
      expect(html).not.toContain(t.memoryGraph.refreshAria);
      expect(html).not.toContain(t.scheduledTasks.refreshAria);
      expect(html).not.toContain(t.uploads.refreshAria);
    }
  });

  // The pane offered a list of the other four above whichever one was open, on a
  // sliding track. It must not again: the sidebar names all five now, and a second copy
  // here would be a way in to where the member already is.
  it("offers no way in to the other four", () => {
    const html = screen("memory");
    for (const other of SECTION_ORDER.filter((s) => s !== "memory")) {
      expect(html, `the ${other} destination is listed inside the memory one`).not.toContain(
        `>${SECTIONS[other].label(t)}<`,
      );
    }
  });

  // A PANE IS CLOSED, and this is the assertion that came back with it. While the five
  // filled the centre there was no "close" that meant anything — you left by going
  // somewhere else — so the control and its copy were both removed. The pane sits beside
  // the conversation, so shutting it is a thing the member wants and the sidebar row is
  // not the only way to ask for it.
  it("offers a close control, named for the section it closes", () => {
    for (const section of SECTION_ORDER) {
      expect(screen(section)).toContain(
        `aria-label="${t.pane.close} ${SECTIONS[section].label(t)}"`,
      );
    }
  });

  // The pane is a landmark beside the conversation, so it has to say which one it is:
  // an unnamed <aside> is announced as "complementary" and nothing more.
  it("names the pane itself after the open section", () => {
    for (const section of SECTION_ORDER) {
      expect(screen(section)).toContain(`aria-label="${SECTIONS[section].label(t)}"`);
    }
  });
});
