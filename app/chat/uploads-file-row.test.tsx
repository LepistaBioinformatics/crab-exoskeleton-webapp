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
    { path: "uploads/bundle.zip", name: "bundle.zip", size: 4096 },
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
        section="files"
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
    expect(host.textContent).toContain("bundle.zip");
  });

  it("offers preview, download and delete on a previewable file", async () => {
    const host = await openFilesPane();
    expect(byLabel(host, `${t.preview.action} photo.png`)).not.toBeNull();
    expect(byLabel(host, `${t.attachment.download} photo.png`)).not.toBeNull();
    expect(byLabel(host, `${t.uploads.deletePrefix} photo.png`)).not.toBeNull();
  });

  // The one control that is conditional. Download and delete are not: every file can be
  // saved and every file can be removed.
  // A file with no preview keeps a plain label rather than a link that does nothing —
  // and it still downloads and deletes like any other row. (`.xlsx` used to be the
  // example here; it is previewable now, so the example is an archive.)
  it("leaves the name unlinked on a file it cannot show", async () => {
    const host = await openFilesPane();
    expect(byLabel(host, `${t.preview.action} bundle.zip`)).toBeNull();
    expect(byLabel(host, `${t.attachment.download} bundle.zip`)).not.toBeNull();
    expect(byLabel(host, `${t.uploads.deletePrefix} bundle.zip`)).not.toBeNull();
  });

  // file-preview-in-pane: the document opens IN the panel, in place of the tree, so the
  // conversation stays where it was. There is no overlay to portal any more, and no eye
  // icon to find first — the name is the control.
  it("opens the document in the panel when the name is clicked", async () => {
    const host = await openFilesPane();
    const button = byLabel(host, `${t.preview.action} photo.png`);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    // The panel's header now names the open document, and the preview region is
    // labelled inside the panel rather than portaled to <body>.
    expect(host.querySelector(`[aria-label="${t.preview.aria}"]`)).not.toBeNull();
    expect(host.textContent).toContain("photo.png");
  });
});

// A row's controls are revealed on hover, which on a touch device reveals nothing: the
// member cannot discover preview, download or delete at all. The fix is keyed on the
// hover CAPABILITY rather than on a width breakpoint — a touch laptop at desktop width
// has the same problem and a narrow desktop window does not — so what is asserted is
// that the escape hatch is present on every container that hides its contents.
// The mark at the left of a row has to VARY to be worth the width it takes from the
// name — a glyph identical on every line is what was removed from this row once
// already, for exactly that reason. Since chat-attachment-previews it varies twice
// over: an image row shows the picture, everything else shows its type glyph.
describe("a row's leading mark", () => {
  const rowFor = (pane: HTMLElement, name: string) => {
    const row = Array.from(pane.querySelectorAll('li[role="treeitem"]')).find((r) =>
      r.textContent?.includes(name),
    );
    expect(row, `no row for ${name}`).toBeTruthy();
    return row!;
  };

  it("shows the image itself for an image", async () => {
    const pane = await openFilesPane();
    const thumb = rowFor(pane, "photo.png").querySelector("img");

    expect(thumb, "an image row drew a glyph where its thumbnail should be").not.toBeNull();
    // Pointed straight at the media route: the session cookie authenticates it, so no
    // fetch, no blob and no revocation are involved.
    expect(thumb!.getAttribute("src")).toContain("/api/media/download");
    expect(thumb!.getAttribute("src")).toContain("uploads%2Fphoto.png");
    // A pane can list dozens of images; they must not all be requested on mount.
    expect(thumb!.getAttribute("loading")).toBe("lazy");
  });

  it("draws a type glyph for a file it cannot show", async () => {
    const pane = await openFilesPane();
    const row = rowFor(pane, "bundle.zip");

    expect(row.querySelector("img"), "an archive row tried to render itself").toBeNull();
    // The FIRST svg is the leading mark; the ones after it are the row's controls.
    expect(row.querySelector("svg")?.getAttribute("class") ?? "").not.toBe("");
  });
});

describe("row controls on a device without hover", () => {
  it("keeps every hover-revealed control group visible where hover does not exist", async () => {
    const pane = await openFilesPane();

    // The EXACT token, not a substring: IconButton carries `after:opacity-0` for its
    // ripple, which is not a hover-reveal and needs no fallback.
    // classList, not className: on an SVG element className is an SVGAnimatedString.
    // The EXACT token, not a substring: IconButton carries `after:opacity-0` for its
    // ripple, which is not a hover-reveal and needs no fallback.
    const hidden = Array.from(pane.querySelectorAll<HTMLElement>("*")).filter((el) =>
      el.classList.contains("opacity-0"),
    );
    expect(hidden.length).toBeGreaterThan(0);

    for (const el of hidden) {
      expect(
        el.classList.contains("[@media(hover:none)]:opacity-100"),
        `a hover-revealed group with no touch fallback: ${el.getAttribute("class")}`,
      ).toBe(true);
    }
  });
});
