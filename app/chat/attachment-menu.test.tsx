// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import AttachmentButton from "./attachment-button";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// Whether the "Preview" item actually REACHES the menu — which no test of `previewKind`
// can answer, because that proves the predicate and says nothing about the wiring.
//
// jsdom rather than the suite's default `environment: "node"`, and a real click rather
// than a prop that renders the menu open: the menu is conditional on the click AND
// portaled to <body>, neither of which survives `renderToStaticMarkup`. The idiom (and
// the `IS_REACT_ACT_ENVIRONMENT` flag) is message-content-remount.test.tsx's.
//
// The reason this file exists at all is the failure recorded in uploads-sidebar.tsx:
// a control that was written but never rendered, with every existing test still green.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
});

/** Mounts one row and clicks it, returning everything the open menu shows. */
async function openMenu(path: string): Promise<string> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <AttachmentButton
        workspace={workspace}
        path={path}
        name={path.slice(path.lastIndexOf("/") + 1)}
      />,
    );
  });
  const trigger = host.querySelector("button");
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // The menu is portaled to <body>, so it is NOT under `host`.
  return document.body.textContent ?? "";
}

describe("the file row's menu", () => {
  it("offers Preview for every previewable kind", async () => {
    for (const path of [
      "uploads/photo.png",
      "uploads/photo.JPG",
      "uploads/reports/q2.md",
      "uploads/notes.txt",
      "uploads/rows.csv",
      "uploads/paper.pdf",
    ]) {
      const menu = await openMenu(path);
      expect(menu, path).toContain(t.preview.action);
      expect(menu, path).toContain(t.attachment.download);
      // Unmount between iterations, or the portals stack up in <body>.
      const { host, root } = mounted!;
      await act(async () => root.unmount());
      host.remove();
      mounted = null;
    }
  });

  // The formats that keep the one-item menu they have always had. No disabled entry:
  // it would explain a rule nobody asked about.
  it("offers only Download for what it cannot show", async () => {
    for (const path of ["uploads/sheet.xlsx", "uploads/doc.docx", "uploads/bundle.zip"]) {
      const menu = await openMenu(path);
      expect(menu, path).toContain(t.attachment.download);
      expect(menu, path).not.toContain(t.preview.action);
      const { host, root } = mounted!;
      await act(async () => root.unmount());
      host.remove();
      mounted = null;
    }
  });
});
