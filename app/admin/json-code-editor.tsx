"use client";

import { useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";
import { useT } from "@/lib/i18n/context";
import { adminCopy } from "@/lib/i18n/admin";
import { SYNTAX_ROLE, tokenize } from "./json-tokens";
import { roleClass } from "./syntax-theme";
import { applyViewEdit, foldedView, foldRanges, lineStarts } from "./json-folds";
import { insertTab } from "./instance-config-state";

// The raw JSON editor: a coloured layer behind a TRANSPARENT TEXTAREA.
//
// The textarea is the real editor. Caret, selection, drag-select, IME, undo/redo,
// autoscroll-to-caret and every platform keybinding stay native, because nothing
// about editing is reimplemented — only the painting is. That is the whole reason
// for the overlay: a contentEditable or a hand-drawn caret would mean rebuilding
// text editing, and rebuilding it badly.
//
// What the two layers require of each other is exact metric agreement: same font,
// size, line height, padding, and NO WRAPPING. They share the classes below so a
// change to one cannot silently drift from the other.

// Both layers must resolve to identical metrics. `whitespace-pre` (never
// pre-wrap): a wrapped line occupies two rows in the text and one in the gutter,
// which desynchronises the line numbers and every fold arrow under it.
const LAYER = "font-mono text-xs leading-5 whitespace-pre";

const gutterRow = cva("flex h-5 items-center justify-end gap-1 pr-1 text-[11px] tabular-nums", {
  variants: {
    foldable: { true: "text-fg-muted", false: "text-fg-muted/50" },
  },
  defaultVariants: { foldable: false },
});

export default function JsonCodeEditor({
  text,
  folded,
  onChange,
  onFoldedChange,
  ariaLabel,
}: {
  /** The canonical document. Always the FULL text, whatever is collapsed. */
  text: string;
  /** Offsets of the opening brackets currently collapsed. */
  folded: ReadonlySet<number>;
  onChange: (next: string) => void;
  onFoldedChange: (next: Set<number>) => void;
  ariaLabel: string;
}) {
  const t = useT(adminCopy).instanceConfig;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const view = useMemo(() => foldedView(text, folded), [text, folded]);
  const tokens = useMemo(() => tokenize(view.text), [view.text]);
  const rows = useMemo(() => lineStarts(view.text), [view.text]);

  // Fold arrows are placed by the line they open on, in VIEW coordinates — a
  // collapsed range higher up shifts every line under it.
  const arrows = useMemo(() => {
    const byLine = new Map<number, { open: number; collapsed: boolean; count: number }>();
    for (const range of foldRanges(view.text)) {
      const line = rows.findIndex(
        (start, i) => start <= range.open && (i + 1 === rows.length || rows[i + 1] > range.open),
      );
      const canonical = view.segments.find(
        (s) => !s.hidden && range.open >= s.viewStart && range.open < s.viewEnd,
      );
      if (!canonical) continue;
      const canonicalOpen = canonical.canonicalStart + (range.open - canonical.viewStart);
      byLine.set(line, { open: canonicalOpen, collapsed: false, count: range.count });
    }
    // A collapsed range's own arrow: its opening bracket is still visible, so the
    // line it sits on is the line that must offer to reopen it.
    for (const range of view.folded) {
      const seg = view.segments.find(
        (s) => !s.hidden && range.open >= s.canonicalStart && range.open < s.canonicalEnd,
      );
      if (!seg) continue;
      const viewOpen = seg.viewStart + (range.open - seg.canonicalStart);
      const line = rows.findIndex(
        (start, i) => start <= viewOpen && (i + 1 === rows.length || rows[i + 1] > viewOpen),
      );
      byLine.set(line, { open: range.open, collapsed: true, count: range.count });
    }
    return byLine;
  }, [view, rows]);

  // The textarea owns the scroll so the browser keeps the caret in view for free;
  // the painted layer and the gutter are translated to match. Syncing the other way
  // round (a shared scroller with the textarea clipped) loses caret autoscroll.
  function syncScroll() {
    const area = areaRef.current;
    if (!area) return;
    if (paintRef.current) {
      paintRef.current.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`;
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-area.scrollTop}px)`;
    }
  }

  function toggleFold(open: number, collapsed: boolean) {
    const next = new Set(folded);
    if (collapsed) next.delete(open);
    else next.add(open);
    onFoldedChange(next);
  }

  return (
    <div className="flex min-h-0 overflow-hidden rounded-lg border border-brand/30 bg-elevated">
      {/* Line numbers and fold arrows. Sticky rather than inside the scroller, so
          horizontal scrolling never carries the gutter off screen. */}
      <div className="relative shrink-0 select-none overflow-hidden border-r border-brand/20 py-2">
        <div ref={gutterRef} className="w-14">
          {rows.map((_, line) => {
            const arrow = arrows.get(line);
            return (
              <div key={line} className={gutterRow({ foldable: Boolean(arrow) })}>
                <span>{line + 1}</span>
                {arrow ? (
                  <button
                    type="button"
                    onClick={() => toggleFold(arrow.open, arrow.collapsed)}
                    aria-expanded={!arrow.collapsed}
                    aria-label={`${arrow.collapsed ? t.expand : t.collapse} ${t.lineLabel} ${line + 1}`}
                    title={t.foldTitle.replace("{count}", String(arrow.count))}
                    className="flex h-4 w-4 items-center justify-center rounded text-fg-muted hover:bg-accent/20 hover:text-fg"
                  >
                    {arrow.collapsed ? (
                      <ChevronRight size={12} aria-hidden />
                    ) : (
                      <ChevronDown size={12} aria-hidden />
                    )}
                  </button>
                ) : (
                  <span className="w-4" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        {/* The painted layer. aria-hidden: it duplicates the textarea's value, and
            a screen reader announcing both would read the document twice. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden p-2" aria-hidden>
          <div ref={paintRef} className={`${LAYER} will-change-transform`}>
            {tokens.map((token, i) => {
              const slice = view.text.slice(token.start, token.end);
              // A run inside the hidden segment is the fold placeholder, painted as
              // a marker rather than as whatever JSON it happens to resemble.
              const inFold = view.segments.some(
                (s) => s.hidden && token.start >= s.viewStart && token.end <= s.viewEnd,
              );
              if (inFold) {
                return (
                  <span key={i} className="rounded bg-accent/25 text-fg-muted">
                    {slice}
                  </span>
                );
              }
              const cls = roleClass(SYNTAX_ROLE[token.kind]);
              return cls ? (
                <span key={i} className={cls}>
                  {slice}
                </span>
              ) : (
                slice
              );
            })}
            {/* A trailing newline leaves the paint one row shorter than the
                textarea, so the last line would sit unpainted. */}
            {"\n"}
          </div>
        </div>

        <textarea
          ref={areaRef}
          aria-label={ariaLabel}
          spellCheck={false}
          wrap="off"
          className={`${LAYER} relative h-full w-full resize-none overflow-auto bg-transparent p-2 text-transparent caret-fg outline-none selection:bg-accent/30`}
          value={view.text}
          onScroll={syncScroll}
          onChange={(e) => {
            // Every edit arrives in VIEW coordinates and is translated back into
            // the canonical document, which is the only text a save ever sees.
            const next = applyViewEdit(text, folded, view.text, e.target.value);
            onChange(next.text);
            if (next.folded.size !== folded.size) onFoldedChange(next.folded);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            e.preventDefault();
            const area = e.currentTarget;
            const edited = insertTab(view.text, area.selectionStart, area.selectionEnd);
            const next = applyViewEdit(text, folded, view.text, edited.text);
            onChange(next.text);
            requestAnimationFrame(() => area.setSelectionRange(edited.caret, edited.caret));
          }}
        />
      </div>
    </div>
  );
}
