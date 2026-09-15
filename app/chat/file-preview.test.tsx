import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import FilePreview from "./file-preview";
import MessageContent, { MarkdownImageContext } from "./message-content";
import CodeBlock from "./code-block";
import { chatCopy } from "@/lib/i18n/chat";
import { mediaUrl, resolveMediaRef } from "@/lib/media";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;
const inProject = { ...workspace, p: "proj-1" } as Workspace;

// The suite runs `environment: "node"`, so no effect fires: what is asserted here is
// FIRST PAINT — everything the component decides while rendering. That covers the two
// things worth guarding (the image src, and refusing an oversized body) because both
// are computed in render, not in an effect.
function paint(props: Partial<Parameters<typeof FilePreview>[0]> = {}) {
  return renderToStaticMarkup(
    <FilePreview
      workspace={workspace}
      path="uploads/photo.png"
      name="photo.png"
      kind="image"
      {...props}
    />,
  );
}

describe("FilePreview", () => {
  // file-preview-in-pane FR-2.1: a pane, not a dialog. The panel's header carries the
  // name and the way back; this is the body, and it is labelled so a screen reader
  // still knows what the region is.
  it("is a labelled region, not a modal dialog", () => {
    const html = paint();
    expect(html).toContain(t.preview.aria);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
  });

  // An <img> may point straight at the route (the session is a cookie), so there is no
  // blob and nothing to revoke. The src still has to be the media route, not the raw
  // workspace path.
  it("points the image straight at the media route", () => {
    // Read back out of the attribute: the markup escapes the query's separators as
    // `&amp;`, so a literal comparison against the URL would fail on the escaping
    // rather than on the URL.
    const src = paint().match(/<img src="([^"]+)"/)?.[1];
    expect(src?.replace(/&amp;/g, "&")).toBe(mediaUrl(workspace, "uploads/photo.png"));
  });

  // The defect this layer keeps producing: `project` dropped, so the request reads the
  // agent's own workspace and 404s.
  it("carries the project into the image src", () => {
    const html = paint({ workspace: inProject });
    expect(html).toContain("project=proj-1");
  });

  // The download button moved to the panel's header (one header, not two). One stays
  // inside the PDF fallback, for a browser that cannot show a PDF at all — and it is
  // NOT asserted here: the fallback renders only once the blob effect has resolved,
  // and this suite paints once with no effects. Covered by the pane suite instead.

  // Refused from the LISTING's size, before any request.
  it("refuses a text body above the cap instead of fetching it", () => {
    const html = paint({
      path: "uploads/rows.csv",
      name: "rows.csv",
      kind: "text",
      size: 5 * 1024 * 1024,
    });
    expect(html).toContain(t.preview.tooLarge);
  });

  it("does not refuse a text body under the cap", () => {
    const html = paint({
      path: "uploads/rows.csv",
      name: "rows.csv",
      kind: "text",
      size: 1024,
    });
    expect(html).not.toContain(t.preview.tooLarge);
  });
});

