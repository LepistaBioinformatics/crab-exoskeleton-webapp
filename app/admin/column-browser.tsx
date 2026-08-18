"use client";

import type { Column, ColumnRow } from "./columns";
import { splitColumns } from "./columns";
import ColumnView from "./column-view";
import Chooser from "./chooser";
import Breadcrumb from "./breadcrumb";

// THE CONSOLE'S BODY: the path across the top, at most one column under it, and the panel.
//
// It used to be a strip of every column with the panel pinned beside it. Five columns at
// 12rem consumed ~1000px before the panel — where the work happens — got any, and four of
// them were showing a question already answered. Now an answered level is a breadcrumb
// segment and only the open one is drawn, so the panel gets the whole width the moment the
// path is complete.
//
// One layout, both breakpoints. The mobile track, its `armed` transition, the pane model
// and the back control are all gone: they existed to choose which of several panes was on
// screen, and with at most one column and one panel — never both, since a path with an open
// column has no section selected — there is no choice left to make.
export default function ColumnBrowser({
  columns,
  onSelect,
  children,
}: {
  columns: Column[];
  onSelect: (column: Column, row: ColumnRow) => void;
  /** The panel. Rendered whenever the path is complete. */
  children: React.ReactNode;
}) {
  const { crumbs, open } = splitColumns(columns);
  // The sections level, once it holds a choice. Below `md` the panel takes the whole screen
  // and this sidebar is hidden — the two side by side left the panel with no width at all,
  // so tapping a section on a phone appeared to do nothing. The breadcrumb grows a
  // mobile-only tail segment instead, which names the section and gets back to its list.
  const sectionChosen =
    open?.key === "sections" ? (open.rows.find((r) => r.selected) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Breadcrumb
        crumbs={crumbs}
        open={open}
        mobileTail={sectionChosen && open ? { column: open, selected: sectionChosen } : null}
        onSelect={onSelect}
      />

      {/* TWO SHAPES, and which one is showing is the difference between being asked a
          question and doing the work.

          A chain level still open — agent, tenant, subscription — is the only thing on the
          screen at that moment, so it takes the middle as a list of large options. There is
          no panel to sit beside: a panel exists only once a section is chosen, and a section
          cannot be chosen before a scope is.

          The sections level is the other case. It is switched repeatedly while working, so
          it stays a sidebar beside the panel rather than standing in front of it. */}
      {open && open.key !== "sections" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Chooser column={open} onSelect={(row) => onSelect(open, row)} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {open && (
            // `contents` so the wrapper adds no box of its own: ColumnView stays the direct
            // flex child and keeps its own widths. It exists only to carry the breakpoint.
            <div className={sectionChosen ? "hidden md:contents" : "contents"}>
              <ColumnView column={open} onSelect={(row) => onSelect(open, row)} />
            </div>
          )}
          {/* `min-w-0` so a wide panel — the JSON editor, the model table — shrinks rather
              than pushing the sidebar off screen. Hidden below `md` while the list is what
              is showing; there is nothing in it then anyway. */}
          <div
            className={
              "min-w-0 flex-1 overflow-y-auto" + (sectionChosen ? "" : " max-md:hidden")
            }
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
