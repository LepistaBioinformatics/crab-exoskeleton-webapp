import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE TEST THAT WOULD HAVE CAUGHT THE DELETION, which is a different test from the one
// covering the rule.
//
// The lone-workspace shortcut shipped in 2026-07 and was deleted in 2026-09 as collateral
// of the shell redesign. What broke was not the arithmetic -- `planLeaves`, the helper it
// counted with, survived the deletion untouched and its test still passes to this day,
// under a name describing a shortcut that no longer existed. THE CALLER WAS DELETED, and
// nothing pinned the caller.
//
// `workspace-grid.test.tsx` covers `loneWorkspace` and would survive the same deletion
// just as happily. So this file asserts over SOURCE TEXT that the shell still calls it,
// on the grounds `pane-weight.test.ts` records for the same technique: a defect that is
// invisible to tsc and to every behavioural test needs something that reads the file.
//
// The alternative -- mounting `ChatShell` -- means standing up the fragment, four fetch
// hooks and the router to observe one hash write, and a suite that heavy is a suite that
// gets skipped.

const ROOT = join(__dirname, "..", "..");
const shell = readFileSync(join(ROOT, "app/chat/chat-shell.tsx"), "utf8");
const picker = readFileSync(join(ROOT, "app/chat/workspace-grid.tsx"), "utf8");

/** Real code only: a comment describing a call is not a call. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("the lone-workspace shortcut is wired up", () => {
  it("has the shell consult the rule", () => {
    expect(code(shell), "chat-shell.tsx no longer calls loneWorkspace").toContain(
      "loneWorkspace(",
    );
  });

  it("has the shell act on it by entering the workspace", () => {
    expect(code(shell), "chat-shell.tsx no longer calls enterWorkspace").toContain(
      "enterWorkspace(",
    );
  });

  // THE PLACEMENT IS THE REQUIREMENT, not a preference, so it is pinned too.
  //
  // The picker is the obvious home for this and it is the wrong one. The way back to the
  // picker is the breadcrumb root, which calls `clearWorkspace`, which empties the hash —
  // so the picker REMOUNTS and a one-shot ref inside it resets. A member with one
  // workspace would be thrown straight forward again every time they tried to get back,
  // which is the failure the original spec's R4.3 was written to prevent. ChatShell is
  // mounted for the session; its ref is not reset by the trip back.
  it("does not let the picker own the shortcut, where the guard would reset", () => {
    expect(
      code(picker),
      "workspace-grid.tsx remounts on the way back, so a one-shot guard in it resets",
    ).not.toContain("loneWorkspace");
  });
});
