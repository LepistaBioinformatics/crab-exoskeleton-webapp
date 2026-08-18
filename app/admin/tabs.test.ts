import { describe, it, expect } from "vitest";
import { railItems } from "./admin-nav";
import {
  DEFAULT_TAB,
  SECTION_TABS,
  TAB_KEYS,
  parseTab,
  resolveRailItem,
  sectionNeedsDelivery,
} from "./tabs";

const ALL = { hasScopes: true, canEditBranding: true };

// `?tab=` is user-editable, so the parse is the boundary that keeps a hand-typed
// or stale URL from rendering an empty admin panel.
describe("parseTab", () => {
  it("accepts every real tab key", () => {
    for (const key of TAB_KEYS) {
      expect(parseTab(key)).toBe(key);
    }
  });

  it("falls back to the default for absent, empty or unknown values", () => {
    for (const raw of [null, undefined, "", "garbage", "Files", "files ", "__proto__"]) {
      expect(parseTab(raw)).toBe(DEFAULT_TAB);
    }
  });
});

// Members came BACK from being a mode, and the reason it left still holds: a roster
// belongs to a subscription whatever agents it runs. What changed is that the screen now
// asks for the agent and the scope once, up front, instead of asking for the agent again
// inside the invite form -- so the section can sit under that one selection without
// implying the roster is filtered by it.
describe("SECTION_TABS", () => {
  it("is the sections of a selected workspace, with members last", () => {
    expect(SECTION_TABS).toEqual([
      "files",
      "secrets",
      "skills",
      "persona",
      "model",
      "config",
      "members",
    ]);
  });

  it("only names tabs that exist", () => {
    for (const t of SECTION_TABS) {
      expect(TAB_KEYS).toContain(t);
    }
  });

  // Every tab is either a section or the branding item. A tab that is neither would be
  // reachable by URL and rendered by nothing.
  it("leaves exactly branding over, so the nav has no gap", () => {
    expect(TAB_KEYS.filter((k) => !SECTION_TABS.includes(k))).toEqual(["branding"]);
  });
});

// The one place that answers "does the menu's restart policy apply here". It gates both
// the control's not-applicable form and the invalid-policy block, so a wrong answer here
// either promises a delivery that does not happen or locks a section that never needed
// one.
describe("sectionNeedsDelivery", () => {
  it("says no for files -- a live read-only mount has nothing to deliver", () => {
    expect(sectionNeedsDelivery("files")).toBe(false);
  });

  // Its one write that needs delivery is a member's config.json, and the instance editor
  // carries its own per-workspace policy for it.
  it("says no for members", () => {
    expect(sectionNeedsDelivery("members")).toBe(false);
  });

  it("says yes for every other section", () => {
    for (const tab of SECTION_TABS) {
      if (tab === "files" || tab === "members") continue;
      expect(sectionNeedsDelivery(tab)).toBe(true);
    }
  });
});

describe("resolveRailItem", () => {
  it("honours the tab the URL asks for when the caller may use it", () => {
    expect(resolveRailItem("branding", ALL)).toBe("branding");
    expect(resolveRailItem("files", ALL)).toBe("workspaces");
    expect(resolveRailItem("members", ALL)).toBe("workspaces");
  });

  // `?tab=` is user-editable. A hand-typed item the caller cannot use must not render a
  // panel they have no rights to.
  it("refuses branding to a caller without branding rights", () => {
    expect(resolveRailItem("branding", { ...ALL, canEditBranding: false })).toBe("workspaces");
  });

  // The fallback is the caller's first AVAILABLE item, not a fixed one: landing a
  // branding-only caller on `workspaces` would give them a gate leading nowhere.
  it("sends a branding-only caller to branding whatever the tab says", () => {
    const brandingOnly = { hasScopes: false, canEditBranding: true };
    for (const tab of TAB_KEYS) {
      expect(resolveRailItem(tab, brandingOnly)).toBe("branding");
    }
  });

  it("never returns an item that is not available, except with no authority at all", () => {
    for (const hasScopes of [false, true]) {
      for (const canEditBranding of [false, true]) {
        const a = { hasScopes, canEditBranding };
        const items = railItems(a);
        if (items.length === 0) continue; // the screen shows "no admin access"
        for (const tab of TAB_KEYS) {
          expect(items).toContain(resolveRailItem(tab, a));
        }
      }
    }
  });
});