// The rewrite the preview installs, exercised through the renderer that consumes it.
describe("markdown image resolution", () => {
  const resolver = (src: string) => {
    const target = resolveMediaRef("uploads/reports/q2.md", src);
    return target ? mediaUrl(inProject, target) : null;
  };

  const render = (content: string) =>
    renderToStaticMarkup(
      <MarkdownImageContext.Provider value={resolver}>
        <MessageContent content={content} />
      </MarkdownImageContext.Provider>,
    );

  it("rewrites a relative image through the media route", () => {
    const html = render("![d](diagram.png)");
    expect(html).toContain("/api/media/download?");
    expect(html).toContain("uploads%2Freports%2Fdiagram.png");
    expect(html).toContain("project=proj-1");
  });

  it("leaves an absolute image untouched", () => {
    expect(render("![d](https://example.com/a.png)")).toContain(
      'src="https://example.com/a.png"',
    );
  });

  // Without a provider — the chat's case — images render exactly as they did before
  // this context existed.
  it("renders a plain img when no resolver is in context", () => {
    const html = renderToStaticMarkup(<MessageContent content="![d](diagram.png)" />);
    expect(html).toContain('src="diagram.png"');
    expect(html).not.toContain("/api/media/download");
  });

  // Raw HTML stays off: this renderer shows agent-authored content. The tag arrives as
  // escaped TEXT — so the assertion is that no element was produced from it, not that
  // the characters are absent.
  it("does not render raw HTML", () => {
    const html = renderToStaticMarkup(
      <MessageContent content={'<img src="x" onerror="alert(1)">'} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

// MessageContent widens a table past its text column with `max(0px, 50cqw - 360px)`
// per side. `cqw` measures the nearest query container, and this dialog had none — so
// it fell back to the viewport and the table grew past the modal, producing a second
// outer scrollbar that hid content from anyone who did not scroll the whole dialog.
//
// Declaring the container is the whole fix: the same formula then measures this
// column, and its own clamp yields no breakout at all once the column is under 720px.
describe("markdown preview table overflow", () => {
  // Asserted against the SOURCE, not the render. The markdown column only exists
  // once the fetched body is in state, and this suite runs `environment: "node"`
  // where effects never fire — so a render-based check would pass on markup that
  // never contained the column at all. Same approach the globals.css rules are
  // guarded with.
  const src = readFileSync(new URL("./file-preview.tsx", import.meta.url), "utf8");

  it("declares a query container on the markdown column", () => {
    // The anchor carries `!asSource` because the branch does: markdown has two
    // readings now, and this one is the rendered column.
    const column = src.slice(src.indexOf('kind === "markdown" && !asSource && text !== null'));
    const openingDiv = column.slice(0, column.indexOf(">"));
    expect(openingDiv).toContain("container-type:inline-size");
  });

  it("keeps the max-width that the breakout formula is calibrated against", () => {
    // 50cqw - 360px is zero below a 720px column. A column allowed to grow past
    // that is what makes any breakout happen at all, so the two belong together.
    expect(src).toContain("max-w-[820px]");
  });
});

// THE READING CONTROLS, and where they are is the fix rather than a rearrangement.
//
// They were `sticky top-0` INSIDE the scrolling area, level with the code gutter's own
// `sticky left-0`. Two sticky elements at the same z-index in the same stacking context
// are ordered by the document, and the gutter comes later — so scrolling a source file up
// painted the numbers' background and rule straight over the bar. Outside the scrollport
// no descendant can reach them, whatever it sticks to.
//
// Source-based for the reason the suite above is: the footer only shows once the fetched
// body is in state, and effects never fire under `environment: "node"`.
describe("the preview's reading controls", () => {
  const src = readFileSync(new URL("./file-preview.tsx", import.meta.url), "utf8");
  const jsx = src
    .slice(src.indexOf("  return ("))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("keeps them outside the element that scrolls", () => {
    const scroller = jsx.indexOf("overflow-auto");
    const footer = jsx.indexOf("{footer && (");
    expect(scroller).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(scroller);
    // The scrolling div is closed before the footer opens — the footer is its sibling,
    // not a sticky child of it.
    expect(jsx.slice(scroller, footer)).toContain("</div>");
  });

  it("never pins anything to the top of the scrollport again", () => {
    expect(
      jsx,
      "a sticky bar in the scroller is what the line-number gutter painted over",
    ).not.toContain("sticky top-0");
  });

  // Icons alone are not a label. Every control says what it does on hover and to a screen
  // reader, from the same string.
  it("names every control in both title and aria-label", () => {
    const buttons = jsx.slice(jsx.indexOf("{footer && (")).match(/<button[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button).toContain("title=");
      expect(button).toContain("aria-label=");
      expect(button).toContain("aria-pressed=");
    }
  });

  it("takes those names from the dictionary, in both locales", () => {
    for (const key of ["viewRendered", "viewSource", "wrapLines"] as const) {
      expect(chatCopy.pt.preview[key]).toBeTruthy();
      expect(chatCopy.pt.preview[key]).not.toBe(chatCopy.en.preview[key]);
    }
  });

  it("offers the wrap control wherever the code pane paints, not only on a dual file", () => {
    // `dual` gates the rendered/source pair; the wrap control is gated on the code pane
    // itself, so a plain .yaml gets it too.
    expect(jsx).toContain("{showsCode && (");
    expect(src).toContain('const showsCode = (kind === "code" || asSource) && text !== null');
  });

  it("hands the code pane the file and the member's wrap choice", () => {
    expect(jsx).toContain("<CodePane code={text} language={language} wrap={wrap} />");
  });
});

// preview-formatting-and-odf FR-2. `docx-body` was a class name nothing in the
// repository defined, so a Word report — whose structure mammoth maps correctly and
// `sanitizeDocxHtml` keeps intact — painted as a flat wall of text under preflight.
describe("docx typography", () => {
  const src = readFileSync(new URL("./file-preview.tsx", import.meta.url), "utf8");
  const md = readFileSync(new URL("./message-content.tsx", import.meta.url), "utf8");

  it("no longer leans on a class nothing defines", () => {
    // The container's own className, not the file: the prose above it names the old
    // class while explaining why it was a defect.
    const branch = src.slice(src.indexOf("isDocumentKind(kind) && docHtml !== null"));
    const className = /className=\{`([^`]+)`\}/.exec(branch)?.[1] ?? "";
    expect(className).not.toContain("docx-body");
    expect(className).toContain("DOCX_BODY");
  });

  it("restores the structure preflight strips", () => {
    for (const rule of [
      "[&_h1]:",
      "[&_h2]:",
      "[&_ul]:list-disc",
      "[&_ol]:list-decimal",
      "[&_td]:border",
    ]) {
      expect(src).toContain(rule);
    }
  });

  // DEC-3: derived from the markdown renderer's table rather than invented. Read out of
  // THAT file, so a change to the markdown scale that is not mirrored here fails here.
  it("uses the markdown renderer's own scale", () => {
    for (const tag of ["p", "h1", "h2", "h3", "h4"]) {
      const tokens = new RegExp(`<${tag} className="([^"]+)"`).exec(md)?.[1].split(/\s+/) ?? [];
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) expect(src).toContain(`[&_${tag}]:${token}`);
    }
  });
});
