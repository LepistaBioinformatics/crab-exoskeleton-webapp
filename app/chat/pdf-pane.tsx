"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Spinner } from "@/components/ui/spinner";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// A PDF DRAWN BY US, and the reason it is not the browser's own viewer.
//
// The pane used to hand the file to `<object type="application/pdf">`, which is the
// browser's viewer — and every current browser's viewer ships annotation tools. A member
// would highlight a paragraph or type a note and lose it: the preview reads bytes out of
// the workspace and has nothing that writes them back, so an edit could only ever be
// discarded. The tools were an offer the product could not keep.
//
// Nothing in the page can switch them off. The viewer runs in a document of another
// origin, so it cannot be styled or scripted from here; Firefox has no URL parameter for
// it (mozilla/pdf.js#19411 is the open request, and `pdfjs.annotationEditorMode` is a
// user preference rather than a page's to set); Chrome's `#toolbar=0` takes the whole bar
// — zoom and page navigation with it — and is ignored by Firefox anyway. Drawing the
// pages ourselves is the only way the answer is the same in every browser.
//
// So: canvases in a scrolling column, with the two controls the viewer was carrying that
// are actually wanted — where you are in the document, and how big it is.

/** Zoom, as a multiple of fit-to-width. Bounded so the column cannot be lost either way. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * pdf.js and its worker, fetched on the first PDF opened and never again.
 *
 * Deliberately not at module scope: this file is imported by `file-preview.tsx` on every
 * render of the pane, and a worker constructed there would be spawned for members who
 * never open a PDF. `workerPort` rather than `workerSrc` so the module type is stated
 * rather than inferred from the file extension.
 */
let pdfjs: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjs) return pdfjs;
  const mod = await import("pdfjs-dist");
  // `new Worker(new URL(…))` is the shape the bundler recognises: it emits the worker as
  // a chunk of its own rather than copying the raw `.mjs` through, which is what trips
  // the minifier on the `workerSrc` spelling (vercel/next.js#61549).
  //
  // Wrapped, because a browser that refuses to construct this worker must not take the
  // preview down with it. Without a port pdf.js sets up its own — slower, on the main
  // thread — and if THAT fails too the pane falls back to the download offer, which is
  // the same answer it gave for a PDF the browser could not display.
  try {
    mod.GlobalWorkerOptions.workerPort ??= new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
  } catch {
    // Left unset on purpose; see above.
  }
  pdfjs = mod;
  return mod;
}

