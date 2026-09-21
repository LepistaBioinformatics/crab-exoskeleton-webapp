// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import FilePreview from "./file-preview";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";
import type { PreviewKind } from "@/lib/media";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const SKILL = `---
name: pdf
description: Read, merge, split, rotate, watermark PDF files
---

# PDF skill

Use it for PDFs.`;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let body = "";

beforeEach(() => {
  vi.stubGlobal("fetch", async () => {
    const bytes = new TextEncoder().encode(body);
    return {
      ok: true,
      status: 200,
      blob: async () => ({
        size: bytes.byteLength,
        arrayBuffer: async () => bytes.buffer,
      }),
    } as unknown as Response;
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

async function open(kind: PreviewKind, name: string, content: string) {
  body = content;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <FilePreview workspace={workspace} path={`public/${name}`} name={name} kind={kind} />,
    );
  });
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return host;
}

function click(el: HTMLElement, label: string) {
  const btn = Array.from(el.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label,
  );
  if (!btn) throw new Error(`no button labelled ${label}`);
  act(() => btn.click());
}

describe("a SKILL.md in the rendered view", () => {
  // THE COMPLAINT. remark-gfm turns the fence into an <hr> and the lines under it
  // into an <h2>, so the frontmatter rendered as the page's largest text, above
  // the document's own title. Both assertions are about the same <h1>: it has to
  // be the first heading again.
  it("does not render the block as the document's first heading", async () => {
    const el = await open("markdown", "SKILL.md", SKILL);
    const headings = Array.from(el.querySelectorAll("h1, h2, h3"));
    expect(headings.map((h) => h.textContent)).toEqual(["PDF skill"]);
  });

  it("shows the fields under a label that says they are metadata", async () => {
    const el = await open("markdown", "SKILL.md", SKILL);
    expect(el.textContent).toContain(t.preview.frontmatter);
    const rows = Array.from(el.querySelectorAll("dt")).map((d) => d.textContent);
    expect(rows).toEqual(["name", "description"]);
    expect(el.textContent).toContain("Read, merge, split, rotate, watermark PDF files");
  });

  // FR-4. The panel is inside the reading column, so it inherits that typography
  // unless it sets its own. A block that read like the document would fix the
  // markup and leave the complaint standing.
  it("draws the block in monospace, not in the document's reading face", async () => {
    const el = await open("markdown", "SKILL.md", SKILL);
    const dt = el.querySelector("dt");
    expect(dt?.closest("div")?.className).toContain("font-mono");
  });

  // FR-5. The source view's job is to show the marks; the fence belongs there.
  it("leaves the source view showing the fence verbatim", async () => {
    const el = await open("markdown", "SKILL.md", SKILL);
    click(el, t.preview.viewSource);
    expect(el.textContent).toContain("---");
    expect(el.textContent).toContain("name: pdf");
  });
});

describe("a markdown file with no frontmatter", () => {
  it("renders no panel at all", async () => {
    const el = await open("markdown", "notes.md", "# Notes\n\nA paragraph.");
    expect(el.textContent).not.toContain(t.preview.frontmatter);
    expect(el.querySelector("dt")).toBeNull();
  });

  // FR-3. An unterminated fence is not metadata. Eating it would hide the rest of
  // the file and say nothing about why it was shorter.
  it("keeps the whole document when the fence never closes", async () => {
    const el = await open("markdown", "draft.md", "---\nname: broken\n\n# Still here\n\nBody.");
    expect(el.textContent).not.toContain(t.preview.frontmatter);
    expect(el.textContent).toContain("Still here");
    expect(el.textContent).toContain("Body.");
  });

  // A thematic break in the middle of a document is ordinary markdown, and it is
  // how a model routinely separates sections in the transcript this renderer also
  // draws.
  it("still renders a mid-document rule as a rule", async () => {
    const el = await open("markdown", "notes.md", "# Notes\n\n---\n\nAfter.");
    expect(el.querySelector("hr")).not.toBeNull();
    expect(el.textContent).not.toContain(t.preview.frontmatter);
  });
});
