"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";

// The header row at the top of the sidebar's conversation list.
//
// It was WRITTEN TO BE SHARED, when the sidebar had three parts -- workspace, projects,
// chats -- with no common grammar between them, and three look-alike header rows would
// have drifted apart. One of the three is left: projects became a destination in the
// centre and the workspace moved into the breadcrumb, so this is no longer arbitrating
// between sections. It stays because the row it draws -- a label on the left, the
// controls that act on the list on the right -- is still the shape the list needs.

const chevron = cva("shrink-0 text-fg-muted transition-colors group-hover/sec:text-fg");

// A quiet label, NOT an eyebrow any more (FR-6.3). The uppercase, letter-spaced,
// 12px treatment was the idiom of a sidebar built out of named sections: it shouted
// because three of them had to be told apart at a glance. There is one list in this
// column now, and a single all-caps heading over it reads as a section marker for
// sections that no longer exist. So it drops to the size the rows beneath it are set
// in -- it names the list, it does not announce a part of the sidebar.
export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="truncate text-sm font-medium text-fg-muted">{children}</span>;
}

// NO RULE ABOVE IT. It had `border-t border-rule`, which was drawn weight doing a job
// the type already does: the label is `font-medium text-fg-muted` and the rows beneath
// are `text-fg`, so the boundary is a tone step and a size of space. The rule survives in
// this column only where content SCROLLS PAST one — the account footer — and nothing
// scrolls past a heading that scrolls with its own list.
const row = cva(
  "group/sec flex shrink-0 items-center gap-1 px-2 pb-2 pt-4",
);

export function SectionHeader({
  label,
  open,
  onToggle,
  toggleLabel,
  actions,
}: {
  /**
   * A ReactNode rather than a string: the projects section is an eyebrow while
   * listing projects and a back-control naming the project while inside one, and
   * those are one section in two states.
   */
  label: ReactNode;
  /**
   * Omit `onToggle` for a section that does not fold. The projects section inside a
   * project is one: its body is the open project's own context, and there is no
   * "show me less of the project I am in" a member would want. A chevron that only
   * ever points down is a control that lies about having two states.
   */
  open?: boolean;
  onToggle?: () => void;
  /** Already interpolated -- "Collapse Projects" / "Expand Projects". */
  toggleLabel?: string;
  /**
   * Controls for what the section contains. Callers are expected to pass nothing
   * while collapsed: a control acting on a hidden body is a no-op that still looks
   * clickable.
   */
  actions?: ReactNode;
}) {
  if (!onToggle) {
    return (
      <div className={row()}>
        {/* No chevron indent: the one non-folding section (a project you are inside)
            leads its label with a back control, which occupies that slot itself. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5">{label}</span>
        {actions}
      </div>
    );
  }

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className={row()}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-elevated/60"
      >
        <Chevron size={14} className={chevron()} aria-hidden />
        {label}
      </button>
      {actions}
    </div>
  );
}

// The draggable seam between the projects box and the chats box.
//
// Vertical, unlike resizable-pane.tsx's horizontal edge, and deliberately not built on
// it: that one drives a CSS var for a pane WIDTH with a collapse rail and a mobile
// overlay, none of which applies here. What the two share is the idiom, not code.
export function SectionSplitter({
  label,
  onDragStart,
}: {
  label: string;
  onDragStart: (e: ReactMouseEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      title={label}
      onMouseDown={onDragStart}
      className="group/split flex h-2 shrink-0 cursor-row-resize items-center justify-center hover:bg-accent/20"
    >
      <span
        className="h-0.5 w-8 rounded-full bg-brand/50 group-hover/split:bg-accent"
        aria-hidden
      />
    </div>
  );
}
