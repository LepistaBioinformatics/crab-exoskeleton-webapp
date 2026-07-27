import { describe, it, expect } from "vitest";
import { RESTART_REASONS, reasonText } from "./restart";
import { chatCopy } from "./i18n/chat";
import { DEFAULT_POLICY, policyIsValid, policyParams, withPolicy } from "./restartPolicy";

describe("reasonText", () => {
  // Both locales, because a missing key shows up as undefined rather than as a
  // type error once the dictionary is indexed by a runtime string.
  for (const locale of ["en", "pt"] as const) {
    const copy = chatCopy[locale].restart;

    it(`has a distinct phrase for every reason the proxy can send (${locale})`, () => {
      const texts = RESTART_REASONS.map((r) => reasonText(copy, r));
      expect(new Set(texts).size).toBe(RESTART_REASONS.length);
      for (const t of texts) expect(t.length).toBeGreaterThan(0);
    });

    it(`falls back to something true when the proxy grows a new reason (${locale})`, () => {
      // A newer proxy shipping an enum value this build has not learned about
      // must not render an empty banner.
      expect(reasonText(copy, "something-new")).toBe(copy.reasonUnknown);
      expect(reasonText(copy, undefined)).toBe(copy.reasonUnknown);
    });
  }
});

describe("policyParams", () => {
  it("sends nothing for the default, so URLs stay as they were", () => {
    // Absent means "now" at the proxy — this is what keeps the change additive.
    expect(policyParams(DEFAULT_POLICY).toString()).toBe("");
  });

  it("sends the mode for notice", () => {
    const q = policyParams({ mode: "notice" });
    expect(q.get("restart")).toBe("notice");
    expect(q.get("restart_at")).toBeNull();
  });

  it("converts the admin's local time to an unambiguous UTC instant", () => {
    const at = "2030-01-02T03:04";
    const q = policyParams({ mode: "schedule", at });
    expect(q.get("restart")).toBe("schedule");
    expect(q.get("restart_at")).toBe(new Date(at).toISOString());
  });

  it("carries a note when there is one", () => {
    expect(policyParams({ mode: "notice", note: "key rotation" }).get("restart_note")).toBe(
      "key rotation",
    );
  });
});

describe("policyIsValid", () => {
  it("accepts now and notice unconditionally", () => {
    expect(policyIsValid({ mode: "now" })).toBe(true);
    expect(policyIsValid({ mode: "notice" })).toBe(true);
  });

  it("rejects a schedule with no time, or one in the past", () => {
    expect(policyIsValid({ mode: "schedule" })).toBe(false);
    expect(policyIsValid({ mode: "schedule", at: "2000-01-01T00:00" })).toBe(false);
    expect(policyIsValid({ mode: "schedule", at: "not a date" })).toBe(false);
  });

  it("accepts a future schedule", () => {
    const soon = new Date(Date.now() + 3600_000);
    // datetime-local shape: no seconds, no zone.
    const at = soon.toISOString().slice(0, 16);
    expect(policyIsValid({ mode: "schedule", at })).toBe(true);
  });
});

describe("withPolicy", () => {
  it("leaves a URL untouched for the default policy", () => {
    expect(withPolicy("/api/admin/skills", DEFAULT_POLICY)).toBe("/api/admin/skills");
  });

  it("uses ? or & depending on what the URL already has", () => {
    expect(withPolicy("/api/x", { mode: "notice" })).toBe("/api/x?restart=notice");
    expect(withPolicy("/api/x?a=1", { mode: "notice" })).toBe("/api/x?a=1&restart=notice");
  });
});
