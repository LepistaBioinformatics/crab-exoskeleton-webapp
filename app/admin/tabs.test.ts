import { describe, it, expect } from "vitest";
import { AGENT_TABS, DEFAULT_TAB, TAB_KEYS, parseTab } from "./tabs";

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

describe("AGENT_TABS", () => {
  it("covers the agent-scoped tabs and excludes the ones that are not", () => {
    // Members addresses users, Branding is instance-wide: neither takes an agent.
    expect(AGENT_TABS).toEqual(["files", "secrets", "skills", "model"]);
    expect(AGENT_TABS).not.toContain("members");
    expect(AGENT_TABS).not.toContain("branding");
  });

  it("only names tabs that exist", () => {
    for (const t of AGENT_TABS) {
      expect(TAB_KEYS).toContain(t);
    }
  });
});
