import { describe, it, expect } from "vitest";
import { railItems } from "./admin-nav";
import {
  DEFAULT_TAB,
  SECTION_TABS,
  TAB_KEYS,
  parseTab,
  resolveRailItem,
  rootSelection,
  sectionNeedsDelivery,
} from "./tabs";

const ALL = { hasScopes: true, canEditBranding: true, canManageDirectory: true };

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

  // Every tab is either a section of a workspace or one of the instance-wide items.
  // A tab that is neither would be reachable by URL and rendered by nothing.
  //
  // The list is asserted WHOLE rather than by membership, so adding a tab without
  // giving it somewhere to render fails here instead of at runtime -- which is how
  // this case earned its place.
  it("leaves exactly the instance-wide items over, so the nav has no gap", () => {
    expect(TAB_KEYS.filter((k) => !SECTION_TABS.includes(k))).toEqual([
      "branding",
      "directory",
    ]);
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
    const brandingOnly = { hasScopes: false, canEditBranding: true, canManageDirectory: false };
    for (const tab of TAB_KEYS) {
      expect(resolveRailItem(tab, brandingOnly)).toBe("branding");
    }
  });

  it("never returns an item that is not available, except with no authority at all", () => {
    for (const hasScopes of [false, true]) {
      for (const canEditBranding of [false, true]) {
        for (const canManageDirectory of [false, true]) {
          const a = { hasScopes, canEditBranding, canManageDirectory };
          const items = railItems(a);
          if (items.length === 0) continue; // the screen shows "no admin access"
          for (const tab of TAB_KEYS) {
            expect(items).toContain(resolveRailItem(tab, a));
          }
        }
      }
    }
  });
});

// The bug this covers shipped: clicking Directory in the menu opened the agents
// column instead. The handler asked "is this branding?" and treated everything
// else as workspaces, so a third root row was routed into the second one's arm.
describe("rootSelection", () => {
  it("sends each root row to its own tab", () => {
    expect(rootSelection("root:branding", null)).toEqual({ tab: "branding" });
    expect(rootSelection("root:directory", null)).toEqual({ tab: "directory" });
  });

  // THE REGRESSION, stated as its own case: the directory must not resolve to a
  // workspace section, whatever section was last open.
  it("does not fall back to the last workspace section for the directory", () => {
    expect(rootSelection("root:directory", "secrets")).toEqual({ tab: "directory" });
  });

  it("restores the last section when returning to workspaces", () => {
    expect(rootSelection("root:agents", "secrets")).toEqual({ tab: "secrets" });
  });

  // Null deletes the parameter, which lands on the default -- right for a caller
  // who has not been in a section yet.
  it("clears the tab when there is no section to return to", () => {
    expect(rootSelection("root:agents", null)).toEqual({ tab: null });
  });

  // Writing nothing, rather than guessing. A row this does not know about would
  // otherwise be routed somewhere nobody chose -- exactly how the directory ended
  // up on the agents column.
  it("writes nothing for a row it does not know", () => {
    expect(rootSelection("root:something-new", "secrets")).toBeNull();
    expect(rootSelection("agent:alpha", null)).toBeNull();
  });
});
