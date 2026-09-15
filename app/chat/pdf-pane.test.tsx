// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { chatCopy } from "@/lib/i18n/chat";

// THE PDF PANE, and the reason it exists rather than an `<object>`.
//
// Every current browser's PDF viewer ships annotation tools. This pane reads bytes out of
// the workspace and has nothing that writes them back, so a highlight or a typed note
// could only ever be discarded — and no setting in the page can switch them off, because
// the viewer runs in a document of another origin (Firefox has no URL parameter for it;
// Chrome's `#toolbar=0` takes the whole bar and Firefox ignores it). Drawing the pages
// ourselves is the only answer that is the same in every browser.
//
// `pdfjs-dist` is mocked: what is under test is the pane's contract — a page per page, the
// controls that replace the ones the browser's bar was carrying, and the download offer
// when the document cannot be read at all — not the rasteriser.

const getDocument = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerPort: null },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import PdfPane from "./pdf-pane";

const t = chatCopy.en;

function page() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  };
}

function doc(numPages: number) {
  return {
    numPages,
    getPage: () => Promise.resolve(page()),
    destroy: () => {},
  };
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  // jsdom has neither, and both are how the pane decides what to draw and where you are.
  // Stubbed rather than shimmed: the scheduling is the browser's, and what this suite
  // asserts is what the pane puts on screen before any of it has fired.
  for (const name of ["IntersectionObserver", "ResizeObserver"] as const) {
    (globalThis as unknown as Record<string, unknown>)[name] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  getDocument.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<PdfPane url="blob:x" fallback={<p>download instead</p>} />);
  });
  // The document, page one and its viewport are three awaits past the render.
  for (let i = 0; i < 6; i++) await act(async () => await Promise.resolve());
  return host!;
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll("button"));
const byLabel = (el: HTMLElement, label: string) =>
  buttons(el).find((b) => b.getAttribute("aria-label") === label);

describe("the PDF pane", () => {
  it("draws one page per page, and never a browser viewer", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(doc(3)), destroy: () => {} });
    const el = await mount();

    expect(el.querySelectorAll("[data-page]")).toHaveLength(3);
    expect(el.querySelectorAll("canvas")).toHaveLength(3);
    expect(
      el.querySelector("object, iframe, embed"),
      "the browser's viewer is what ships the tools this pane cannot save",
    ).toBeNull();
  });

  it("says which page you are on, out of how many", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(doc(12)), destroy: () => {} });
    const el = await mount();
    expect(el.textContent).toContain("1 / 12");
  });

  // Page navigation and zoom are what the browser's bar was carrying that anyone wanted.
  // Named in `title` and `aria-label` alike — they are icons.
  it("offers the two controls the browser's bar was carrying", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(doc(2)), destroy: () => {} });
    const el = await mount();
    const labels = [
      t.preview.pdfPrev,
      t.preview.pdfNext,
      t.preview.pdfZoomOut,
      // Named for the ACTION, not for the percentage it shows: the number is a readout,
      // and a control whose only name is "100%" says nothing about what it does.
      t.preview.pdfZoomReset,
      t.preview.pdfZoomIn,
    ];
    for (const label of labels) {
      const button = byLabel(el, label);
      expect(button, `no control labelled ${label}`).toBeTruthy();
      expect(button!.getAttribute("title")).toBe(label);
    }
  });

  it("names those controls in both locales", () => {
    for (const key of ["pdfPrev", "pdfNext", "pdfZoomIn", "pdfZoomOut", "pdfZoomReset"] as const) {
      expect(chatCopy.pt.preview[key]).toBeTruthy();
      expect(chatCopy.pt.preview[key]).not.toBe(chatCopy.en.preview[key]);
    }
  });

  it("cannot be paged past either end", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(doc(1)), destroy: () => {} });
    const el = await mount();
    expect(byLabel(el, t.preview.pdfPrev)!.disabled).toBe(true);
    expect(byLabel(el, t.preview.pdfNext)!.disabled).toBe(true);
  });

  it("zooms in steps, and stops before the page is unusable either way", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(doc(2)), destroy: () => {} });
    const el = await mount();
    const zoomIn = byLabel(el, t.preview.pdfZoomIn)!;

    expect(el.textContent).toContain("100%");
    act(() => zoomIn.click());
    expect(el.textContent).toContain("125%");

    for (let i = 0; i < 20; i++) act(() => zoomIn.click());
    expect(el.textContent).toContain("300%");
    expect(byLabel(el, t.preview.pdfZoomIn)!.disabled).toBe(true);
  });

  // A document pdf.js cannot open is a document to download, which is the same answer the
  // `<object>` gave for a browser with no viewer. Losing it would turn an awkward file
  // into a dead pane.
  it("falls back to the download offer when the document cannot be read", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("broken")), destroy: () => {} });
    const el = await mount();
    expect(el.textContent).toContain("download instead");
    expect(el.querySelector("canvas")).toBeNull();
  });
});
