"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";

// The header of one foldable section in the chats sidebar.
//
// It exists to be SHARED. The sidebar's three parts -- workspace, projects, chats --
// had no common grammar: projects brought its own header and its own border, chats had
// a bare label row, and the controls belonging to the chat list sat in the workspace
// row at the top of the panel. A member could not tell where one part ended. Two
// look-alike header rows written separately would drift back into that, which is the
// complaint this is answering.

const chevron = cva("shrink-0 text-fg-muted transition-colors group-hover/sec:text-fg");

// The uppercase eyebrow. Exported because the workspace section -- which does NOT
// fold, being the panel's own header row -- has to wear the same label treatment for
// the three to read as three.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">
      {children}
    </span>
  );
}

const row = cva(
  "group/sec flex shrink-0 items-center gap-1 border-t border-brand/20 px-2 py-2",
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
