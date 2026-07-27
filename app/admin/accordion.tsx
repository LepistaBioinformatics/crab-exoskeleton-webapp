"use client";

import { ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";

// A collapsible section of a panel.
//
// Built on <details>/<summary> rather than a state hook: that gives keyboard
// operation, screen-reader semantics and the open/closed toggle for free, and
// there is no state to drift out of sync with the DOM.
//
// The `summary` prop is what makes an accordion an improvement rather than just
// hiding things. A collapsed section that says only its title is WORSE than a flat
// page — the admin has to open each one to find out where they are. So every
// header states its own current state: which model is in effect, how many people
// are pinned, how many models are in service. You choose what to open because the
// closed headers already told you what is inside.

// `group` so the chevron can rotate off the <details> element's own open state
// via the built-in `open` variant, which is a generated Tailwind class rather
// than a hand-written arbitrary selector.
const shell = cva("group rounded-xl border bg-surface", {
  variants: {
    tone: {
      // The section that answers "what is happening right now" is drawn as the
      // primary one; the rest are quiet until opened.
      primary: "border-brand/40",
      quiet: "border-brand/20",
    },
  },
  defaultVariants: { tone: "quiet" },
});

export function Accordion({
  title,
  summary,
  hint,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** The section's current state, read without opening it. */
  summary: React.ReactNode;
  /** What this section is for and what to do about it, shown once opened. */
  hint?: React.ReactNode;
  tone?: "primary" | "quiet";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className={shell({ tone })} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={15}
          aria-hidden
          className="shrink-0 text-fg-muted transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[13px] font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{summary}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-brand/20 px-4 py-4">
        {hint && <p className="-mt-1 max-w-[64ch] text-xs text-fg-muted">{hint}</p>}
        {children}
      </div>
    </details>
  );
}
