import { describe, it, expect } from "vitest";
import {
  canSave,
  initialMode,
  insertTab,
  outcomeFor,
  outcomeForError,
  saveLabel,
} from "./instance-config-state";
import { adminCopy } from "@/lib/i18n/admin";
import type { InstanceConfigWrite } from "@/lib/admin";
import type { JsonValue } from "./json-tree";

function write(over: Partial<InstanceConfigWrite>): InstanceConfigWrite {
  return {
    raw: "{}",
    valid: true,
    size: 2,
    modifiedAt: "2026-07-28T00:00:00Z",
    revision: "sha256:new",
    managedPaths: ["agents.defaults.model_name", "model_list"],
    reapplied: { ok: true },
    ...over,
  };
}

describe("initialMode", () => {
  it("opens a broken document in raw — the only view that can show a syntax error", () => {
    expect(initialMode(false)).toBe("raw");
  });

  it("opens a valid document in the tree", () => {
    expect(initialMode(true)).toBe("tree");
  });
});

describe("canSave", () => {
  it("blocks a document the proxy would reject, before the round-trip", () => {
    expect(canSave({ parsedOk: false, dirty: true, saving: false })).toBe(false);
  });

  it("blocks an unchanged document and one already in flight", () => {
    expect(canSave({ parsedOk: true, dirty: false, saving: false })).toBe(false);
    expect(canSave({ parsedOk: true, dirty: true, saving: true })).toBe(false);
  });

  it("allows a changed, valid document", () => {
    expect(canSave({ parsedOk: true, dirty: true, saving: false })).toBe(true);
  });
});

describe("outcomeFor", () => {
  const submitted = { agents: { defaults: { model_name: "main" } } } as JsonValue;

  it("reports a plain save when the document landed as sent", () => {
    const res = write({ raw: JSON.stringify(submitted) });
    expect(outcomeFor(res, submitted)).toEqual({ kind: "saved" });
  });

  it("names the managed paths the proxy re-established", () => {
    // The admin edited a key the proxy owns; the response carries the proxy's
    // value. Saying "saved" alone would let a reverted edit look like it stuck.
    const res = write({
      raw: JSON.stringify({ agents: { defaults: { model_name: "registry-owned" } } }),
    });
    expect(outcomeFor(res, submitted)).toEqual({
      kind: "managedReverted",
      paths: ["agents.defaults.model_name"],
    });
  });

  it("reports a failed re-apply as a save that needs follow-up, not a failure", () => {
    const res = write({ reapplied: { ok: false, detail: "no active model" } });
    expect(outcomeFor(res, submitted)).toEqual({
      kind: "reapplyFailed",
      detail: "no active model",
    });
    // The copy has to say the configuration IS saved, or an admin re-edits a file
    // that already changed.
    for (const locale of ["en", "pt"] as const) {
      expect(adminCopy[locale].instanceConfig.reapplyFailed.toLowerCase()).toMatch(
        /saved|salvo/,
      );
    }
  });

  it("prefers the re-apply failure over a reverted path — it is the actionable one", () => {
    const res = write({
      raw: JSON.stringify({ agents: { defaults: { model_name: "registry-owned" } } }),
      reapplied: { ok: false, detail: "boom" },
    });
    expect(outcomeFor(res, submitted).kind).toBe("reapplyFailed");
  });

  it("does not claim a revert when the saved document cannot be parsed back", () => {
    const res = write({ raw: "{broken", valid: false });
    expect(outcomeFor(res, submitted)).toEqual({ kind: "saved" });
  });
});

describe("outcomeForError", () => {
  it("gives a stale revision its own outcome so nothing is retried", () => {
    expect(outcomeForError("stale_revision")).toEqual({ kind: "stale" });
    // The copy must say nothing was written, so an admin does not assume a
    // partial save.
    expect(adminCopy.en.instanceConfig.staleRevision).toMatch(/nothing was written/i);
  });

  it("passes any other code through for the shared error dictionary", () => {
    expect(outcomeForError("forbidden")).toEqual({ kind: "error", code: "forbidden" });
  });
});

describe("saveLabel", () => {
  // The policy control above the button is a preference, and restart-control
  // already learned that an admin reads a mode as a command. The button has to say
  // what it will actually do.
  it("names the delivery in the button", () => {
    const copy = { saveAndRestart: "Save and restart now", saveAndNotify: "Save and notify" };
    expect(saveLabel("now", copy)).toBe(copy.saveAndRestart);
    expect(saveLabel("notice", copy)).toBe(copy.saveAndNotify);
  });

  it("has copy in both locales that states the action, not the setting", () => {
    for (const locale of ["en", "pt"] as const) {
      const c = adminCopy[locale].instanceConfig;
      expect(c.saveAndRestart).not.toBe(c.save);
      expect(c.saveAndNotify).not.toBe(c.save);
      // And an explicit restart action exists, because a broken instance's member
      // cannot press their own button.
      expect(c.restartNow).toBeTruthy();
      expect(c.restartHint).toBeTruthy();
    }
  });
});

describe("insertTab", () => {
  it("inserts two spaces and reports where the caret goes", () => {
    expect(insertTab("{}", 1, 1)).toEqual({ text: "{  }", caret: 3 });
  });

  it("replaces a selection rather than appending to it", () => {
    expect(insertTab("{abc}", 1, 4)).toEqual({ text: "{  }", caret: 3 });
  });
});
