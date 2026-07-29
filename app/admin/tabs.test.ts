import { describe, it, expect } from "vitest";
import {
  DEFAULT_TAB,
  SECTION_TABS,
  TAB_KEYS,
  availableModes,
  parseTab,
  resolveMode,
} from "./tabs";

const NONE = { hasScopes: false, hasSubscriptions: false, canEditBranding: false };
const ALL = { hasScopes: true, hasSubscriptions: true, canEditBranding: true };

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

// Members used to be a section beside Files and Secrets, with the screen snapping the
// scope to a subscription whenever it became active. It is a MODE now: a member list
// belongs to a subscription whatever agents that subscription runs, so putting it
// under an agent would have meant filtering by a selection it does not depend on.
describe("SECTION_TABS", () => {
  it("is the sections of an agent", () => {
    expect(SECTION_TABS).toEqual(["files", "secrets", "skills", "persona", "model"]);
  });

  it("holds neither mode", () => {
    expect(SECTION_TABS).not.toContain("members");
    expect(SECTION_TABS).not.toContain("branding");
  });

  it("only names tabs that exist", () => {
    for (const t of SECTION_TABS) {
      expect(TAB_KEYS).toContain(t);
    }
  });

  // Every tab is either a section or a mode. A tab that is neither would be
  // reachable by URL and rendered by nothing.
  it("leaves exactly the two modes over, so the nav has no gap", () => {
    expect(TAB_KEYS.filter((k) => !SECTION_TABS.includes(k))).toEqual(["members", "branding"]);
  });
});

describe("availableModes", () => {
  it("offers nothing to a caller with no authority at all", () => {
    expect(availableModes(NONE)).toEqual([]);
  });

  it("offers all three when the caller holds all three", () => {
    expect(availableModes(ALL)).toEqual(["agents", "members", "branding"]);
  });

  // A tenant manager administers scopes but may manage no subscription directly, and
  // a member list belongs to a subscription.
  it("withholds members from a caller who manages no subscription", () => {
    expect(availableModes({ ...ALL, hasSubscriptions: false })).toEqual(["agents", "branding"]);
  });
});

describe("resolveMode", () => {
  it("honours the tab the URL asks for when the caller may use it", () => {
    expect(resolveMode("branding", ALL)).toBe("branding");
    expect(resolveMode("members", ALL)).toBe("members");
    expect(resolveMode("files", ALL)).toBe("agents");
  });

  // `?tab=` is user-editable. A hand-typed mode the caller cannot use must not
  // render a panel they have no rights to, nor an empty rail.
  it("refuses a mode the caller cannot use", () => {
    expect(resolveMode("branding", { ...ALL, canEditBranding: false })).toBe("agents");
    expect(resolveMode("members", { ...ALL, hasSubscriptions: false })).toBe("agents");
  });

  // The fallback is the caller's first AVAILABLE mode, not a fixed one: landing a
  // branding-only caller on `agents` would give them a gate leading nowhere.
  it("sends a branding-only caller to branding whatever the tab says", () => {
    const brandingOnly = { hasScopes: false, hasSubscriptions: false, canEditBranding: true };
    for (const tab of TAB_KEYS) {
      expect(resolveMode(tab, brandingOnly)).toBe("branding");
    }
  });

  it("never returns a mode that is not available, except with no authority at all", () => {
    for (const hasScopes of [false, true]) {
      for (const hasSubscriptions of [false, true]) {
        for (const canEditBranding of [false, true]) {
          const a = { hasScopes, hasSubscriptions, canEditBranding };
          const modes = availableModes(a);
          if (modes.length === 0) continue; // the screen shows "no admin access"
          for (const tab of TAB_KEYS) {
            expect(modes).toContain(resolveMode(tab, a));
          }
        }
      }
    }
  });
});
