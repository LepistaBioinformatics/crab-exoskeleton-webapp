// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import WorkspacePane from "./workspace-pane";
import { SECTIONS, SECTION_ORDER, type Section } from "./workspace-sections";
import { chatCopy } from "@/lib/i18n/chat";

// SWITCHING TOOLS WITHOUT LEAVING THE PANE.
//
// The six sections open beside the conversation, and the only way between two of them
// was the left column: out of the pane, down the list, back in — for a move between two
// things that are both already "open beside the conversation". The heading names where
// you are, so it is where the other five belong.
//
// The rule that matters is that this list and the sidebar's are ONE list. Two renderings
// of "what tools are there" is two things that can disagree, and the one in the heading
// is the one a member would find first.

const t = chatCopy.en;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const switched: Section[] = [];

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  switched.length = 0;
});

function mount(over: Partial<Parameters<typeof WorkspacePane>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <WorkspacePane
        title={SECTIONS.files.label(t)}
        section="files"
        onSection={(s) => switched.push(s)}
        onClose={() => {}}
        {...over}
      >
        <p>body</p>
      </WorkspacePane>,
    );
  });
  return host!;
}

const opener = () => host!.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
const items = () => [...host!.querySelectorAll('[role="menuitem"]')];

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the switcher in the heading", () => {
  it("is not offered to a caller with nothing to switch between", () => {
    // The pane is a general frame. There is no rule that everything it will ever hold
    // is one of the six, and a chevron that opens a list of places this pane is not
    // one of would be a lie about where you are.
    mount({ section: undefined, onSection: undefined });
    expect(opener()).toBeNull();
    expect(host!.querySelector("h2")?.textContent).toBe(SECTIONS.files.label(t));
  });

  it("offers every section, by the name the sidebar uses", () => {
    mount();
    click(opener()!);
    const labels = items().map((i) => i.textContent?.replace(/\s+/g, " ").trim());
    for (const s of SECTION_ORDER) {
      expect(
        labels.some((l) => l?.startsWith(SECTIONS[s].label(t))),
        `${s} is missing from the heading's list`,
      ).toBe(true);
    }
    expect(items()).toHaveLength(SECTION_ORDER.length);
  });

  // ONE LIST, NOT TWO RENDERINGS OF IT. Both read SECTION_ORDER, so a seventh section
  // appears in both or in neither — and in the same order, which is what makes the two
  // surfaces feel like one thing.
  it("lists them in the sidebar's own order", () => {
    mount();
    click(opener()!);
    const order = items().map((i) =>
      SECTION_ORDER.find((s) => i.textContent?.startsWith(SECTIONS[s].label(t))),
    );
    expect(order).toEqual([...SECTION_ORDER]);
  });

  it("marks the one that is open, and switching to it is not a move", () => {
    mount();
    click(opener()!);
    const here = items().find((i) => i.getAttribute("aria-current") === "true")!;
    expect(here.textContent).toContain(SECTIONS.files.label(t));

    click(here);
    // Re-opening what is already open would flash the pane for nothing, and closing it
    // would make a list of places into a toggle.
    expect(switched).toEqual([]);
  });

  it("switches to another one and puts the list away", () => {
    mount();
    click(opener()!);
    const memory = items().find((i) => i.textContent?.startsWith(SECTIONS.memory.label(t)))!;
    click(memory);
    expect(switched).toEqual(["memory"]);
    expect(items()).toHaveLength(0);
  });

  // A DEPLOYMENT WITHOUT A MANGROVE MUST NOT BE OFFERED ONE HERE EITHER. The sidebar
  // filters the row out; a heading that still listed it would be a second way in to a
  // pane that renders nothing.
  it("drops what this deployment does not have", () => {
    mount({ hiddenSections: ["mangrove"] });
    click(opener()!);
    expect(items()).toHaveLength(SECTION_ORDER.length - 1);
    expect(
      items().some((i) => i.textContent?.startsWith(SECTIONS.mangrove.label(t))),
      "the mangrove was offered on a deployment that has none",
    ).toBe(false);
  });
});

// A MENU THAT OUTLIVES THE CLICK THAT OPENED IT IS A MENU NOBODY CAN DISMISS. The pane
// has no other layer, so nothing else is listening for either of these.
describe("putting the list away", () => {
  it("closes on Escape", () => {
    mount();
    click(opener()!);
    expect(items()).toHaveLength(SECTION_ORDER.length);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(items()).toHaveLength(0);
  });

  it("closes on a click somewhere else", () => {
    mount();
    click(opener()!);
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(items()).toHaveLength(0);
  });

  // Otherwise it stays open over whatever the pane becomes next.
  it("closes when the pane starts leaving", () => {
    mount();
    click(opener()!);
    act(() => {
      root!.render(
        <WorkspacePane
          title={SECTIONS.files.label(t)}
          section="files"
          onSection={(s) => switched.push(s)}
          onClose={() => {}}
          closing
        >
          <p>body</p>
        </WorkspacePane>,
      );
    });
    expect(items()).toHaveLength(0);
  });
});

