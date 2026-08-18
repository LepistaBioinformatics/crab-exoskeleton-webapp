// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import Breadcrumb from "./breadcrumb";
import { buildColumns, splitColumns, type Column, type ColumnRow } from "./columns";
import type { AdminScope, AgentRef, ScopeRef } from "@/lib/admin";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en;

// THE TEST THAT WAS MISSING. The dropdown shipped doing nothing at all: the bar carried
// `overflow-x-auto`, and per the CSS overflow spec a non-`visible` value on one axis forces
// the other off `visible` too — so the bar clipped its own absolutely-positioned menu and
// the admin saw a click that did nothing. Every existing test rendered statically and never
// opened it.
//
// jsdom does not compute layout, so it cannot catch the clipping itself. What it CAN pin
// down is the contract that was silently broken: opening puts the menu in the document,
// choosing calls back with the right row, and dismissing does neither.

const AGENTS: AgentRef[] = [{ key: "alpha" }, { key: "beta" }];
const SCOPES: AdminScope[] = [
  { kind: "tenant", tenantId: "t1", tenantName: "Innovation" },
  { kind: "subscription", tenantId: "t1", subsAccId: "a1", accName: "Marketing Squad" },
];
const SCOPE_A: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "a1" };

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(onSelect: (c: Column, r: ColumnRow) => void = () => {}) {
  const columns = buildColumns({
    authority: { hasScopes: true, canEditBranding: true },
    agents: AGENTS,
    scopes: SCOPES,
    root: "workspaces",
    agent: "alpha",
    tenantId: "t1",
    scope: SCOPE_A,
    section: "secrets",
  });
  const { crumbs, open } = splitColumns(columns);
  const chosen = open?.key === "sections" ? (open.rows.find((r) => r.selected) ?? null) : null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <Breadcrumb
        crumbs={crumbs}
        open={open}
        mobileTail={chosen && open ? { column: open, selected: chosen } : null}
        onSelect={onSelect}
      />,
    );
  });
  return host!;
}

const segments = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'));
const menu = () => document.querySelector('[role="menu"]');
const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Breadcrumb — changing a level", () => {
  it("opens no menu until a segment is clicked", async () => {
    await mount();
    expect(menu()).toBeNull();
  });

  it("opens the level's siblings when its segment is clicked", async () => {
    const el = await mount();
    const agentSegment = segments(el)[1];
    await click(agentSegment);
    expect(menu()).not.toBeNull();
    expect(items().map((i) => i.textContent)).toEqual([
      "alpha",
      "beta",
      t.legacyStore.entryLabel,
    ]);
    expect(agentSegment.getAttribute("aria-expanded")).toBe("true");
  });

  it("marks which sibling is the current one", async () => {
    const el = await mount();
    await click(segments(el)[1]);
    expect(items()[0].className).toContain("font-semibold");
    expect(items()[1].className).not.toContain("font-semibold");
  });

  // The point of the whole control: change one level without re-walking the ones after it.
  it("reports the chosen row and closes", async () => {
    const picked: { column: string; row: string }[] = [];
    const el = await mount((c, r) => picked.push({ column: c.key, row: r.id }));
    await click(segments(el)[1]);
    await click(items()[1]);
    expect(picked).toEqual([{ column: "agents", row: "agent:beta" }]);
    expect(menu()).toBeNull();
  });

  // The menu is portalled out of the bar, so an outside-click handler that only checked the
  // bar would close it on mousedown and swallow the click that was choosing something.
  it("does not treat its own items as an outside click", async () => {
    const picked: string[] = [];
    const el = await mount((_c, r) => picked.push(r.id));
    await click(segments(el)[1]);
    await act(async () => {
      items()[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(menu()).not.toBeNull();
    await click(items()[1]);
    expect(picked).toEqual(["agent:beta"]);
  });

  it("closes on Escape and on a click outside, choosing nothing", async () => {
    const picked: string[] = [];
    const el = await mount((_c, r) => picked.push(r.id));

    await click(segments(el)[1]);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(menu()).toBeNull();

    await click(segments(el)[1]);
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(menu()).toBeNull();
    expect(picked).toEqual([]);
  });

  it("closes when its own segment is clicked again", async () => {
    const el = await mount();
    await click(segments(el)[1]);
    await click(segments(el)[1]);
    expect(menu()).toBeNull();
  });

  it("shows one menu at a time", async () => {
    const el = await mount();
    await click(segments(el)[1]);
    await click(segments(el)[2]);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(items().map((i) => i.textContent)).toContain("Innovation");
  });

  // The mobile-only tail. On a phone the sections sidebar is hidden so the panel can have
  // the screen, and this segment is the only way back to the list -- tapping a section
  // there previously looked like it did nothing, because the sidebar and the panel were
  // side by side and the panel had no width left.
  it("lets the section be changed from its own tail segment", async () => {
    const picked: { column: string; row: string }[] = [];
    const el = await mount((c, r) => picked.push({ column: c.key, row: r.id }));
    const tail = segments(el).at(-1)!;
    expect(tail.getAttribute("aria-label")).toBe(
      t.columns.changeAria.replace("{level}", t.columns.headings.sections),
    );

    await click(tail);
    expect(items().map((i) => i.textContent)).toContain(t.shell.tabs.skills);

    await click(items().find((i) => i.textContent === t.shell.tabs.skills)!);
    expect(picked).toEqual([{ column: "sections", row: "section:skills" }]);
  });
});