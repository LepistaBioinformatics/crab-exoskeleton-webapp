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

// Two looks, one behaviour.
//
// `card` is the admin panel's: a bordered box per section, which reads as a
// stack of independent panels — right for a wide screen full of them.
//
// `section` is the narrow-column grammar: a flat row separated by a top rule,
// with an uppercase eyebrow. In a 380px column the card's borders nest inside
// the container's own border and each section reads as a floating box; the flat
// rule reads as one column divided into parts, which is what it is.
//
// It was named after app/chat/sidebar-section.tsx, which no longer wears it: that
// sidebar is one list now and its label has dropped to a quiet plain one (FR-6.3).
// This variant is NOT following it down. What it still dresses is a genuine stack
// of named, foldable sections inside one panel — memory, secrets, own models — and
// an eyebrow is how a reader tells one of those from the next.
//
// `group` so the chevron can rotate off the <details> element's own open state
// via the built-in `open` variant, which is a generated Tailwind class rather
// than a hand-written arbitrary selector.
const shell = cva("group", {
  variants: {
    variant: {
      card: "rounded-xl border bg-surface",
      section: "border-t border-rule first:border-t-0",
    },
    tone: {
      // The section that answers "what is happening right now" is drawn as the
      // primary one; the rest are quiet until opened.
      primary: "",
      quiet: "",
    },
  },
  // Two opacities, both from the named set, and which one a tone gets is not a
  // free choice: the primary card is the one thing on the page meant to be acted
  // on first, so it gets the weight the grammar reserves for a control's edge; a
  // quiet card is a group of fields and gets the inside-a-surface rule.
  compoundVariants: [
    { variant: "card", tone: "primary", class: "border-rule-strong" },
    { variant: "card", tone: "quiet", class: "border-rule" },
  ],
  defaultVariants: { variant: "card", tone: "quiet" },
});

const header = cva(
  "flex cursor-pointer list-none items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden",
  {
    variants: {
      variant: {
        card: "rounded-xl px-4 py-3 hover:bg-elevated/60",
        section: "gap-1.5 rounded-lg px-1 py-2 hover:bg-elevated/60",
      },
    },
    defaultVariants: { variant: "card" },
  },
);

// The title treatment. `section` wears the eyebrow that tells one section of a
// stack from the next; `card` keeps the panel heading.
const titleClass = cva("block min-w-0 truncate", {
  variants: {
    variant: {
      card: "font-display text-[13px] font-semibold text-fg",
      section: "text-xs font-semibold uppercase tracking-wide text-fg-muted",
    },
  },
  defaultVariants: { variant: "card" },
});

const bodyClass = cva("flex flex-col", {
  variants: {
    variant: {
      card: "gap-4 border-t border-rule px-4 py-4",
      // No inner rule: the section's own top border already separates it, and a
      // second line under the header would box it back up.
      section: "gap-3 px-1 pb-4 pt-1",
    },
  },
  defaultVariants: { variant: "card" },
});

export function Accordion({
  title,
  summary,
  hint,
  tone,
  variant,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  /** The section's current state, read without opening it. */
  summary: React.ReactNode;
  /** What this section is for and what to do about it, shown once opened. */
  hint?: React.ReactNode;
  tone?: "primary" | "quiet";
  /** `card` for a panel of sections, `section` for the sidebar's flat grammar. */
  variant?: "card" | "section";
  defaultOpen?: boolean;
  /**
   * Drive the section from the caller instead of letting <details> own it. Use
   * this only where something outside the section has to force it open — a
   * caller that merely wants a starting state wants `defaultOpen`.
   *
   * The alternative, remounting on a `key` to re-apply `defaultOpen`, looks
   * equivalent and is not: it also SHUT the section every time the key changed
   * back, so a user stepping through the options inside watched it close under
   * them and lose its place.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const controlled = open !== undefined;
  return (
    <details
      className={shell({ variant, tone })}
      open={controlled ? open : defaultOpen}
      onToggle={
        controlled ? (e) => onOpenChange?.((e.currentTarget as HTMLDetailsElement).open) : undefined
      }
    >
      <summary className={header({ variant })}>
        <ChevronRight
          size={variant === "section" ? 14 : 15}
          aria-hidden
          className="shrink-0 text-fg-muted transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">
          <span className={titleClass({ variant })}>{title}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{summary}</span>
        </span>
      </summary>
      <div className={bodyClass({ variant })}>
        {hint && <p className="-mt-1 max-w-[64ch] text-xs text-fg-muted">{hint}</p>}
        {children}
      </div>
    </details>
  );
}
