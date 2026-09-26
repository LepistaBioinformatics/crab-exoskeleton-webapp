import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE ONE PARAMETER THESE ROUTES MUST NOT FORWARD.
//
// Every other workspace route carries `project`, and `lib/proxyRead.ts` forwards it
// unconditionally with a comment arguing that it names WHICH workspace directory a
// read addresses — exactly like tenant_id and subs_acc_id beside it. That argument is
// right for files, memory, the graph and the schedule, and wrong here: the harness's
// skill loader is fixed on the main workspace at boot (backend DEC-5), so a skill
// written into `workspace-<id>/skills` is read by nothing. A member would save a file,
// be told it landed, and their agent would never change.
//
// So this is the inverse of `workspace-panel-scope.test.ts`, which pins that the other
// panels ARE keyed on the project. An exception with no test of its own is
// indistinguishable from the bug that test was written to catch — which is why the
// spec asked for this one by name rather than leaving it to be noticed.
//
// Source-based, in the idiom of `mangrove-actions.test.ts`: the suite runs
// `environment: "node"` and importing a route drags half of Next in to learn what one
// regex already knows.

const ROOT = join(__dirname, "..", "..", "..");
const ROUTES = [
  "app/api/skills/route.ts",
  "app/api/skills/doc/route.ts",
  "app/api/skills/files/route.ts",
];

/**
 * A file's source with its comments removed.
 *
 * This repo argues in comments, and both routes argue at length about the parameter
 * they refuse to send — so a test matching raw source would fail on the very
 * explanation of why it passes.
 */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the member-skills routes", () => {
  // Found at all, first. Both assertions below are absences, and an absence is
  // vacuously true of a file that was never read.
  it("are read, and are the routes rather than a re-export", () => {
    for (const path of ROUTES) {
      expect(code(path), `${path} does not call the gateway`).toContain("fetchMycelium");
    }
  });

  it("never names the project, in a query, a body or a read", () => {
    for (const path of ROUTES) {
      expect(code(path), `${path} mentions the project`).not.toMatch(/project/i);
    }
  });

  // THE SECOND WAY TO FORWARD IT IS TO SAY NOTHING. `proxyRead` and `proxyWrite` both
  // set `project` themselves, so a route delegating to either passes the assertion
  // above while sending the parameter — which is the mistake the spec singled out.
  it("do not delegate to the helper that forwards it for them", () => {
    for (const path of ROUTES) {
      expect(code(path), `${path} routes through lib/proxyRead`).not.toContain("proxyRead");
    }
  });
});
