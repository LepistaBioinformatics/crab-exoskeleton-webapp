"use client";

import type { ReactNode } from "react";

// The frame a centre-pane destination renders inside: a heading, a max-width column, and
// the scroll.
//
// IT WAS WRITTEN FOR SIX SCREENS, DROPPED TO ONE, AND HAS TWO. The five workspace
// sections went to the pane beside the conversation on 2026-09-12 (DEC-14), where
// `workspace-pane.tsx` is their frame; the mangrove followed them out later, for the
// same reason and in its own words ("THE PANE OWNS THE FRAME NOW"). That left the
// projects list alone here, and the agent picker has now joined it.
//
// It was kept as its own file through the lean period rather than folded into
// projects-screen.tsx, on the argument that "the second centre screen is the one that
// would drift, and this is what it will be handed" -- and the agent picker is precisely
// the case that argument was about. It drew its own heading in its own column for
// months, out of measurements copied FROM this file, which is the predicted drift
// arriving exactly where it was predicted. It renders inside the frame now, and the
// copying went the other way: `full` is described below in terms of what the picker
// needs, because the picker is what has that shape.
/**
 * The three column widths a destination can be, and what each one is for.
 *
 * THE FRAME NARROWS, NOT THE CHILDREN, and that is the whole reason this is a prop
 * rather than a max-width the screen puts on its own content. The heading belongs to
 * the frame: a screen that narrowed only what it renders would centre its prose while
 * leaving its own title 200px away at the far left of a 6xl column.
 *
 *   - `reading` is the 65-75 character measure: one column of prose, nothing beside it.
 *   - `feed` is a rail of destinations and ONE narrow column of cards beside it. The
 *     cap here is the pair; the column's own width is the screen's, because only the
 *     screen knows how wide its rail is. The column is deliberately narrower than the
 *     reading measure -- a feed is scanned an object at a time rather than read line
 *     by line, and every product doing this (X, LinkedIn, Mastodon) lands between 500
 *     and 600px, past which a card stops looking like an object and starts looking
 *     like a band across the page.
 *   - `full` is a list or grid that wants the room, which is what the agent picker is:
 *     a row carrying an agent, its tenant and its subscription needs three columns'
 *     worth of width before the third one stops truncating. It used to say "which is
 *     what Projects is", and Projects moved to `reading` when it became a list of five
 *     short rows -- a different list, with one column, and therefore a different answer.
 */
type Width = "reading" | "feed" | "full";

const WIDTH: Record<Width, string> = {
  reading: "max-w-2xl",
  feed: "max-w-4xl",
  full: "max-w-6xl",
};

export default function DestinationScreen({
  title,
  actions,
  width = "full",
  children,
}: {
  title: string;
  /** Controls for the destination as a whole — creating, refreshing. */
  actions?: ReactNode;
  width?: Width;
  children: ReactNode;
}) {
  return (
    // The scroll belongs to the frame, not to the screen inside it: a destination that
    // scrolled its own body would take the heading out of view with it, and "where am
    // I" is the one thing that must survive scrolling.
    <div className="h-full overflow-y-auto">
      <div
        className={`mx-auto px-4 py-6 sm:px-6 sm:py-8 ${WIDTH[width]}`}
      >
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 font-display text-xl font-bold text-fg sm:text-2xl">
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