// THE DRAWER RISES FROM THE BOTTOM ON A PHONE.
//
// It was a full-height column pinned to the right edge at 92vw: a desktop pane made
// narrow. It came from the side, left a strip of dead conversation beside it too thin
// to read and too wide to ignore, and put its close control in the far top corner —
// the hardest point on the screen for the thumb holding the device.
//
// Asserted on the classes and the stylesheet, because jsdom computes no layout and
// cannot resize a viewport: what is being pinned is which rules exist, the way
// `pane-ground.test.ts` beside it does.
describe("the shape of the drawer on a phone", () => {
  const ROOT = join(__dirname, "..", "..");
  const pane = readFileSync(join(ROOT, "app/chat/workspace-pane.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const aside = /className=\{`\$\{phase\}([^`]*)`\}/.exec(pane)![1];

  it("is anchored to the bottom edge, full width, and stops under the breadcrumb", () => {
    for (const cls of [
      "max-md:inset-x-0",
      "max-md:bottom-0",
      "max-md:top-12",
      "max-md:w-full!",
      "max-md:rounded-t-2xl",
    ]) {
      expect(aside, `${cls} is missing from the drawer`).toContain(cls);
    }
    // It USED to stop at a fraction of the viewport, which left a strip of
    // conversation too short to read and only there to prove the sheet was a layer.
    expect(aside, "the sheet is sized by the viewport again").not.toMatch(/max-md:h-\[/);
  });

  // THE ONE NUMBER IN THIS FILE THAT IS NOT SELF-EVIDENT, and the only thing that
  // would tell anyone it had gone wrong is a sliver of breadcrumb peeking out from
  // under the drawer, or a gap of dead ground above it.
  //
  // `top-12` is 3rem, and it is the top bar's own height: `py-2` (8px each side)
  // around an `h-8` control (32px). Both inputs live in other files and neither
  // knows this drawer exists.
  it("sits exactly under the bar, by that bar's own two measurements", () => {
    const shell = readFileSync(join(ROOT, "app/chat/chat-shell.tsx"), "utf8");
    const button = readFileSync(join(ROOT, "components/ui/icon-button.tsx"), "utf8");

    // The bar the breadcrumb sits in: the one that also holds the mobile menu toggle.
    const bar = /className="flex shrink-0 items-center gap-2 px-3 py-(\d+)"/.exec(shell);
    expect(bar, "the top bar moved; this test reads it by shape").not.toBeNull();
    const padY = Number(bar![1]) * 4;

    const sm = /sm: "h-(\d+) w-\d+"/.exec(button);
    expect(sm, "IconButton's size scale moved; this test reads it by shape").not.toBeNull();
    const control = Number(sm![1]) * 4;

    const top = /max-md:top-(\d+)/.exec(aside);
    expect(top).not.toBeNull();
    expect(
      Number(top![1]) * 4,
      `the bar is ${control + padY * 2}px and the drawer starts at ${Number(top![1]) * 4}px`,
    ).toBe(control + padY * 2);
  });

  it("no longer hangs off the right edge", () => {
    for (const cls of ["max-md:inset-y-0", "max-md:right-0", "max-md:w-[92vw]!"]) {
      expect(aside, `${cls} is the side drawer coming back`).not.toContain(cls);
    }
  });

  // `w-full!` keeps its `!` for the reason 92vw needed one: `width` is an inline style,
  // drag-resizable on desktop, and an inline style beats an ordinary class.
  it("keeps the important modifier that beats the inline width", () => {
    expect(aside).toContain("max-md:w-full!");
  });

  // IT MOVES NOW, which is the reversal. The old drawer could not be animated at all --
  // the width `!important` beat any animation of `width` -- so the close was clamped to
  // 1ms to stop a dead drawer sitting on screen. Rising from the bottom animates on
  // TRANSFORM, which nothing is overriding, so the exit is real again.
  it("rises and falls with the bottom sheet's own motion", () => {
    const phone = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(css);
    expect(phone, "the phone-width block moved; this test reads it by shape").not.toBeNull();
    expect(phone![1]).toContain("sheetRise");
    expect(phone![1]).toContain("sheetFall");
    expect(phone![1], "the 1ms clamp outlived the side drawer it existed for").not.toContain(
      "animation-duration: 1ms",
    );
  });
});
