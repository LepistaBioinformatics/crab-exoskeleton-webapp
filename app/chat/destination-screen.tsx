"use client";

import type { ReactNode } from "react";

// The frame a centre-pane destination renders inside: a heading, a max-width column, and
// the scroll.
//
// IT WAS WRITTEN FOR SIX SCREENS AND HAS ONE. The five workspace sections went back to
// the pane beside the conversation on 2026-09-12 (DEC-14), where `workspace-pane.tsx` is
// their frame, so the projects grid is the only thing left that fills the centre.
//
// Kept as its own file anyway, and not folded into projects-screen.tsx. The reason it
// was split out is the one thing the reversal did not change: a destination is reached
// the same way the agent grid is, and two pickers in the same slot that disagree about
// column width or about where their controls sit make a member re-learn the pane. The
// second centre screen is the one that would drift, and this is what it will be handed.
//
// The measurements are workspace-grid.tsx's, not new ones, for exactly that reason
// (FR-2.3).
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
 *   - `full` is a grid that wants the room, which is what Projects is.
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
