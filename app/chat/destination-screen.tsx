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
export default function DestinationScreen({
  title,
  actions,
  narrow = false,
  children,
}: {
  title: string;
  /** Controls for the destination as a whole — creating, refreshing. */
  actions?: ReactNode;
  /**
   * A reading column instead of a grid's frame.
   *
   * THE FRAME NARROWS, NOT THE CHILDREN, and that is the whole reason this is a prop
   * rather than a max-width the screen puts on its own content. The heading belongs to
   * the frame: a screen that narrowed only what it renders would centre its prose while
   * leaving its own title 200px away at the far left of a 6xl column.
   */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    // The scroll belongs to the frame, not to the screen inside it: a destination that
    // scrolled its own body would take the heading out of view with it, and "where am
    // I" is the one thing that must survive scrolling.
    <div className="h-full overflow-y-auto">
      <div
        className={`mx-auto px-4 py-6 sm:px-6 sm:py-8 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}
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
