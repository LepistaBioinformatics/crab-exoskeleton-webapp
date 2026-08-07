import { describe, it, expect } from "vitest";
import { formatToolBody, MAX_FORMATTED_BYTES } from "./tool-output";

// picoclaw writes tool output as one line. JSON pretty-printed is the thing the member
// opened the run to read; prose formatted as JSON is worse than leaving it alone. So the
// interesting cases are all about DETECTION being wrong in the safe direction.

describe("formatToolBody", () => {
  it("pretty-prints a JSON object and marks it for highlighting", () => {
    const out = formatToolBody('{"query":"iran","count":10}');
    expect(out.text).toBe('{\n  "query": "iran",\n  "count": 10\n}');
    expect(out.className).toBe("language-json");
    expect(out.reformatted).toBe(true);
  });

  it("pretty-prints an array too", () => {
    const out = formatToolBody('[{"a":1},{"b":2}]');
    expect(out.text).toContain("\n");
    expect(out.className).toBe("language-json");
  });

  // A web search comes back as prose. Highlighting it would be confident, meaningless colour.
  it("leaves prose exactly as it came, unhighlighted", () => {
    const prose = "Results for: iran\n1. Wikipedia — Strait of Hormuz";
    const out = formatToolBody(prose);
    expect(out.text).toBe(prose);
    expect(out.className).toBeUndefined();
    expect(out.reformatted).toBe(false);
  });

  // Truncated output is common when a tool is cut off, and it still starts with a brace.
  it("falls back to raw text when something starts like JSON and is not", () => {
    const broken = '{"query":"iran","resu';
    const out = formatToolBody(broken);
    expect(out.text).toBe(broken);
    expect(out.className).toBeUndefined();
  });

  it("does not reformat a bare scalar, which gains nothing", () => {
    for (const scalar of ["123", '"just a string"', "true", "null"]) {
      const out = formatToolBody(scalar);
      expect(out.text, scalar).toBe(scalar);
      expect(out.reformatted, scalar).toBe(false);
    }
  });

  it("passes an empty body through untouched", () => {
    expect(formatToolBody("")).toMatchObject({ text: "", reformatted: false });
    expect(formatToolBody("   ")).toMatchObject({ reformatted: false });
  });

  // Pretty-printing multiplies the size and highlight.js walks the whole string, on the main
  // thread. A tool result that already reaches six figures of bytes is not worth that for
  // output nobody scrolls to the end of.
  it("leaves an oversized body alone rather than formatting it", () => {
    const huge = "[" + '{"k":"v"},'.repeat(MAX_FORMATTED_BYTES / 5) + "{}]";
    expect(huge.length).toBeGreaterThan(MAX_FORMATTED_BYTES);
    const out = formatToolBody(huge);
    expect(out.reformatted).toBe(false);
    expect(out.className).toBeUndefined();
    expect(out.text).toBe(huge);
  });

  it("keeps the original untouched, so nothing is lost when it declines to format", () => {
    const raw = '  {"a":1}  ';
    // Trimming is only for detection — the formatted output comes from the parse, and the
    // declined path must hand back exactly what it was given.
    expect(formatToolBody("not json  ").text).toBe("not json  ");
    expect(formatToolBody(raw).reformatted).toBe(true);
  });
});
