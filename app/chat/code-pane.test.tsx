import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { loadLanguage } from "@/lib/code-highlight";
import CodePane from "./code-pane";

// THE NUMBERED CODE AREA, and the property the whole rewrite exists for: a number belongs
// to a LINE, not to a row of text. The pane used to be two sibling `<pre>` elements that
// stayed aligned only because those two were the same thing — which they stop being the
// moment a line wraps.
//
// Rendered rather than read as source. The correspondence between numbers and lines is a
// claim about the markup, and a source assertion can only ever say the intent is written
// down somewhere.

beforeAll(async () => {
  // So the highlighted path below is actually exercised. Without it `highlight` returns
  // null and every case here would silently test the plain fallback.
  await loadLanguage("yaml");
});

const YAML = "root:\n  key: value\n  list:\n    - one";

function render(over: Partial<Parameters<typeof CodePane>[0]> = {}) {
  return renderToStaticMarkup(
    <CodePane code={YAML} language="yaml" wrap={false} {...over} />,
  );
}

describe("the numbered code pane", () => {
  const numbers = (html: string) =>
    [...html.matchAll(/data-line="(\d+)"/g)].map((m) => m[1]);

  it("draws one number per line, in order", () => {
    expect(numbers(render())).toEqual(["1", "2", "3", "4"]);
  });

  // The number is `content: attr(data-line)` on a pseudo-element, so it is in no text
  // node — which is what keeps a selection dragged down the file pasting as the code and
  // nothing else. `user-select: none` would only have been a claim about what three
  // browsers do with the clipboard.
  it("keeps the numbers out of the document's text, not merely out of a selection", () => {
    const html = render();
    expect(html).toContain("before:content-[attr(data-line)]");
    expect(html).toContain("select-none");
    expect(html, "a number in a text node lands in the clipboard").not.toMatch(/>\s*1\s*</);
  });

  // The defect the old architecture could not survive: the number and its line are in the
  // same grid row now, so a line that takes three rows still has exactly one number and
  // everything below it stays put.
  it("puts the number and its line in one row rather than in two columns", () => {
    const html = render();
    const firstNumber = html.indexOf('data-line="1"');
    const firstLine = html.indexOf("root:");
    const secondNumber = html.indexOf('data-line="2"');
    expect(firstNumber).toBeLessThan(firstLine);
    expect(firstLine).toBeLessThan(secondNumber);
  });

  it("counts a file's last line once, with no trailing empty row", () => {
    expect(numbers(render({ code: "one\ntwo\n" }))).toEqual(["1", "2"]);
  });

  // preview-formatting-and-odf DEC-2 stands as the DEFAULT: a YAML's columns carry
  // meaning, so the pane scrolls until the member says otherwise.
  it("scrolls rather than wrapping unless asked", () => {
    const html = render();
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("whitespace-pre");
    expect(html).not.toContain("whitespace-pre-wrap");
  });

  it("wraps on request, and breaks inside a word that has no other break", () => {
    const html = render({ wrap: true });
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("break-words");
  });

  // Two utilities of one property on one element are resolved by the order Tailwind
  // EMITS them, not by the order they appear in the class string — invisible to tsc and
  // to any behavioural test. The two values are mutually exclusive for that reason.
  it("never carries both white-space values at once", () => {
    for (const wrap of [true, false]) {
      const cells = render({ wrap }).match(/class="[^"]*whitespace[^"]*"/g) ?? [];
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(cell.includes("whitespace-pre-wrap") && cell.includes("whitespace-pre ")).toBe(
          false,
        );
      }
    }
  });

  it("holds the numbers in view when a long line scrolls the pane sideways", () => {
    expect(render()).toContain("sticky left-0");
  });

  // The escaping is the security boundary of the whole feature. A file of an unknown
  // grammar takes the un-highlighted path, which renders React children and never
  // innerHTML — and the highlighted path is output highlight.js has already escaped.
  it("escapes the file rather than injecting it, highlighted or not", () => {
    const evil = "<script>alert(1)</script>";
    for (const language of ["yaml", null]) {
      const html = renderToStaticMarkup(
        <CodePane code={evil} language={language} wrap={false} />,
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("still colours the file it split", () => {
    expect(render()).toContain("hljs-");
  });

  // One declaration on the container both columns inherit from. It was two — the same
  // `0.85em` written on the gutter and on the `<code>` inside the other column — which
  // reads like one size and is not: a line box is at least as tall as its block's strut,
  // and the strut follows that block's own font-size, so the code ran 15% taller than its
  // numbers and the columns drifted apart down the file.
  it("declares the type once, absolutely", () => {
    const src = readFileSync(new URL("./code-pane.tsx", import.meta.url), "utf8");
    const decl = /export const CODE_TYPE = "([^"]+)"/.exec(src)?.[1] ?? "";
    expect(decl).toMatch(/text-\[\d+px\]/);
    expect(decl).toMatch(/leading-\[\d+px\]/);
    expect(decl).not.toContain("em]");
  });
});
