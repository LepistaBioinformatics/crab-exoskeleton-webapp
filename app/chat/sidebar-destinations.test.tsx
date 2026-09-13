import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import SidebarDestinations, { DESTINATION_ROWS } from "./sidebar-destinations";
import { SECTION_ORDER, SECTIONS } from "./workspace-sections";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

const labels = [
  en.projects.title,
  ...SECTION_ORDER.map((section) => SECTIONS[section].label(en)),
];

function list(props: Partial<Parameters<typeof SidebarDestinations>[0]> = {}) {
  return renderToStaticMarkup(
    <SidebarDestinations
      projectsOpen={false}
      openSection={null}
      onProjects={() => {}}
      onSection={() => {}}
      {...props}
    />,
  );
}

describe("SidebarDestinations", () => {
  it("renders one named row per entry, projects first and then SECTION_ORDER", () => {
    const html = list();
    const positions = labels.map((label) => html.indexOf(`>${label}</span>`));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  // The list and the constant are the SAME list, and this is the assertion that keeps
  // them so. A sixth section added to `workspace-sections.ts` and forgotten here would
  // be unreachable from the only surface that offers a way in, and nothing else in the
  // suite would notice.
  it("renders exactly as many rows as there are sections, plus projects", () => {
    expect(DESTINATION_ROWS).toHaveLength(SECTION_ORDER.length + 1);
    expect(list().split("<li>").length - 1).toBe(DESTINATION_ROWS.length);
  });

  it("marks nothing while the conversation is alone on screen", () => {
    expect(list()).not.toContain("aria-current");
  });
});

// THE ROW THAT SAYS WHERE YOU ARE, AND THE ROW THAT SAYS WHAT IS OPEN BESIDE YOU.
//
// Two kinds of current, and they can hold AT THE SAME TIME — the projects screen with
// Files open beside it is a state the member can reach, and a test asserting "one row is
// marked" would have forbidden exactly the coexistence this list was corrected for.
describe("which rows are marked, and how", () => {
  it("marks Projects as the page, because that is where the member is", () => {
    const html = list({ projectsOpen: true });
    expect(html).toContain('aria-current="page"');
    const marked = html.indexOf('aria-current="page"');
    const label = html.indexOf(`>${en.projects.title}</span>`);
    expect(marked).toBeLessThan(label);
    expect(html.slice(marked, label)).not.toContain("<li>");
  });

  // `true`, not `page`: a pane open beside the conversation is not the page you are on,
  // and `page` is the value the spec reserves for the one that is.
  it("marks an open section without claiming it is the page", () => {
    const html = list({ openSection: "files" });
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain('aria-current="page"');
    const marked = html.indexOf('aria-current="true"');
    const label = html.indexOf(`>${SECTIONS.files.label(en)}</span>`);
    expect(marked).toBeLessThan(label);
    expect(html.slice(marked, label)).not.toContain("<li>");
  });

  it("marks both at once, which is the state the pane exists for", () => {
    const html = list({ projectsOpen: true, openSection: "graph" });
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-current="true"');
  });
});

// An agent whose proxy predates projects: the row is absent, not disabled. A disabled
// control swallows its own click, so the member sees a way in that does nothing.
describe("an agent whose proxy has no projects", () => {
  it("omits the projects row", () => {
    const html = list({ hideProjects: true });
    expect(html).not.toContain(`>${en.projects.title}</span>`);
    expect(html.split("<li>").length - 1).toBe(SECTION_ORDER.length);
  });
});

// The toggle is the component's, not the caller's, so the collapsed rail cannot answer
// the same click differently. The rule itself is walked in workspace-sections.test.ts;
// what belongs here is that the list this component renders and the list the rail reads
// are literally the same array, in the same order.
describe("the rows the rail reads", () => {
  it("carries every section, in SECTION_ORDER, after projects", () => {
    expect(DESTINATION_ROWS[0]).toEqual({ kind: "projects" });
    expect(
      DESTINATION_ROWS.slice(1).map((r) => (r.kind === "section" ? r.section : null)),
    ).toEqual(SECTION_ORDER);
  });
});
