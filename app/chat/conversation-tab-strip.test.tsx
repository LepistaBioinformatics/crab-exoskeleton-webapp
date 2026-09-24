// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import ConversationTabStrip from "./conversation-tab-strip";
import type { Tab, TabRef } from "./conversation-tabs";
import { chatCopy } from "@/lib/i18n/chat";

// THE STRIP, AND THE TWO GESTURES AN EDITOR TRAINED EVERYONE ON.
//
// `conversation-tabs.test.ts` covers what the list DOES. This covers what a click does
// to it, which is the half only a mounted component can answer.

const t = chatCopy.en;

const tab = (over: Partial<Tab> = {}): Tab => ({
  t: "acme",
  s: "growth",
  r: "alpha",
  p: null,
  sid: "c1",
  preview: false,
  title: "One",
  ...over,
});

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const activated: TabRef[] = [];
const pinned: TabRef[] = [];
const closed: TabRef[] = [];

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  activated.length = 0;
  pinned.length = 0;
  closed.length = 0;
});

function mount(tabs: Tab[], active: TabRef | null = null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ConversationTabStrip
        tabs={tabs}
        active={active}
        onActivate={(r) => activated.push(r)}
        onPin={(r) => pinned.push(r)}
        onClose={(r) => closed.push(r)}
      />,
    );
  });
  return host!;
}

const tabButtons = () => [...host!.querySelectorAll('[role="tab"]')];

function click(el: Element, times = 1) {
  act(() => {
    for (let i = 0; i < times; i++) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    if (times > 1) el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
}

describe("the strip", () => {
  // ABSENT RATHER THAN EMPTY. A member who has opened nothing gets no strip at all,
  // instead of a band of dead chrome above every conversation they ever read.
  it("draws nothing at all when nothing is open", () => {
    const el = mount([]);
    expect(el.innerHTML).toBe("");
  });

  it("draws one tab per open conversation, by its title", () => {
    const el = mount([tab({ sid: "a", title: "First" }), tab({ sid: "b", title: "Second" })]);
    expect(tabButtons().map((b) => b.textContent)).toEqual(["First", "Second"]);
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
  });

  // A conversation whose first turn has not named it yet still needs something to
  // click on.
  it("names an untitled conversation rather than drawing an empty tab", () => {
    mount([tab({ title: "" })]);
    expect(tabButtons()[0].textContent).toBe(t.tabs.untitled);
  });

  it("marks the active one, and only that one", () => {
    mount([tab({ sid: "a" }), tab({ sid: "b" })], tab({ sid: "b" }));
    expect(tabButtons().map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  });

  // ITALIC IS THE PREVIEW, the one visual convention every editor shares for "the next
  // thing you click will replace this".
  it("draws a preview in italic and a kept one upright", () => {
    mount([tab({ sid: "a", preview: true }), tab({ sid: "b" })]);
    expect([...tabButtons()[0].classList]).toContain("italic");
    expect([...tabButtons()[1].classList]).not.toContain("italic");
  });
});

describe("the two gestures", () => {
  it("activates on a single click", () => {
    mount([tab({ sid: "a" })]);
    click(tabButtons()[0]);
    expect(activated.map((r) => r.sid)).toEqual(["a"]);
    expect(pinned).toEqual([]);
  });

  // A double click fires its own two `click`s first, so activating twice has to be
  // harmless — it is a no-op on a tab that is already active, which is why activate is
  // not guarded.
  it("keeps it on a double click, having activated on the way", () => {
    mount([tab({ sid: "a", preview: true })]);
    click(tabButtons()[0], 2);
    expect(pinned.map((r) => r.sid)).toEqual(["a"]);
  });

  it("carries the whole location, not just the conversation", () => {
    mount([tab({ sid: "a", p: "legal", r: "beta" })]);
    click(tabButtons()[0]);
    expect(activated[0]).toMatchObject({ sid: "a", p: "legal", r: "beta" });
  });
});

describe("closing", () => {
  const closeControl = (i: number) =>
    [...host!.querySelectorAll("button")].filter((b) =>
      b.getAttribute("aria-label")?.startsWith(t.tabs.close),
    )[i];

  it("closes the one whose × was pressed", () => {
    mount([tab({ sid: "a" }), tab({ sid: "b" })]);
    click(closeControl(1));
    expect(closed.map((r) => r.sid)).toEqual(["b"]);
  });

  // CLOSING DOES NOT FIRST NAVIGATE INTO THE THING BEING CLOSED, which on the last tab
  // would mean arriving somewhere about to vanish.
  //
  // What holds it is STRUCTURAL: the × is a sibling of the tab button, so the event has
  // nothing to bubble into. This test passed with and without a `stopPropagation`,
  // which is how the guard was found to be doing nothing and removed. It is kept
  // because the structure is what it pins -- nesting the × inside the tab would fail
  // it, and that is the change worth catching.
  it("does not also activate the tab it is closing", () => {
    mount([tab({ sid: "a" })]);
    click(closeControl(0));
    expect(activated, "closing navigated into the tab first").toEqual([]);
  });

  // A control that only appears on hover cannot be reached on a touch screen, and the
  // active tab is the one most likely to be closed.
  it("keeps the active tab's × always visible, and reveals the others", () => {
    mount([tab({ sid: "a" }), tab({ sid: "b" })], tab({ sid: "a" }));
    expect([...closeControl(0).classList]).toContain("opacity-100");
    expect([...closeControl(1).classList]).toContain("group-hover:opacity-100");
  });
});
