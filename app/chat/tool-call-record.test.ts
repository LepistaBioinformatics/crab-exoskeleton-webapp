import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opensRecord, type TurnEvent } from "./message-rows";
import { prettyArguments } from "./tool-call-sheet";

const ROOT = join(__dirname, "..", "..");
const src = (path: string) => readFileSync(join(ROOT, path), "utf8");

const ev = (over: Partial<TurnEvent> = {}): TurnEvent => ({ kind: "tool", ...over });

describe("which rows open a record", () => {
  it("opens a tool call that has one", () => {
    expect(opensRecord(ev({ audit_id: "1727-00" }))).toBe(true);
  });

  // THE COMMON CASE, and it is not a failure. Every conversation older than the
  // record has no id, and so does every one under a harness that writes none.
  it("does not open a tool call with no record", () => {
    expect(opensRecord(ev())).toBe(false);
  });

  // These have no command and no output to show, so a sheet would open on two
  // empty sections.
  it.each(["model", "depth", "subagent", "compact"])(
    "does not open a %s event even when one carries an id",
    (kind) => {
      expect(opensRecord(ev({ kind, audit_id: "1727-00" }))).toBe(false);
    },
  );

  // An empty string is what a failed write leaves behind: the harness returns ""
  // from putAudit rather than the id it minted, precisely so no event names a
  // record that is not there.
  it("does not open on an empty id", () => {
    expect(opensRecord(ev({ audit_id: "" }))).toBe(false);
  });
});

// THE CLIENT AND THE BFF MUST NAME THE SAME THINGS, and nothing links them.
//
// `mangrove-actions.test.ts` records what this costs when it goes wrong: a
// rename landed in three services and missed one route, every call 404'd, and
// the failure looked like the feature being broken somewhere else. The same
// shape is available here -- the sheet builds a query, the route reads one, and
// a parameter renamed on one side alone would answer `invalid_request` forever.
describe("the sheet and its route agree", () => {
  const sheet = src("app/chat/tool-call-sheet.tsx");
  const route = src("app/api/chat/[instance]/tool-call/route.ts");

  it("asks for the path the route is served at", () => {
    expect(sheet).toContain("/tool-call?");
  });

  it("sends every parameter the route requires", () => {
    // What the route refuses to work without.
    const required = [...route.matchAll(/searchParams\.get\("([a-z_]+)"\)/g)]
      .map((m) => m[1])
      .filter((p) => route.includes(`!${camel(p)}`));
    expect(required.length, "the route's guard no longer matches this pattern").toBeGreaterThan(0);
    for (const param of required) {
      expect(sheet, `the sheet never sends ${param}`).toContain(`${param}:`);
    }
  });

  // The proxy answers `recorded: false` for an absent record rather than a 404,
  // so a client testing only `res.ok` would render an empty command and call it
  // a success.
  it("reads the recorded flag rather than assuming a 200 means a record", () => {
    expect(sheet).toContain("recorded");
    expect(route).toContain("recorded");
  });
});

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// A provider sends the arguments as ONE LINE, so the interesting part of a call
// arrives buried in the middle of a run of text.
describe("the command, indented", () => {
  it("indents an object", () => {
    expect(prettyArguments('{"command":"ls -la","timeout":30}')).toBe(
      '{\n  "command": "ls -la",\n  "timeout": 30\n}',
    );
  });

  it("indents a nested object rather than flattening it", () => {
    expect(prettyArguments('{"a":{"b":[1,2]}}')).toBe(
      '{\n  "a": {\n    "b": [\n      1,\n      2\n    ]\n  }\n}',
    );
  });

  // A SYSTEM BOUNDARY. The string is whatever the model emitted, and the harness
  // stores it raw precisely because it does not trust it to be valid JSON.
  // Unparseable is still the best evidence of what ran; blanking it would throw
  // away the only record on exactly the calls most worth looking at.
  it("hands back something unparseable unchanged", () => {
    expect(prettyArguments('{"command": "ls" ,,,')).toBe('{"command": "ls" ,,,');
  });

  it("is empty for an absent argument string", () => {
    expect(prettyArguments(undefined)).toBe("");
    expect(prettyArguments("")).toBe("");
  });

  // Not an object, but valid JSON, and it must not be mistaken for a failure.
  it("passes a bare JSON scalar through the formatter", () => {
    expect(prettyArguments('"just a string"')).toBe('"just a string"');
  });
});

// THE NEWLINES ARE THE INFORMATION. CodeBlock renders a bare <code>, and HTML
// collapses the newlines inside one -- so a directory listing came back as a
// single paragraph. In a transcript react-markdown supplies the <pre>, which is
// why the omission is invisible there and was invisible here.
describe("the sheet preserves line structure", () => {
  const sheet = src("app/chat/tool-call-sheet.tsx");

  it("wraps its code blocks in a pre", () => {
    expect(sheet).toMatch(/<pre[^>]*whitespace-pre-wrap/);
  });

  it("does not render a CodeBlock outside one", () => {
    // Every CodeBlock in this file is inside `Block`, which is the only place
    // the <pre> lives.
    expect(sheet.match(/<CodeBlock/g) ?? []).toHaveLength(1);
  });
});
