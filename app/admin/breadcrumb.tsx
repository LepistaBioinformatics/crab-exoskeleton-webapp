"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cva } from "class-variance-authority";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { Column, ColumnRow, Split } from "./columns";
import { isAsking } from "./columns";
import { rowText } from "./column-view";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// THE PATH, and the only navigation the answered levels get.
//
// The column browser drew every level as a column, which cost ~1000px before the panel —
// the surface the work actually happens on — got any, and most of those columns were
// showing a question already decided. An answered level has one thing left to say: what
// was chosen. A segment says exactly that, in one line, and clicking it reaches that level
// directly instead of walking back through the ones between.

const segment = cva(
  [
    "flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ],
  {
    variants: {
      here: {
        true: "font-semibold text-fg",
        false: "font-medium text-fg-muted hover:bg-elevated hover:text-fg",
      },
    },
    defaultVariants: { here: false },
  },
);

// The mobile tail's slot in the one-menu-at-a-time state. Any value outside the crumbs'
// index range would do; naming it stops the -1 from reading as "none".
const TAIL = -1;

interface OpenMenu {
  index: number;
  x: number;
  y: number;
}

export default function Breadcrumb({
  crumbs,
  open,
  mobileTail,
  onSelect,
}: {
  crumbs: Split["crumbs"];
  /** The column drawn beside the panel. Its heading is the trailing hint while it asks. */
  open: Column | null;
  /**
   * BELOW `md` ONLY: the sections level, once it holds a selection. On a phone the panel
   * takes the whole screen, so the sidebar that would name the current section is not
   * there — this segment is what names it and gets back to its list. On a desktop the
   * sidebar does both, and this is hidden.
   */
  mobileTail?: { column: Column; selected: ColumnRow } | null;
  onSelect: (column: Column, row: ColumnRow) => void;
}) {
  const t = useT(adminCopy);
  // One menu at a time: two dropdowns over one bar would be two claims about where you are.
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const bar = useRef<HTMLElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((focus = false) => {
    setMenu(null);
    if (focus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // BOTH refs. The menu is portalled out of the bar, so `bar.contains(target)` is false
      // for a click on one of its own items — checking only the bar would close the menu on
      // mousedown and swallow the click that was choosing something.
      if (!bar.current?.contains(target) && !pop.current?.contains(target)) close();
    };
    // The position is captured once, so anything that moves the bar invalidates it.
    const onMove = () => close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [menu, close]);

  // Nudge the menu back inside the viewport once it has a measured width. A segment near
  // the right edge would otherwise open a menu that runs off screen — the same class of
  // invisibility this replaced.
  useLayoutEffect(() => {
    if (!menu || !pop.current) return;
    const rect = pop.current.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 8);
    if (overflow > 0) pop.current.style.left = `${Math.max(8, menu.x - overflow)}px`;
  }, [menu]);

  if (crumbs.length === 0) return null;

  const asking = isAsking(open);
  // The tail is not in `crumbs`, so it needs an index the array cannot produce.
  const menuColumn =
    menu === null ? null : menu.index === TAIL ? mobileTail!.column : crumbs[menu.index].column;

  return (
    <>
      <nav
        ref={bar}
        aria-label={t.columns.trailAria}
        // `overflow-x-auto` is SAFE AGAIN, and only because the menu is portalled. It was
        // here before, and it is what made the dropdown do nothing: per the CSS overflow
        // spec a non-`visible` value on one axis forces the other off `visible` too, so the
        // bar clipped its own absolutely-positioned menu vertically. Nothing is positioned
        // inside the bar any more, so the scroller costs nothing — and on a narrow screen
        // it is what keeps four segments from being squeezed into illegibility.
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-brand/25 px-3 py-1"
      >
        <ol className="flex items-center gap-0.5">
          {crumbs.map(({ column, selected }, i) => {
            const last = i === crumbs.length - 1 && !asking;
            const showing = menu?.index === i;
            return (
              <li key={column.key} className="flex shrink-0 items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight size={13} className="shrink-0 text-fg-muted" aria-hidden />
                )}
                <button
                  type="button"
                  aria-current={last ? "page" : undefined}
                  aria-haspopup="menu"
                  aria-expanded={showing}
                  aria-label={t.columns.changeAria.replace(
                    "{level}",
                    t.columns.headings[column.key],
                  )}
                  title={rowText(selected, t)}
                  className={segment({ here: last })}
                  onClick={(e) => {
                    if (showing) return close(true);
                    const rect = e.currentTarget.getBoundingClientRect();
                    trigger.current = e.currentTarget;
                    setMenu({ index: i, x: rect.left, y: rect.bottom + 4 });
                  }}
                >
                  <span className="max-w-[12rem] truncate">{rowText(selected, t)}</span>
                  <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />
                </button>
              </li>
            );
          })}

          {mobileTail && (
            <li className="flex shrink-0 items-center gap-0.5 md:hidden">
              <ChevronRight size={13} className="shrink-0 text-fg-muted" aria-hidden />
              <button
                type="button"
                aria-current="page"
                aria-haspopup="menu"
                aria-expanded={menu?.index === TAIL}
                aria-label={t.columns.changeAria.replace(
                  "{level}",
                  t.columns.headings[mobileTail.column.key],
                )}
                title={rowText(mobileTail.selected, t)}
                className={segment({ here: true })}
                onClick={(e) => {
                  if (menu?.index === TAIL) return close(true);
                  const rect = e.currentTarget.getBoundingClientRect();
                  trigger.current = e.currentTarget;
                  setMenu({ index: TAIL, x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <span className="max-w-[10rem] truncate">{rowText(mobileTail.selected, t)}</span>
                <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />
              </button>
            </li>
          )}

          {/* The question still open, as a hint rather than a control: there is nothing to
              choose here until the column below it is used. Absent once that column holds a
              selection — a sections column with a section chosen is not an open question. */}
          {asking && open && (
            <li className="flex shrink-0 items-center gap-0.5">
              <ChevronRight size={13} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="px-2 text-sm font-semibold text-fg">
                {t.columns.headings[open.key]}
                {t.columns.hintSuffix}
              </span>
            </li>
          )}
        </ol>
      </nav>

      {/* Portalled to <body>, for the reason ConfirmDialog already records: an in-tree
          overlay is at the mercy of every ancestor's clipping and stacking context. */}
      {menu &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            style={{ position: "fixed", left: menu.x, top: menu.y }}
            className="z-[60] max-h-[60vh] w-max min-w-[12rem] max-w-[18rem] overflow-y-auto rounded-lg border border-brand/30 bg-surface p-1 shadow-lg"
          >
            {menuColumn!.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                role="menuitem"
                className={
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors " +
                  (row.selected
                    ? "font-semibold text-fg"
                    : "text-fg-muted hover:bg-elevated hover:text-fg")
                }
                onClick={() => {
                  close();
                  onSelect(menuColumn!, row);
                }}
              >
                <span className="w-4 shrink-0">
                  {row.selected && <Check size={14} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate">{rowText(row, t)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