export default function PdfPane({
  url,
  fallback,
}: {
  /** A blob URL for the file's bytes — the same one the `<object>` used to take. */
  url: string;
  /** Rendered when the document cannot be read at all; carries the download offer. */
  fallback: React.ReactNode;
}) {
  const t = useT(chatCopy);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  // The width fit-to-width fits to, and page one's aspect ratio. One measurement for the
  // whole document: a PDF whose pages differ in size corrects itself as each one renders,
  // and asking the worker for every page's viewport up front is a round trip per page on
  // a document nobody has scrolled yet.
  const [column, setColumn] = useState(0);
  const [page1, setPage1] = useState<{ width: number; ratio: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    // The TASK is what owns the document and the connection to the worker, so it is what
    // gets destroyed — opening a second file while the first is still loading would
    // otherwise leave the first one talking to a pane nobody is looking at.
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | null = null;
    void (async () => {
      try {
        const mod = await loadPdfjs();
        task = mod.getDocument({ url });
        const opened = await task.promise;
        if (!live) return;
        const first = await opened.getPage(1);
        const view = first.getViewport({ scale: 1 });
        setPage1({ width: view.width, ratio: view.height / view.width });
        setDoc(opened);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setColumn(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  if (failed) return <>{fallback}</>;
  if (!doc || !page1) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Fit-to-width at zoom 1, minus the gutter the column keeps on both sides.
  const scale = column > 0 ? ((column - 24) / page1.width) * zoom : zoom;
  const total = doc.numPages;

  function step(to: number) {
    const target = Math.min(Math.max(to, 1), total);
    hostRef.current
      ?.querySelector(`[data-page="${target}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={hostRef} className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: total }, (_, i) => (
            <PdfPageView
              key={i + 1}
              doc={doc}
              number={i + 1}
              scale={scale}
              placeholder={{ width: page1.width * scale, ratio: page1.ratio }}
              onEnter={setCurrent}
              scroller={hostRef}
            />
          ))}
        </div>
      </div>

      {/* The two things the browser's bar was carrying that anyone wanted. Under the
          document rather than over it, like the rest of this pane's reading controls. */}
      <div className="flex shrink-0 items-center gap-1 border-t border-rule px-2 py-1">
        <button
          type="button"
          title={t.preview.pdfPrev}
          aria-label={t.preview.pdfPrev}
          disabled={current <= 1}
          onClick={() => step(current - 1)}
          className={control}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <span className="px-1 text-xs tabular-nums text-fg-muted">
          {current} / {total}
        </span>
        <button
          type="button"
          title={t.preview.pdfNext}
          aria-label={t.preview.pdfNext}
          disabled={current >= total}
          onClick={() => step(current + 1)}
          className={control}
        >
          <ChevronRight size={14} aria-hidden />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title={t.preview.pdfZoomOut}
            aria-label={t.preview.pdfZoomOut}
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className={control}
          >
            <Minus size={14} aria-hidden />
          </button>
          {/* Resets to fit-width, which is what zoom 1 means here. Named for the ACTION
              rather than for the percentage it shows: the number is a readout, and a
              control whose only name is "100%" says nothing about what pressing it does. */}
          <button
            type="button"
            title={t.preview.pdfZoomReset}
            aria-label={t.preview.pdfZoomReset}
            onClick={() => setZoom(1)}
            className="rounded-lg px-1.5 py-1 text-xs tabular-nums text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title={t.preview.pdfZoomIn}
            aria-label={t.preview.pdfZoomIn}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className={control}
          >
            <Plus size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

const control =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:pointer-events-none disabled:opacity-40";

/**
 * One page, drawn only once it is nearly on screen.
 *
 * A 200-page report is 200 rasterisations, and a member who opened it to read the first
 * one should not wait for the other 199. The placeholder holds the right height from the
 * start, so the scrollbar is honest before anything has been drawn and scrolling does not
 * jump as pages arrive.
 */
function PdfPageView({
  doc,
  number,
  scale,
  placeholder,
  onEnter,
  scroller,
}: {
  doc: PDFDocumentProxy;
  number: number;
  scale: number;
  placeholder: { width: number; ratio: number };
  onEnter: (page: number) => void;
  /**
   * The element the pages scroll inside, handed down rather than found with
   * `closest(".overflow-auto")`. A class name is not a contract: renaming that utility, or
   * splitting it into `overflow-y-auto`, would silently leave both observers measuring
   * against the viewport and break page tracking with no error anywhere.
   */
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  const mark = useCallback(() => onEnter(number), [onEnter, number]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `rootMargin` so a page starts drawing before it is reached. Two observers rather
    // than one: "draw this soon" and "this is the page you are on" are different
    // thresholds, and sharing one makes the readout change a screen too early.
    //
    // `near` FOLLOWS the page in and out rather than latching true, and that is what keeps
    // a zoom cheap: `scale` is a prop on every page, so a latched flag meant one press of
    // `+` fired a render for every page the member had ever scrolled past — dozens of
    // concurrent worker jobs per click on a long report. Only what is on screen re-draws;
    // the rest keep the bitmap they have, stretched by CSS, until they come back.
    const root = scroller.current;
    const draw = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      root,
      rootMargin: "400px",
    });
    const here = new IntersectionObserver(([e]) => e.isIntersecting && mark(), {
      root,
      rootMargin: "-45% 0px -45% 0px",
    });
    draw.observe(el);
    here.observe(el);
    return () => {
      draw.disconnect();
      here.disconnect();
    };
  }, [mark, scroller]);

  useEffect(() => {
    if (!near) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;

    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      // Drawn at the device's pixel density; the CSS size comes from the wrapper, which
      // the class below makes the canvas fill. Setting it here in pixels instead is what
      // left an off-screen page at its old size after a zoom, because that page does not
      // re-render until it comes back — this way a stale bitmap is simply stretched.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const render = page.render({ canvas, canvasContext: context, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // A render cancelled by a zoom change or an unmount; the next one replaces it.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, scale, near]);

  return (
    <div
      ref={ref}
      data-page={number}
      className="shadow-sm"
      style={{
        width: placeholder.width,
        // Only until the canvas has its own size — after that the canvas decides, so a
        // page of a different shape is not stretched to page one's.
        minHeight: near ? undefined : placeholder.width * placeholder.ratio,
      }}
    >
      <canvas ref={canvasRef} className="block h-auto w-full bg-white" />
    </div>
  );
}
