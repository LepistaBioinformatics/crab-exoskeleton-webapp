import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import SidebarDestinations, {
  DESTINATION_GROUPS,
  DESTINATION_ROWS,
  railDestinationGroups,
  rowKey,
} from "./sidebar-destinations";
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
const DESTINATIONS = ["projects", "mangrove"] as const;

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
    // Two destinations now -- projects and the mangrove -- ahead of the five
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
    const html = list({ hidden: { projects: true } });
    expect(html).not.toContain(`>${en.projects.title}</span>`);
    // Only PROJECTS. The two switches are independent, and hiding one must not
    // hide the other.
    expect(html.split("<li>").length - 1).toBe(SECTION_ORDER.length + DESTINATIONS.length - 1);
    expect(html).toContain(`>${en.mangrove.title}</span>`);
  });
});

// A DEPLOYMENT WITH NO MANGROVE OFFERED THE ROW ANYWAY, and answered it with a
// blank centre pane. The screen hides ITSELF on the proxy's 404, which is what
// made the comment this block replaces -- "the mangrove has its own switch, an
// operator who never enabled it gets no rows from the screen itself" -- read as
// though the row went with it. It did not: the filter only ever knew about
// projects.
//
// Absent, not present-and-dead, which is the rule the rest of this column
// follows.
describe("a deployment with no mangrove", () => {
  it("omits the mangrove row", () => {
    const html = list({ hidden: { mangrove: true } });
    expect(html).not.toContain(`>${en.mangrove.title}</span>`);
    expect(html).toContain(`>${en.projects.title}</span>`);
    expect(html.split("<li>").length - 1).toBe(SECTION_ORDER.length + DESTINATIONS.length - 1);
  });

  it("drops it from the collapsed rail too", () => {
    const groups = railDestinationGroups({
      t: en,
      openDestination: null,
      openSection: null,
      hidden: { mangrove: true },
      onDestination: () => {},
      onSection: () => {},
    });
    const keys = groups.flat().map((p) => p.key);
    expect(keys).not.toContain("mangrove");
    expect(keys).toContain("projects");
  });

  // Both at once is a real configuration -- an old proxy with no mangrove -- and
  // it must not leave an empty group drawing a heading over nothing.
  it("leaves no empty group when both are hidden", () => {
    const groups = railDestinationGroups({
      t: en,
      openDestination: null,
      openSection: null,
      hidden: { projects: true, mangrove: true },
      onDestination: () => {},
      onSection: () => {},
    });
    expect(groups.every((g) => g.length > 0)).toBe(true);
    expect(groups.flat().map((p) => p.key)).toEqual([...SECTION_ORDER]);
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

  // THE ASSERTION THAT CATCHES THE TWO LISTS DRIFTING APART, and it is deliberately
  // written against the structure rather than against a literal: a sixth section, or a
  // third screen, must not need an edit here to stay true. A literal list would go
  // stale at exactly the moment this is supposed to fire.
  it("offers every row the sidebar does, grouped the same way", () => {
    const groups = railDestinationGroups({
      t: en,
      openDestination: null,
      openSection: null,
      onDestination: () => {},
      onSection: () => {},
    });
    expect(groups.map((g) => g.length)).toEqual(DESTINATION_GROUPS.map((g) => g.rows.length));
    expect(groups.flat().map((entry) => entry.key)).toEqual(DESTINATION_ROWS.map(rowKey));
    // A rail entry is a bare glyph, so every one of them needs the sentence its
    // tooltip is made of. A row added with no blurb would be a nameless icon.
    for (const entry of groups.flat()) {
      expect(entry.label, `${entry.key} has no name`).toBeTruthy();
      expect(entry.blurb, `${entry.key} has no blurb`).toBeTruthy();
    }
  });

  // The FOLD is the expanded column's. A rail that dropped five of its glyphs because
  // the column was folded would be a way out of the tools with no way back in.
  it("drops only what the sidebar drops -- the projects row, for an agent without them", () => {
    const groups = railDestinationGroups({
      t: en,
      openDestination: null,
      openSection: null,
      hidden: { projects: true },
      onDestination: () => {},
      onSection: () => {},
    });
    expect(groups.flat().map((entry) => entry.key)).toEqual(
      DESTINATION_ROWS.filter((r) => r.kind !== "projects").map(rowKey),
    );
  });

  // The two kinds read on the rail as the hairline `ResizablePane` draws between
  // groups, which is all a 48px column has room for.
  it("hands the rail one group per kind rather than one list", () => {
    expect(DESTINATION_GROUPS).toHaveLength(2);
    expect(DESTINATION_GROUPS.map((g) => g.key)).toEqual(["screens", "tools"]);
    expect(DESTINATION_GROUPS.map((g) => g.collapsible)).toEqual([false, true]);
  });
});
