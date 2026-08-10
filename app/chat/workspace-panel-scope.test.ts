import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The workspace panels address a DIRECTORY, and `workspace.p` is part of which one.
// Every one of them passed the project on the request and then left it out of the
// effect's dependency list, so entering or leaving a project re-rendered the panel
// without re-fetching: the files tree went on showing the agent's own uploads inside a
// project, and the project's memory, graph and schedule were never asked for.
//
// This reads the SOURCE rather than rendering, deliberately. The suite runs
// `environment: "node"`, where no effect fires at all, so a render test cannot observe
// a re-fetch; and the invariant is not really about React's behaviour but about a list
// of dependencies that four components got wrong in the same way. What it proves is
// narrow and worth stating: an effect keyed on the workspace is also keyed on the
// project. It cannot prove the fetch itself is scoped — lib/media.test.ts and
// app/api/media/project-forwarding.test.ts cover that half.

const PANELS = [
  "uploads-sidebar.tsx",
  "memory-editor.tsx",
  "memory-graph-panel.tsx",
  "scheduled-tasks-panel.tsx",
];

/**
 * Every `useEffect`/`useCallback` dependency array in a file, as raw text.
 *
 * Matched on the closing `}, [ ... ]);` that ends a hook call, which is the only place
 * these components write a bracketed list at that indentation. A dependency array
 * spanning several lines is still one match, because the pattern crosses newlines.
 */
function dependencyArrays(source: string): string[] {
  return [...source.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)].map((m) => m[1]);
}

describe("workspace panels re-fetch when the project changes", () => {
  for (const file of PANELS) {
    it(`${file} keys every workspace-scoped effect on the project`, () => {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      const scoped = dependencyArrays(source).filter((deps) =>
        deps.includes("workspace.t"),
      );

      // If this is zero the regex stopped matching, not that the component stopped
      // reading the workspace — and a guard that silently checks nothing is worse than
      // no guard.
      expect(scoped.length).toBeGreaterThan(0);

      for (const deps of scoped) {
        expect(deps, `a workspace-keyed effect in ${file} omits workspace.p`).toContain(
          "workspace.p",
        );
      }
    });
  }
});
