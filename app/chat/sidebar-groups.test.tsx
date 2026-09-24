// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SidebarDestinations, { DESTINATION_GROUPS, rowLabel } from "./sidebar-destinations";
import { setDestination, setRightSidebar } from "./fragment";
import { chatCopy } from "@/lib/i18n/chat";

// THE TWO KINDS, AS THE MEMBER MEETS THEM. The distinction was already structural —
// a screen replaces the centre, a tool opens beside it — and invisible: six rows that
// looked alike. What these assert is the visible half, and the half that can regress
// without any type changing.
//
// jsdom rather than the static markup `sidebar-destinations.test.tsx` renders, because
// every claim here is about a CLICK: folding Tools, and which of the two fragment keys
// a row writes. The suite is node-env, so the environment is per-file.

const t = chatCopy.en;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(over: Partial<Parameters<typeof SidebarDestinations>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <SidebarDestinations
        openDestination={null}
        openSection={null}
        onDestination={() => {}}
        onSection={() => {}}
        {...over}
      />,
    );
  });
  return host!;
}

function rowLabels(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll("li button")).map((b) => b.textContent ?? "");
}

function groupToggle(el: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(el.querySelectorAll("button")).find((b) =>
    (b.getAttribute("aria-label") ?? "").endsWith(name),
  );
  expect(found, `no group control for ${name}`).toBeTruthy();
  return found as HTMLButtonElement;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// ONE LABELLED GROUP, AND THE ROWS ABOVE IT. There were two labelled groups until the
// mangrove became a right-pane section, which left the first one a heading over a list
// of one -- a word that earns nothing, and a line between Projects and the New chat
// button directly above it. It is unlabelled now, which is what puts the two together.
describe("the groups", () => {
  it("heads the labelled group and lists its own rows under it", () => {
    const el = mount();
    const html = el.innerHTML;

    const labelled = DESTINATION_GROUPS.filter((g) => g.label);
    expect(labelled, "no group carries a heading any more").not.toHaveLength(0);

    for (const group of labelled) {
      const heading = html.indexOf(`>${group.label!(t)}</span>`);
      expect(heading, `${group.key} has no heading`).toBeGreaterThan(-1);
      // Its rows sit after its own heading, which is what "grouped" means and what a
      // flat list with a decorative label would fail.
      const slice = html.slice(heading);
      for (const row of group.rows) {
        expect(slice, `${rowLabel(row, t)} is not under ${group.key}`).toContain(
          `>${rowLabel(row, t)}</span>`,
        );
      }
      expect(
        slice.split("<li>").length - 1,
        `${group.key} does not hold exactly its own rows`,
      ).toBe(group.rows.length);
    }
  });

  // NO EMPTY HEADING EITHER. A blank header would still take the vertical space that
  // separates Projects from New chat, which is the gap this shape exists to close.
  it("draws no heading at all for the unlabelled group", () => {
    const el = mount();
    const headings = Array.from(el.querySelectorAll("nav > div > div, nav > div > button"));
    expect(headings).toHaveLength(DESTINATION_GROUPS.filter((g) => g.label).length);
  });

  it("puts every row in exactly one group, and no row anywhere else", () => {
    expect(rowLabels(mount())).toHaveLength(
      DESTINATION_GROUPS.reduce((n, g) => n + g.rows.length, 0),
    );
  });

  // THE HALF THAT IS NOT A DRAWING. A list with a heading painted above it still
  // announces as "list, 6 items" unless it NAMES the heading. A list with no heading
  // must not point at one either -- an `aria-labelledby` naming an id that is not in
  // the document is the dangling reference the group header is careful to avoid.
  it("names a list after its heading, and only when it has one", () => {
    const el = mount();
    const lists = Array.from(el.querySelectorAll("ul"));
    expect(lists).toHaveLength(DESTINATION_GROUPS.length);
    for (const [i, list] of lists.entries()) {
      const group = DESTINATION_GROUPS[i];
      const labelledBy = list.getAttribute("aria-labelledby");
      if (!group.label) {
        expect(labelledBy, "an unlabelled group pointed at a heading").toBeNull();
        continue;
      }
      expect(labelledBy, "a list with no accessible name").toBeTruthy();
      expect(el.querySelector(`#${labelledBy}`)?.textContent).toBe(group.label(t));
    }
  });
});


// The owner's answer to the follow-up: Tools folds, Screens does not. Screens is where
// the member can BE, and a column whose "where am I" list can be hidden is a column
// that can be left saying nothing.
describe("which group folds", () => {
  it("folds Tools away and brings it back", () => {
    const el = mount();
    const tools = DESTINATION_GROUPS.find((g) => g.key === "tools")!;
    const before = rowLabels(el).length;

    const toggle = groupToggle(el, t.shell.groups.tools);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    click(toggle);
    expect(rowLabels(el)).toHaveLength(before - tools.rows.length);
    expect(groupToggle(el, t.shell.groups.tools).getAttribute("aria-expanded")).toBe(
      "false",
    );
    // Not merely hidden: a hidden button is still tabbable, so a folded group would
    // leave five controls in the tab order pointing at rows nobody can see.
    for (const row of tools.rows) {
      expect(el.innerHTML).not.toContain(`>${rowLabel(row, t)}</span>`);
    }

    click(groupToggle(el, t.shell.groups.tools));
    expect(rowLabels(el)).toHaveLength(before);
  });

  // Only the labelled group folds. The rows above it are where the member can BE, and
  // a column whose "where am I" list can be hidden is one that can be left saying
  // nothing -- so they get no control, which now falls out of having no heading.
  it("gives the unlabelled group no control to fold it with", () => {
    const el = mount();
    const buttons = Array.from(el.querySelectorAll("button[aria-expanded]"));
    expect(buttons).toHaveLength(DESTINATION_GROUPS.filter((g) => g.collapsible).length);
    expect(buttons[0].getAttribute("aria-label")).toContain(t.shell.groups.tools);
  });
});

// Remembered, because the fold says how the member WORKS rather than where they are.
// Where they are lives in the fragment, for the opposite reason destination.ts gives.
describe("whether the fold outlives the tab", () => {
  it("opens folded when storage says it was folded", () => {
    click(groupToggle(mount(), t.shell.groups.tools));
    act(() => root!.unmount());
    host!.remove();

    const el = mount();
    expect(groupToggle(el, t.shell.groups.tools).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  // A private window can throw on both ends of this. The column has to draw, and it
  // has to draw with the rows SHOWING — a storage failure that hid five destinations
  // would be the fold happening to somebody who never asked for it.
  it("opens with Tools showing when storage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      const el = mount();
      expect(groupToggle(el, t.shell.groups.tools).getAttribute("aria-expanded")).toBe(
        "true",
      );
      // And it still folds for this session, which is all it can promise here.
      click(groupToggle(el, t.shell.groups.tools));
      expect(groupToggle(el, t.shell.groups.tools).getAttribute("aria-expanded")).toBe(
        "false",
      );
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

// THE DIFFERENCE THE GROUPING EXISTS TO ANNOUNCE, asserted on the fragment itself
// rather than on a callback name: a screen row writes `v` and the centre pane changes,
// a tool row writes `rs` and a pane opens beside whatever the centre is showing. The
// real setters are wired in here because "sets `v`" is the claim — the component's own
// callbacks could be crossed over in the shell and nothing below would notice.
describe("what a click on each kind writes", () => {
  it("sets `v` from a screen row and `rs` from a tool row", () => {
    const el = mount({ onDestination: setDestination, onSection: setRightSidebar });

    const projects = Array.from(el.querySelectorAll("li button")).find(
      (b) => b.textContent === t.projects.title,
    )!;
    click(projects);
    expect(window.location.hash).toContain("v=projects");
    expect(window.location.hash).not.toContain("rs=");

    const files = Array.from(el.querySelectorAll("li button")).find(
      (b) => b.textContent === t.uploads.files,
    )!;
    click(files);
    expect(window.location.hash).toContain("rs=files");
    // BOTH AT ONCE. A tool opens BESIDE the screen; it does not replace it, which is
    // the coexistence the two keys exist for.
    expect(window.location.hash).toContain("v=projects");
  });
});
