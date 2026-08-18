// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import Chooser from "./chooser";
import type { Column, ColumnRow } from "./columns";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en;

const AGENTS: Column = {
  key: "agents",
  rows: [
    { id: "agent:alpha", text: "alpha", branch: true, selected: false, tone: "normal", icon: "agent" },
    { id: "agent:beta", text: "beta", branch: true, selected: false, tone: "normal", icon: "agent" },
    {
      id: "agent:all",
      textKey: "legacy",
      hintKey: "legacy",
      branch: true,
      selected: false,
      tone: "legacy",
      icon: "legacy",
    },
  ],
};

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// jsdom has no matchMedia. The component asks it whether motion is welcome, so the fixture
// has to answer -- and answering both ways is the point of two of these tests.
function motion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  motion(false);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(onSelect: (row: ColumnRow) => void = () => {}, column = AGENTS) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Chooser column={column} onSelect={onSelect} />);
  });
  return host!;
}

const options = (el: HTMLElement) => Array.from(el.querySelectorAll("button"));

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Chooser", () => {
  // At this moment the screen is asking a question and nothing else is on it, so it says
  // which question and what to do about it.
  it("names the level and what to do", async () => {
    const el = await mount();
    expect(el.textContent).toContain(t.columns.headings.agents);
    expect(el.textContent).toContain(t.columns.next.agents);
  });

  it("draws one option per row, translating prose and leaving identifiers verbatim", async () => {
    const el = await mount();
    expect(options(el)).toHaveLength(3);
    expect(el.textContent).toContain("alpha");
    expect(el.textContent).toContain(t.legacyStore.entryLabel);
  });

  it("keeps the legacy store visually subordinate", async () => {
    const el = await mount();
    expect(options(el)[2].className).toContain("border-dashed");
  });

  // THE FEEDBACK. Without it the screen simply changes and nothing says the click was
  // yours; the next level replaces this one the moment the beat elapses.
  it("marks the pressed option and reports it only after the confirmation beat", async () => {
    const picked: string[] = [];
    const el = await mount((r) => picked.push(r.id));

    await click(options(el)[1]);
    expect(options(el)[1].className).toContain("animate-chooser-pick");
    expect(picked).toEqual([]);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(picked).toEqual(["agent:beta"]);
  });

  // A CSS-only guard would neutralize the animation and leave the pause behind — a delay
  // with nothing to show for it is just latency.
  it("skips the beat entirely when motion is not welcome", async () => {
    motion(true);
    const picked: string[] = [];
    const el = await mount((r) => picked.push(r.id));
    await click(options(el)[0]);
    expect(picked).toEqual(["agent:alpha"]);
  });

  it("does not queue a second navigation on a double press", async () => {
    const picked: string[] = [];
    const el = await mount((r) => picked.push(r.id));
    await click(options(el)[0]);
    await click(options(el)[1]);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(picked).toEqual(["agent:alpha"]);
  });

  it("states an empty level's reason", async () => {
    const el = await mount(() => {}, { ...AGENTS, rows: [], empty: "noAgents" });
    expect(el.textContent).toContain(t.columns.empty.noAgents);
    expect(el.innerHTML).toContain("data-empty-state");
  });
});
