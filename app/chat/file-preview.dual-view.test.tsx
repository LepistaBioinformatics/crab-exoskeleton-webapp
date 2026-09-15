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

const MD = "# Relatório\n\nUm parágrafo.";
const HTML = "<h1>Relatorio</h1><p>Um paragrafo.</p>";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let body = "";

// jsdom's Blob has no arrayBuffer(), and the pane reads BYTES rather than text -- the
// plain-text fallback means an unrecognised extension arrives on trust, so the file is
// asked directly. A real Response here dies with a TypeError the component catches as a
// failed read, and every assertion below would then be about an error pane.
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
  await flush();
  return host;
}

// The body arrives through fetch -> blob -> arrayBuffer -> decode, which is four
// microtask turns past the render. One `act` only flushes the first, so the pane would
// still be on its spinner and every assertion below would be about nothing.
async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// By `aria-label`, not by text: the reading controls are icons in the footer now, so
// their name is the thing a screen reader and a hover tooltip both read.
function click(label: string) {
  const el = [...host!.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  );
  if (!el) throw new Error(`no control labelled ${label}`);
  act(() => el.click());
}

const frame = () => host!.querySelector("iframe");
const hasToggle = () => host!.innerHTML.includes(t.preview.viewSource);

describe("a file with two readings offers both", () => {
  // The defect, from the member's side: markdown rendered with no way to see the marks,
  // html showed the markup with no way to see the page. Opposite gaps, one control.
  it("offers the choice for markdown and for html", async () => {
    await open("markdown", "report.md", MD);
    expect(hasToggle(), "markdown had no source option").toBe(true);
    act(() => root!.unmount());
    host!.remove();

    await open("html", "page.html", HTML);
    expect(hasToggle(), "html had no rendered option").toBe(true);
  });

  // And for nothing else: a control that does nothing is worse than no control.
  it("offers it for no other kind", async () => {
    await open("text", "notes.txt", "plain");
    expect(hasToggle()).toBe(false);
  });

  it("opens markdown rendered and shows the marks on request", async () => {
    await open("markdown", "report.md", MD);
    // Rendered: the heading became an element, not a line starting with a hash.
    expect(host!.querySelector("h1"), "markdown did not render").toBeTruthy();

    click(t.preview.viewSource);
    expect(host!.innerHTML, "the marks are not on screen").toContain("# Relat");
    expect(host!.querySelector("h1"), "the rendered heading survived the switch").toBeNull();
  });

  it("opens html rendered and shows the markup on request", async () => {
    await open("html", "page.html", HTML);
    expect(frame(), "html did not render").toBeTruthy();

    click(t.preview.viewSource);
    expect(frame(), "the frame survived the switch to source").toBeNull();
    expect(host!.innerHTML, "the markup is not on screen").toContain("&lt;h1&gt;");
  });

  // THE POSTURE, and the reason this feature could ship at all. The bytes were written
  // by an agent that reads untrusted material, so rendering them in THIS origin would
  // turn a prompt injection into script with the member's session. A frame with an
  // empty sandbox runs no script and has no origin to share.
  it("renders html in a frame that can do nothing", async () => {
    await open("html", "page.html", HTML);
    const f = frame()!;
    expect(f.getAttribute("sandbox"), "the sandbox is not the most restrictive value").toBe("");
    expect(f.getAttribute("srcdoc")).toContain("<h1>");
    // The two tokens that would undo it, together or apart.
    const sandbox = f.getAttribute("sandbox") ?? "";
    expect(sandbox).not.toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
  });

  // The choice belongs to the document, not to the pane. A member who looked at one
  // file's markup does not mean "show me markup from now on".
  it("returns to rendered when another file is opened", async () => {
    await open("html", "page.html", HTML);
    click(t.preview.viewSource);
    expect(frame()).toBeNull();

    body = "<p>outro</p>";
    await act(async () => {
      root!.render(
        <FilePreview
          workspace={workspace}
          path="public/other.html"
          name="other.html"
          kind="html"
        />,
      );
    });
    await flush();
    expect(frame(), "the next file opened as source").toBeTruthy();
  });
});
