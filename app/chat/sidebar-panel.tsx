"use client";

import type { ReactNode } from "react";
import { cva } from "class-variance-authority";

// One of the sidebar's two panels: a header row and a body that scrolls inside itself.
//
// It replaced SidebarGroup, which was collapsible. With one panel visible at a time
// there is nothing to collapse for — the accordion existed only so two stacked groups
// could stop competing for the same vertical space, and they no longer share any.

// `min-w-0 flex-1`, never `w-full`. The header sits in a ROW beside the panel's
// actions, and w-full means width:100% — the header took the whole row and pushed the
// actions past the column's right edge, where they rendered outside the sidebar
// altogether. flex-1 lets it take the space that is left; min-w-0 lets it truncate
// instead of refusing to shrink.
const headerSlot = cva("flex min-w-0 flex-1 shrink items-center");

export default function SidebarPanel({
  header,
  actions,
  children,
}: {
  /** The panel's title row content — a label, or the chats panel's back control. */
  header: ReactNode;
  /** Panel-scoped controls (the filter magnifier, the list/tree switch). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* pt-2 on the ROW, not on the header element: the actions sit here too, and
          they were flush against the brand header above. */}
      <div className="flex shrink-0 items-center gap-1 pr-1 pt-2">
        <div className={headerSlot()}>{header}</div>
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
