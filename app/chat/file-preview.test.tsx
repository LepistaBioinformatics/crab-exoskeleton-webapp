import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import FilePreview from "./file-preview";
import MessageContent, { MarkdownImageContext } from "./message-content";
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
      onClose={() => {}}
      {...props}
    />,
  );
}

describe("FilePreview", () => {
  it("is a labelled modal dialog carrying the file's name", () => {
    const html = paint();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(t.preview.aria);
    expect(html).toContain("photo.png");
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

  it("keeps a download button in the header for every kind", () => {
    expect(paint()).toContain(t.attachment.download);
    expect(paint({ path: "uploads/a.pdf", name: "a.pdf", kind: "pdf" })).toContain(
      t.attachment.download,
    );
  });

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
