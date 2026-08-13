// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The panel's sibling sections are imported even when they are not the open one.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import UploadsSidebar from "./uploads-sidebar";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// The three controls on a file row — preview, download, delete — are rendered by the
// panel itself now that the row no longer goes through AttachmentButton's menu. Nothing
// else asserts they exist, and this list has a history: uploads-sidebar.tsx records a
// "New folder" button that was written, never rendered, and missed by six green tests.
//
// jsdom, because a row only exists after the listing effect has resolved, and the suite's
// default `environment: "node"` never fires an effect.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

// One previewable file, one that is not, and a folder — enough to tell the row's
// conditional control apart from its unconditional ones.
const LISTING = {
  files: [
    { path: "uploads/photo.png", name: "photo.png", size: 2048 },
    { path: "uploads/sheet.xlsx", name: "sheet.xlsx", size: 4096 },
  ],
};

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  vi.unstubAllGlobals();
});

async function openFilesPane(): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => LISTING }) as unknown as Response),
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        initialSection="files"
      />,
    );
  });
  // Let the listing promise resolve and the tree paint.
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

const byLabel = (host: HTMLElement, label: string) =>
  host.querySelector(`[aria-label="${label}"]`);

describe("a file row's controls", () => {
  it("renders the rows the listing returned", async () => {
    const host = await openFilesPane();
    expect(host.textContent).toContain("photo.png");
    expect(host.textContent).toContain("sheet.xlsx");
  });

  it("offers preview, download and delete on a previewable file", async () => {
    const host = await openFilesPane();
    expect(byLabel(host, `${t.preview.action} photo.png`)).not.toBeNull();
    expect(byLabel(host, `${t.attachment.download} photo.png`)).not.toBeNull();
    expect(byLabel(host, `${t.uploads.deletePrefix} photo.png`)).not.toBeNull();
  });

  // The one control that is conditional. Download and delete are not: every file can be
  // saved and every file can be removed.
  it("drops only the preview control on a file it cannot show", async () => {
    const host = await openFilesPane();
    expect(byLabel(host, `${t.preview.action} sheet.xlsx`)).toBeNull();
    expect(byLabel(host, `${t.attachment.download} sheet.xlsx`)).not.toBeNull();
    expect(byLabel(host, `${t.uploads.deletePrefix} sheet.xlsx`)).not.toBeNull();
  });

  // Clicking preview must reach the overlay — the row holds the state, so a wiring
  // mistake here would leave a button that does nothing.
  it("opens the preview overlay when preview is clicked", async () => {
    const host = await openFilesPane();
    const button = byLabel(host, `${t.preview.action} photo.png`);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The overlay is portaled out of the panel, so it is on <body>, not under `host`.
    // `preview.aria` is the dialog's LABEL, not its text — reading it off the attribute
    // is what proves this is the preview and not some other dialog.
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-label")).toBe(t.preview.aria);
    // …and that it is showing the file the row was for.
    expect(dialog?.textContent).toContain("photo.png");
  });
});
