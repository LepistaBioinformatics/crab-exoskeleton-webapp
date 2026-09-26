import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// THE EXACT INVERSE OF `workspace-panel-scope.test.ts`, and that is why it is a file
// rather than a line.
//
// That test enforces an invariant four panels got wrong in the same way: a workspace
// panel addresses a DIRECTORY, `workspace.p` is part of which one, and an effect keyed
// on the workspace but not on the project re-renders without re-fetching. Skills are
// the one case where the opposite is correct — the harness's loader is fixed on the
// main workspace at boot, so a skill written into `workspace-<id>/skills` is read by
// nothing (backend DEC-5) and a project-scoped skills panel would let a member write
// inert files and be told they had saved.
//
// So this panel is deliberately NOT in that test's `PANELS` list. An exception with no
// test of its own is indistinguishable from the bug that test was written to catch,
// which is exactly what the spec asked for here.
//
// Source-based for the same reason its sibling is: the suite runs `environment:
// "node"`, no effect fires, and a render test cannot observe a re-fetch that did or
// did not happen.

const SOURCE = readFileSync(resolve(__dirname, "skills-panel.tsx"), "utf8");

/** Class strings and code only — this file argues about the project at length. */
const CODE = SOURCE.split("\n")
  .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
  .join("\n");

/** Every hook dependency array, as raw text. Matched as the sibling test matches them. */
function dependencyArrays(source: string): string[] {
  return [...source.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)].map((m) => m[1]);
}

describe("the skills panel is keyed on the workspace and not on the project", () => {
  const scoped = dependencyArrays(CODE).filter((deps) => deps.includes("workspace.t"));

  // Zero would mean the regex stopped matching rather than that the panel stopped
  // reading the workspace, and a guard that silently checks nothing is worse than
  // none. The sibling test makes the same check for the same reason.
  it("has workspace-keyed effects at all", () => {
    expect(scoped.length).toBeGreaterThan(0);
  });

  it("re-runs none of them when only the project changes", () => {
    for (const deps of scoped) {
      expect(deps, "a skills effect is keyed on the project it must not read").not.toContain(
        "workspace.p",
      );
    }
  });

  // THE DEPENDENCY LIST IS ONLY HALF OF IT. A panel that read `workspace.p` anywhere —
  // to put it in a query, to label the pane, to decide anything — would be scoping by
  // a project the harness cannot see, whatever its effects re-run on.
  it("never reads the project at all", () => {
    expect(CODE).not.toContain("workspace.p");
  });
});
