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
      openDestination={null}
      openSection={null}
      onDestination={() => {}}
      onSection={() => {}}
      {...props}
    />,
  );
}

// The centre-pane destinations, in the order the rail and the sidebar both show
// them. Named here so the three assertions below say "the destinations" rather
// than "one" or "two", and a third one is a single edit.
const DESTINATIONS = ["projects", "reef"] as const;

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
  it("renders exactly as many rows as there are sections, plus the destinations", () => {
    // Two destinations now -- projects and the reef -- ahead of the five
    // sections. Counted as `DESTINATIONS.length` rather than a literal so a
    // third one updates this in one place.
    expect(DESTINATION_ROWS).toHaveLength(SECTION_ORDER.length + DESTINATIONS.length);
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
    const html = list({ openDestination: "projects" });
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
    const html = list({ openDestination: "projects", openSection: "graph" });
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
    // Only PROJECTS is hidden. The reef has its own switch -- an operator who
    // never enabled it gets no rows from the screen itself -- so hiding one
    // must not hide the other.
    expect(html.split("<li>").length - 1).toBe(SECTION_ORDER.length + DESTINATIONS.length - 1);
    expect(html).toContain(`>${en.reef.title}</span>`);
  });
});

// The toggle is the component's, not the caller's, so the collapsed rail cannot answer
// the same click differently. The rule itself is walked in workspace-sections.test.ts;
// what belongs here is that the list this component renders and the list the rail reads
// are literally the same array, in the same order.
describe("the rows the rail reads", () => {
  it("carries every section, in SECTION_ORDER, after the destinations", () => {
    expect(DESTINATION_ROWS.slice(0, DESTINATIONS.length).map((r) => r.kind)).toEqual(
      DESTINATIONS,
    );
    expect(
      DESTINATION_ROWS.slice(DESTINATIONS.length).map((r) =>
        r.kind === "section" ? r.section : null,
      ),
    ).toEqual(SECTION_ORDER);
  });
});
