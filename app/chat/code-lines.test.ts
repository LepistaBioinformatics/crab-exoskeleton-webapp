import { describe, it, expect } from "vitest";
import { splitHighlightedLines } from "./code-lines";

// The one hard case, and the reason the pane used to refuse to do this at all: a span
// that crosses a newline. Everything else here is bookkeeping around it.
describe("splitting highlighted code into lines", () => {
  it("returns one entry per line", () => {
    expect(splitHighlightedLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a trailing empty line, which is a line the file has", () => {
    expect(splitHighlightedLines("a\n")).toEqual(["a", ""]);
  });

  it("leaves a single line untouched", () => {
    expect(splitHighlightedLines('<span class="hljs-keyword">const</span> x')).toEqual([
      '<span class="hljs-keyword">const</span> x',
    ]);
  });

  // A block comment or a template literal. Cut naively, line one would be missing its
  // closing tag and line two would start with a stray `</span>` — the browser repairs
  // both, silently, into colouring that bleeds down the file.
  it("closes a span that crosses a break and reopens it on the next line", () => {
    const html = '<span class="hljs-comment">/* one\ntwo */</span> x';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="hljs-comment">/* one</span>',
      '<span class="hljs-comment">two */</span> x',
    ]);
  });

  it("reopens every level of a nest, innermost last", () => {
    const html = '<span class="a"><span class="b">one\ntwo</span></span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a"><span class="b">one</span></span>',
      '<span class="a"><span class="b">two</span></span>',
    ]);
  });

  it("closes nothing at a break outside every span", () => {
    const html = '<span class="a">one</span>\n<span class="b">two</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a">one</span>',
      '<span class="b">two</span>',
    ]);
  });

  // The escaping is the security boundary. This function must copy text through rather
  // than decode it: a `&lt;` that came back as `<` would be an injection the highlighter
  // had already prevented.
  it("carries escaped markup through without decoding it", () => {
    const html = "&lt;script&gt;alert(1)&lt;/script&gt;\nnext";
    expect(splitHighlightedLines(html)[0]).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("does not lose a newline that falls between two tags", () => {
    expect(splitHighlightedLines('<span class="a">x</span>\n\n<span class="b">y</span>')).toEqual([
      '<span class="a">x</span>',
      "",
      '<span class="b">y</span>',
    ]);
  });

  it("survives truncated markup rather than dropping the rest of the file", () => {
    expect(splitHighlightedLines("a\n<span class=")).toEqual(["a", "<span class="]);
  });
});
