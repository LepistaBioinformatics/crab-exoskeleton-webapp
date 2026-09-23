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

describe("the two groups", () => {
  it("labels each one and lists its own rows under it", () => {
    const el = mount();
    const html = el.innerHTML;

    for (const group of DESTINATION_GROUPS) {
      const heading = html.indexOf(`>${group.label(t)}</span>`);
      expect(heading, `${group.key} has no heading`).toBeGreaterThan(-1);
    }

    // Each group's rows sit between its own heading and the next group's, which is
    // what "grouped" means and what a flat list with two decorative labels would fail.
    const bounds = DESTINATION_GROUPS.map((g) => html.indexOf(`>${g.label(t)}</span>`));
    for (const [i, group] of DESTINATION_GROUPS.entries()) {
      const slice = html.slice(bounds[i], i + 1 < bounds.length ? bounds[i + 1] : html.length);
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

  it("puts every row in exactly one group, and no row anywhere else", () => {
    expect(rowLabels(mount())).toHaveLength(
      DESTINATION_GROUPS.reduce((n, g) => n + g.rows.length, 0),
    );
  });

  // THE HALF THAT IS NOT A DRAWING. Two lists with a heading painted above each still
  // announce as "list, 2 items" and "list, 5 items" — as undifferentiated as the flat
  // list this replaced. Each list has to NAME its group.
  it("names each list after its own heading", () => {
    const el = mount();
    const lists = Array.from(el.querySelectorAll("ul"));
    expect(lists).toHaveLength(DESTINATION_GROUPS.length);
    for (const [i, list] of lists.entries()) {
      const labelledBy = list.getAttribute("aria-labelledby");
      expect(labelledBy, "a list with no accessible name").toBeTruthy();
      expect(el.querySelector(`#${labelledBy}`)?.textContent).toBe(
        DESTINATION_GROUPS[i].label(t),
      );
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

  it("gives Screens no control to fold it with", () => {
    const el = mount();
    const headings = Array.from(el.querySelectorAll("button")).filter((b) =>
      b.hasAttribute("aria-expanded"),
    );
    expect(headings).toHaveLength(1);
    expect(headings[0].getAttribute("aria-label")).toContain(t.shell.groups.tools);
    expect(el.innerHTML).toContain(`>${t.shell.groups.screens}</span>`);
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
