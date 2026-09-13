"use client";

import { MouseEvent, ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// THE PANE BESIDE THE CONVERSATION, and its chrome only: a width the member owns, a
// handle to drag it by, a heading, and the control that closes it.
//
// It is the right-hand panel that `uploads-sidebar.tsx` used to be, lifted out of the
// panel it was welded to. That panel became five centre-pane destinations for a while,
// and the owner reversed it on 2026-09-12 after using it: a chat that disappears when
// you open Files is a chat you cannot consult while you read the file. What came back is
// this chrome, not the panel — the bodies are `workspace-screen.tsx`'s, and the list of
// the other four that used to slide in here is the sidebar's now.
//
// A file of its own so `chat-shell.tsx` does not grow a pane's worth of layout code: the
// shell owns where the member is, and "how wide is the right column" is not that.

export const MIN_WIDTH = 240;

// No fixed maximum: the knowledge graph is the reason — a member inspecting it wants
// the column as wide as their screen. The only ceiling is the viewport itself, so the
// resize handle (the pane's LEFT edge) can never be dragged off-screen and leave the
// width unrecoverable. `maxWidth()` is a function, not a constant, because the answer
// changes when the window does.
function maxWidth(): number {
  if (typeof window === "undefined") return Number.MAX_SAFE_INTEGER;
  return Math.max(MIN_WIDTH, window.innerWidth - 48);
}

/**
 * How wide the pane opens when the member has never resized it: a THIRD of the
 * viewport.
 *
 * 280px was a width for a file list. What members open this pane for is a document, the
 * knowledge graph or a memory note, and none of those are readable in a column that
 * narrow — the point of the pane is reading something while the chat stays usable
 * beside it.
 *
 * Bounded on both sides: never under what the file tree needs, never wider than the
 * viewport can show (which is also what keeps the resize handle reachable).
 */
export function defaultPanelWidth(viewport?: number): number {
  const w = viewport ?? (typeof window === "undefined" ? 0 : window.innerWidth);
  const max = viewport === undefined ? maxWidth() : Math.max(MIN_WIDTH, viewport - 48);
  return Math.min(Math.max(Math.round(w / 3), MIN_WIDTH), max);
}

// The key the panel already used. Kept rather than renamed: a member who had dragged
// this column to a width they liked gets it back, and the pane it belongs to is the same
// pane however the file is named now.
const WIDTH_KEY = "chat-files-width";

export default function WorkspacePane({
  title,
  actions,
  onClose,
  children,
}: {
  /** The open section's name -- the heading, and what the pane is called to a screen reader. */
  title: string;
  /** Controls for the section itself, beside the close button. */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT(chatCopy);
  const [width, setWidth] = useState(MIN_WIDTH);

  useEffect(() => {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    // Clamped on READ as well as on drag: a width persisted on a wide monitor must not
    // swallow the whole screen when the same member opens the app on a laptop.
    //
    // A stored width WINS over the default: it is the member having dragged the handle,
    // and a default that overrode that would undo the drag on every open.
    setWidth(raw >= MIN_WIDTH ? Math.min(raw, maxWidth()) : defaultPanelWidth());
  }, []);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: globalThis.MouseEvent) => {
      // Right-hand column: dragging the LEFT edge leftward widens it.
      const next = startWidth + (startX - ev.clientX);
      setWidth(Math.max(MIN_WIDTH, Math.min(next, maxWidth())));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <>
      {/* On mobile the pane is an overlay drawer; the backdrop dismisses it. */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label={title}
        style={{ width }}
        // pane-open animates width from 0 on mount (see globals.css). It is an
        // animation rather than a transition precisely because this width is
        // drag-resizable: a transition would make the drag lag.
        //
        // `max-md:w-[92vw]!` — the `!` is load-bearing. `width` above is an inline style
        // (it is drag-resizable on desktop), and an inline style beats an ordinary class,
        // so the mobile drawer was stuck at the desktop default. On a phone that is a
        // thin column that squeezes the content, and `max-w-[92vw]` could not help: a max
        // only caps a width, it never widens one. Tailwind v4 puts the important modifier
        // at the END.
        //
        // NO BORDER on the left edge, unlike the panel this came from: the pane is
        // `--surface` against the centre's `--bg`, and a region boundary that the tone
        // already draws is the hairline FR-6.1 removes.
        className="pane-open relative flex shrink-0 flex-col overflow-hidden bg-surface max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:w-[92vw]! max-md:max-w-[92vw] max-md:shadow-xl"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`${t.pane.resize} ${title}`}
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
        />

        <div className="flex shrink-0 items-center gap-1 border-b border-rule px-3 py-2">
          {/* h2, not h1: the centre pane holds the heading for where the member IS, and
              this is what is open beside it. */}
          <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">
            {title}
          </h2>
          {actions}
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`${t.pane.close} ${title}`}
            title={t.pane.close}
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </IconButton>
        </div>

        {/* WHERE THE HEIGHT COMES FROM, and the only reason the bodies below render at
            all. Each of the five is a flex column that sizes its scrolling region from
            its parent: the <aside> takes its height from the shell's flex row, the header
            is `shrink-0`, and this is what is left. A `flex-1` region whose parent grows
            with its content instead resolves to nothing — which is what the centre-pane
            frame did, and why the screen carried an `h-[70dvh]` workaround until this
            pane gave it a real height. `min-h-0` is the half that is easy to forget: a
            flex item's default `min-height: auto` refuses to shrink below its content,
            and the scroll then happens on the page instead of inside the panel. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </aside>
    </>
  );
}
