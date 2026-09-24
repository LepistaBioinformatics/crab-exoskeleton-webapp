import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE CLIENT AND THE BFF ARE ONE LIST, AND NOTHING WAS SAYING SO.
//
// `lib/mangrove.ts` reaches the proxy through `/api/mangrove/<action>`, and that
// route answers an unknown segment with a 404 of its own rather than forwarding
// it. That is the right shape -- a closed set, refused here rather than upstream
// -- and it has one cost: the two lists can disagree, and the disagreement looks
// exactly like the feature being broken somewhere else entirely.
//
// It already cost once. `admit` became `read` across the client, the proxy route
// and the mangrove itself, and this allow-list was missed. Every receipt 404'd at
// one line of a file nobody had reason to open: the unread mark cleared
// optimistically, the POST failed, the caller swallowed it, and the feed came back
// unread on the next load. Three services had been changed correctly.
//
// Source-based, like `pane-ground.test.ts`. Both halves are literals -- a `call()`
// with a string, and a key in a record -- so there is nothing to import and run,
// and a test that imported the route would drag half of Next into a node-env suite
// to learn what one regex already knows.

const ROOT = join(__dirname, "..", "..", "..");
const src = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The action each `call("x", ...)` in the client names. */
function clientActions(): string[] {
  const code = src("lib/mangrove.ts");
  return [...code.matchAll(/\bcall\s*<[^>]*>\s*\(\s*"([a-z-]+)"/g), ...code.matchAll(/\bcall\s*\(\s*"([a-z-]+)"/g)]
    .map((m) => m[1])
    .filter((v, i, xs) => xs.indexOf(v) === i)
    .sort();
}

/** The actions the BFF will forward. */
function routeActions(): string[] {
  const code = src("app/api/mangrove/[action]/route.ts");
  const block = /const ACTIONS: Record<string, "GET" \| "POST"> = \{([\s\S]*?)\n\};/.exec(code);
  if (!block) throw new Error("the ACTIONS record moved; this test reads it by shape");
  return [...block[1].matchAll(/^\s{2}([a-z-]+):\s*"(?:GET|POST)"/gm)].map((m) => m[1]).sort();
}

describe("the mangrove's action list", () => {
  // Found at all, first. Both readers are regexes over source, and a regex that
  // matches nothing would make every assertion below vacuously true.
  it("is read from both sides", () => {
    expect(clientActions().length, "no call() found in lib/mangrove.ts").toBeGreaterThan(3);
    expect(routeActions().length, "no ACTIONS record found in the route").toBeGreaterThan(3);
  });

  it("forwards every action the client asks for", () => {
    const allowed = new Set(routeActions());
    const missing = clientActions().filter((a) => !allowed.has(a));
    expect(
      missing,
      `the client calls ${missing.join(", ")}, which the BFF answers with its own 404`,
    ).toEqual([]);
  });

  // THE OTHER DIRECTION IS A LEAK, not a break. An action nobody calls is a path
  // through the session and into the proxy that exists for no reason -- which is
  // how `admit` survived its own deletion everywhere else.
  it("forwards nothing the client does not ask for", () => {
    const wanted = new Set(clientActions());
    const extra = routeActions().filter((a) => !wanted.has(a));
    expect(extra, `${extra.join(", ")} is reachable and uncalled`).toEqual([]);
  });
});
