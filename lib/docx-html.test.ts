// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeDocxHtml } from "@/lib/docx-html";

// file-preview-in-pane FR-4.1 / DEC-4. mammoth's output is HTML derived from a file the
// MEMBER supplied, so it is untrusted markup until it is filtered. The whole preview
// feature rests on "nothing a member uploads renders as markup from this origin"
// (lib/media.ts) — a docx pane that injected mammoth's output verbatim would be the
// exception that spends it.
describe("sanitizeDocxHtml", () => {
  it("keeps the document: paragraphs, headings, lists, emphasis, tables", () => {
    const html = sanitizeDocxHtml(
      "<h1>Q2</h1><p>Revenue <strong>up</strong> <em>12%</em></p>" +
        "<ul><li>one</li></ul><table><tr><td>cell</td></tr></table>",
    );
    expect(html).toContain("<h1>Q2</h1>");
    expect(html).toContain("<strong>up</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<td>cell</td>");
  });

  it("drops a script, and keeps its text out too", () => {
    const html = sanitizeDocxHtml("<p>before</p><script>alert(1)</script><p>after</p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("drops event handlers and style, keeping the element", () => {
    const html = sanitizeDocxHtml('<p onclick="steal()" style="position:fixed">text</p>');
    expect(html).toContain("text");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("position:fixed");
  });

  it("keeps an http link and drops a javascript: one", () => {
    expect(sanitizeDocxHtml('<a href="https://example.com">ok</a>')).toContain(
      'href="https://example.com"',
    );
    const bad = sanitizeDocxHtml('<a href="javascript:alert(1)">no</a>');
    expect(bad).toContain("no");
    expect(bad).not.toContain("javascript:");
  });

  // mammoth emits images as data: URIs by default. They are bytes from the same file
  // the member already opened, and an <img> cannot execute — but the src is still
  // constrained to data:image/… so nothing else can ride in on it.
  it("keeps an inline image and refuses any other src", () => {
    expect(sanitizeDocxHtml('<img src="data:image/png;base64,AAA">')).toContain("data:image/png");
    expect(sanitizeDocxHtml('<img src="https://tracker.example/p.gif">')).not.toContain("tracker");
  });

  it("escapes text that looks like markup", () => {
    expect(sanitizeDocxHtml("<p>a &lt; b &amp; c</p>")).toContain("a &lt; b &amp; c");
  });
});
