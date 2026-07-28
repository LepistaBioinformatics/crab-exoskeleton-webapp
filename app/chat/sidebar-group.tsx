"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";

// One collapsible section of the unified sidebar.
//
// The header is ALWAYS visible; only the body collapses. That is what lets the two
// groups share one pane without either pushing the other off screen — with a
// pane-wide scroll instead, many workspaces would carry the Conversations header and
// its search below the fold.
//
// Height is the CALLER's business, not this component's: Workspaces is content-height
// capped at 40%, Conversations takes the remainder, and both need the wrapper to own
// the flex rules. This renders header + body and nothing about size.

// `min-w-0 flex-1`, never `w-full`. The toggle sits in a ROW beside the group's
// actions, and w-full means width:100% — the toggle took the whole row and pushed the
// actions past the pane's right edge, where they rendered outside the sidebar
// altogether. flex-1 lets it take the space that is left; min-w-0 lets its label
// truncate instead of refusing to shrink.
const header = cva(
  "flex min-w-0 flex-1 shrink items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated/60",
);

const label = cva(
  "min-w-0 flex-1 truncate font-display text-xs font-semibold uppercase tracking-wide text-fg-muted",
);

export default function SidebarGroup({
  title,
  open,
  onToggle,
  identity,
  actions,
  children,
  bodyRef,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /**
   * Rendered between the chevron and the title — the sole tenant's avatar and name
   * when the tenant row was hoisted away, so hiding it does not lose whose
   * workspaces these are.
   */
  identity?: ReactNode;
  /** Group-scoped controls (filter, new chat, list/tree). Not inside the toggle. */
  actions?: ReactNode;
  children: ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-1 pr-1">
        {/* The toggle is the header text, not the whole row: the actions beside it
            are their own buttons, and nesting them inside a button is invalid and
            makes the whole header swallow their clicks. */}
        <button type="button" onClick={onToggle} aria-expanded={open} className={header()}>
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-fg-muted" aria-hidden />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-fg-muted" aria-hidden />
          )}
          {identity}
          <span className={label()}>{title}</span>
        </button>
        {actions}
      </div>
      {open && (
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
          {children}
        </div>
      )}
    </>
  );
}
