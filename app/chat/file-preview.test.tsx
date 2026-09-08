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
    const column = src.slice(src.indexOf('kind === "markdown" && text !== null'));
    const openingDiv = column.slice(0, column.indexOf(">"));
    expect(openingDiv).toContain("container-type:inline-size");
  });

  it("keeps the max-width that the breakout formula is calibrated against", () => {
    // 50cqw - 360px is zero below a 720px column. A column allowed to grow past
    // that is what makes any breakout happen at all, so the two belong together.
    expect(src).toContain("max-w-[820px]");
  });
});

// preview-formatting-and-odf FR-1. The `code` pane rendered a bare `<code>`, which keeps
// `white-space: normal` under Tailwind's preflight — so every newline in a .yaml, .json
// or .ts collapsed and the file arrived as one unreadable line. A `<pre>` restores them,
// and it belongs at THIS call site (DEC-1): CodeBlock is shared with the chat, where
// `message-content.tsx` already supplies one, so wrapping inside CodeBlock would nest
// `<pre>` in every message instead.
//
// Source-based for the same reason the suite above is: the code column only exists once
// the fetched body is in state, and effects never fire under `environment: "node"`.
describe("code preview keeps its lines", () => {
  const src = readFileSync(new URL("./file-preview.tsx", import.meta.url), "utf8");
  // The JSX only, with the explanatory comments stripped. The previous version of this
  // suite sliced from the first `<pre` in the branch and found one inside a COMMENT that
  // happens to mention `<pre>` — so it was asserting against prose, and kept passing
  // while the markup it meant to describe changed underneath it.
  // The code branch is the LAST one the component renders, so it runs to the end of the
  // file. (An earlier attempt bounded it with the docx branch and got an empty string:
  // `kind === "docx"` appears in the effect too, well above this.)
  const branch = src
    .slice(src.indexOf('kind === "code" && text !== null'))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("wraps the code pane in a <pre>", () => {
    expect(branch.slice(0, branch.indexOf("<CodeBlock"))).toContain("<pre");
  });

  it("scrolls the code pane rather than wrapping it", () => {
    // DEC-2: the `text` kind wraps because a log's line breaks are incidental; code
    // scrolls because its columns carry meaning.
    expect(branch).toContain("overflow-x-auto");
    expect(branch).not.toContain("whitespace-pre-wrap");
  });

  // preview-line-numbers DEC-5, and the defect it was written for: the gutter and the
  // code were sized SEPARATELY, one at `0.85em` on its own `<pre>` and one at `0.85em`
  // on the `<code>` inside the other. A block's line boxes are at least as tall as its
  // strut, and the strut follows the block's own font-size — so the code column's lines
  // stayed 15% taller than its numbers and the two drifted apart down the file.
  it("gives both columns of the code pane the same type", () => {
    const pres = branch.match(/<pre[\s\S]*?>/g) ?? [];
    expect(pres).toHaveLength(2);
    for (const pre of pres) expect(pre).toContain("CODE_TYPE");
  });

  it("sizes that type absolutely, so neither column can inherit a different one", () => {
    const decl = /const CODE_TYPE = "([^"]+)"/.exec(src)?.[1] ?? "";
    expect(decl).toMatch(/text-\[\d+px\]/);
    expect(decl).toMatch(/leading-\[\d+px\]/);
    expect(decl).not.toContain("em]");
  });

  it("leaves the <code> unsized, so the <pre> is the only thing that decides", () => {
    // A size on the inner `<code>` is exactly what desynchronised the columns before.
    const codeBlock = branch.slice(branch.indexOf("<CodeBlock"));
    expect(codeBlock.slice(0, codeBlock.indexOf("/>"))).not.toContain("text-[");
  });

  it("carries the newlines through the highlighter into the markup", () => {
    const code = "root:\n  key: value\n  list:\n    - one\n";
    const html = renderToStaticMarkup(
      <pre>
        <CodeBlock code={code} className="language-yaml" streaming={false} />
      </pre>,
    );
    expect(html).toContain(code.trimEnd());
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
