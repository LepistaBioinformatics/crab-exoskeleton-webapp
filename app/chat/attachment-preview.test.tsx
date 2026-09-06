// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import AttachmentButton from "./attachment-button";
import {
  subscribeToPreviewRequests,
  type PreviewRequest,
} from "./media-preview-bus";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// chat-attachment-previews. An attachment used to be a NAME — which is unreadable
// exactly where it matters, since every pasted screenshot is called
// `pasted-<stamp>.png` and no two of them look alike.
//
// The predicate is the decision worth pinning: `previewKind`, not `fileTypeGroup`.
// The group counts `.svg` as an image, and an SVG cannot decode out of the
// `application/octet-stream` the proxy serves — it would always fall through to the
// broken-image path.

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

async function mount(props: Partial<React.ComponentProps<typeof AttachmentButton>>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <AttachmentButton
        workspace={workspace}
        path="uploads/photo.png"
        name="photo.png"
        tone="card"
        {...props}
      />,
    );
  });
  return host;
}

const img = (host: HTMLElement) => host.querySelector("img");

describe("an image attachment", () => {
  it("renders the picture, straight from the media route", async () => {
    const host = await mount({});

    expect(img(host), "an image attachment rendered as a name").not.toBeNull();
    expect(img(host)!.getAttribute("src")).toContain("/api/media/download");
    expect(img(host)!.getAttribute("alt")).toBe("photo.png");
    expect(img(host)!.getAttribute("loading")).toBe("lazy");
  });

  it("captions it with the name, and the size when the surface has one", async () => {
    const host = await mount({ size: 2048 });
    expect(host.textContent).toContain("photo.png · 2 KB");
  });

  // A transcript `[anexo: …]` marker carries a path and a name and nothing else.
  it("captions it with the name alone when it does not", async () => {
    const host = await mount({});
    expect(host.textContent).toContain("photo.png");
    expect(host.textContent).not.toContain("·");
  });

  // Any extension uploads now, and an extension can lie about its bytes. A
  // broken-image glyph where a preview was promised is worse than the card.
  it("falls back to the type card when the bytes do not decode", async () => {
    const host = await mount({});
    await act(async () => {
      img(host)!.dispatchEvent(new Event("error"));
    });

    expect(img(host), "a file that failed to decode kept its broken preview").toBeNull();
    expect(host.textContent).toContain("photo.png");
  });

  // Clicking a picture means "show it bigger". The menu's two items are preview and
  // download, and the panel carries download — so the menu has nothing left to ask.
  //
  // file-preview-in-pane FR-3.1: it asks the PANEL to show the file rather than opening
  // an overlay over the conversation. The chip cannot open anything itself — it is
  // rendered inside a message, and the panel is a sibling of the whole transcript.
  it("asks the panel to open it, with no menu and no overlay in between", async () => {
    const heard: PreviewRequest[] = [];
    const stop = subscribeToPreviewRequests((f) => heard.push(f));
    const host = await mount({});
    await act(async () => {
      host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    stop();

    expect(heard).toHaveLength(1);
    expect(heard[0].path).toBe("uploads/photo.png");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // Square and fixed, in both tones. A box that only CAPPED the image took the shape
  // of whatever was inside it: a portrait screenshot sat in a band of empty space, and
  // a long filename made the caption wider than the picture it described.
  it("is a fixed square, with the caption bounded by it", async () => {
    const host = await mount({ size: 2048 });
    const box = img(host)!.parentElement!;
    const caption = box.nextElementSibling!;

    expect(box.className).toContain("h-32");
    expect(box.className).toContain("w-32");
    expect(caption.className, "the caption is not held to the tile's width").toContain("w-32");
    expect(caption.className, "a long filename would widen the tile").toContain("truncate");
    // Filling the square is the point of having one.
    expect(img(host)!.className).toContain("object-cover");
  });

  // The composer's tile is smaller on purpose: history is where a picture is content,
  // the composer is a fixed strip above the input where the same picture is furniture.
  it("uses a smaller square in the composer's tone", async () => {
    const host = await mount({ tone: "compact" });
    const box = img(host)!.parentElement!;

    expect(box.className).toContain("w-24");
    expect(box.className, "the composer fell back to the transcript's tile").not.toContain(
      "w-32",
    );
  });

  // `chip` is what a narrow surface should use, and it is unchanged.
  it("stays a name in the chip tone", async () => {
    const host = await mount({ tone: "chip" });
    expect(img(host)).toBeNull();
  });
});

describe("a non-image attachment", () => {
  it("shows its type glyph, name and size, in the same square", async () => {
    const host = await mount({ path: "uploads/report.pdf", name: "report.pdf", size: 1048576 });

    expect(img(host)).toBeNull();
    const glyph = host.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(host.textContent).toContain("report.pdf");
    expect(host.textContent).toContain("1.0 MB");
    // The same tile as an image's — a row of attachments is a row of one object, not
    // squares interleaved with wide cards.
    expect(glyph!.parentElement!.className).toContain("h-32");
    expect(glyph!.parentElement!.className).toContain("w-32");
  });

  it("keeps the menu, because the choice still means something", async () => {
    const host = await mount({ path: "uploads/report.pdf", name: "report.pdf" });
    await act(async () => {
      host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain(t.attachment.download);
    expect(document.body.textContent).toContain(t.preview.action);
  });

  // SVG is an image to `fileTypeGroup` and not to `previewKind`. It must follow the
  // second one, or it renders an <img> that can never decode.
  it("does not try to render an SVG inline", async () => {
    const host = await mount({ path: "uploads/diagram.svg", name: "diagram.svg" });
    expect(img(host)).toBeNull();
  });
});
