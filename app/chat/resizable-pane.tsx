"use client";

import { MouseEvent, ReactNode } from "react";
import { cva } from "class-variance-authority";
import { CircleArrowRight, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// A sidebar column that, on DESKTOP (md+), can be resized by dragging its right
// edge (clamped between `minWidth` and a max) and collapsed to a thin rail (the
// collapse control lives in the bar's own header; this renders the rail's
// expand affordance). On MOBILE it is an off-canvas overlay drawer (unchanged)
// — collapse/resize don't apply there. Width is driven by the `--pane-w` CSS
// var so it only takes effect at md+ (mobile keeps a fixed overlay width).
const pane = cva(
  "relative z-40 border-r border-brand/30 bg-surface max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:w-[300px] max-md:shadow-xl max-md:transition-transform md:shrink-0",
  {
    variants: {
      open: { true: "max-md:translate-x-0", false: "max-md:-translate-x-full" },
      collapsed: { true: "md:w-12", false: "md:w-[var(--pane-w)]" },
    },
    defaultVariants: { open: false, collapsed: false },
  },
);

// The content's three states, as ONE variant with mutually exclusive values rather
// than two booleans plus a compound.
//
// That shape is load-bearing, not stylistic. The first version had
// `collapsed: {true: "md:hidden"}` and a compound adding `md:block`, so the peeking
// element carried BOTH — and Tailwind emits `.md\:hidden` after `.md\:block`, same
// specificity, so `display: none` won and the hover preview never appeared at all.
// Nothing in the type system or the build catches two display utilities fighting.
// Keep these mutually exclusive so the situation cannot recur.
//
// The collapsed pane stays RENDERED and slides out of frame on a transform, rather
// than being `display: none`: a display change cannot be animated, so the preview would
// pop instead of sliding, and the pane is an overlay so moving it costs no layout.
//
// Hidden with `visibility`, NOT with pointer-events. An off-frame pane that is merely
// unclickable is still TABBABLE — a keyboard user would land inside a sidebar they
// cannot see, which is what `md:hidden` used to prevent. `visibility: hidden` takes it
// out of the tab order and blocks pointer events, while still letting the transform
// transition run. Note `invisible`/`visible` are one property, so they carry the same
// ordering hazard as display did — another reason these stay mutually exclusive.
//
// The slide is on the way IN. Leaving hides immediately: visibility is discrete, and
// animating a departure nobody is looking at buys nothing. Reduced motion is handled
// globally in globals.css, which neutralises every transition — no per-class variant.
//
// Overlay rather than widening the column: widening would reflow the whole conversation
// on a mouse-over, which is jarring for something this transient. The `<aside>` keeps
// its 48px rail footprint, so nothing moves, and the root shell clips overflow so the
// parked pane never produces a scrollbar. `left-12` starts it after the rail — see the
// `rail` cva below for why that offset is load-bearing.
const PEEK_BASE =
  "md:absolute md:inset-y-0 md:left-12 md:z-10 md:w-[var(--pane-w)] md:border-r md:border-brand/30 md:bg-surface md:shadow-xl md:transition-transform md:duration-200 md:ease-out";

export const content = cva("h-full", {
  variants: {
    mode: {
      expanded: "",
      // Parked off-frame and out of the tab order while it is out of sight.
      collapsed: `${PEEK_BASE} md:invisible md:-translate-x-full`,
      peeking: `${PEEK_BASE} md:visible md:translate-x-0`,
    },
  },
  defaultVariants: { mode: "expanded" },
});

// The collapsed rail, and the canonical statement of why it is never covered.
//
// The peeking overlay used to sit at `left-0` and paint over this column, which made
// the very button that opens the pane unclickable the moment hovering revealed the
// preview. Two independent guards now: the overlay starts at `left-12`, past this
// column, and `relative md:z-20` keeps the rail above it (z-10) regardless.
const rail = cva(
  "relative hidden h-full flex-col items-center gap-1 pt-3 md:z-20",
  {
    variants: { collapsed: { true: "md:flex", false: "md:hidden" } },
    defaultVariants: { collapsed: false },
  },
);

// A rail icon: a hint at what the pane holds, and a way straight into that panel. The
// active one is filled so the rail says which panel the pane would open on.
const railIcon = cva(
  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
  {
    variants: {
      active: {
        true: "bg-accent/15 text-accent",
        false: "text-fg-muted hover:bg-elevated hover:text-fg",
      },
      emphasis: { true: "text-accent", false: "" },
    },
    // `active` wins: an emphasised entry that is also the current one should read as
    // current, and the two tints applied together would just be the accent twice.
    compoundVariants: [{ active: true, emphasis: true, class: "text-accent" }],
    defaultVariants: { active: false, emphasis: false },
  },
);

// Project initials. Uppercase and tabular so a column of them lines up.
const railInitials = cva("text-[10px] font-semibold uppercase tracking-tight");

/** One entry the collapsed rail advertises, and the way into it. */
export interface RailPanel {
  key: string;
  Icon: LucideIcon;
  label: string;
  active: boolean;
  /**
   * Chooses this entry. Required: an entry with nothing behind it is left out of the
   * list rather than rendered as a control that does nothing.
   */
  onSelect: () => void;
  /**
   * Two or three letters drawn instead of the icon — used for projects, where the
   * name is what tells one apart from the next and a row of identical folder glyphs
   * would say nothing. The icon stays as the fallback for a nameless entry.
   */
  initials?: string;
  /** Tints the entry the accent even when inactive — the new-chat action. */
  emphasis?: boolean;
}

// The rail is GROUPS, not one list, because it now mixes two kinds of entry that must
// not read as one another: the panels (which choose what the pane would show), the
// projects (which NAVIGATE), and the actions (which do something immediately). A
// hairline between them is what keeps a click from meaning the wrong verb.
export type RailGroup = RailPanel[];

const MAX_WIDTH = 480;

export default function ResizablePane({
  ariaLabel,
  open,
  collapsed,
  width,
  minWidth,
  onExpand,
  onResize,
  groups,
  peeking,
  onPeekChange,
  children,
}: {
  ariaLabel: string;
  open: boolean;
  collapsed: boolean;
  width: number;
  minWidth: number;
  onExpand: () => void;
  onResize: (width: number) => void;
  /** What the collapsed rail advertises, in groups separated by a hairline. */
  groups: RailGroup[];
  /**
   * Whether the collapsed pane is showing its hover preview. Owned by the caller, not
   * here, because the PREVIEWED panel renders its own collapse control — and that
   * control has to be able to end the preview instead of calling collapse on a pane
   * that is already collapsed, which is a no-op and reads as a broken button.
   */
  peeking: boolean;
  onPeekChange: (peeking: boolean) => void;
  children: ReactNode;
}) {
  const t = useT(chatCopy);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: globalThis.MouseEvent) => {
      const next = startWidth + (ev.clientX - startX);
      // Clamp between min and max -- at the minimum it just stops shrinking; it
      // does not collapse (collapse is an explicit header action).
      onResize(Math.max(minWidth, Math.min(next, MAX_WIDTH)));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <aside
      aria-label={ariaLabel}
      style={{ "--pane-w": `${width}px` } as React.CSSProperties}
      className={pane({ open, collapsed })}
      // Only while collapsed: an expanded pane has nothing to preview, and wiring
      // these unconditionally would re-render it on every crossing of the sidebar.
      onMouseEnter={collapsed ? () => onPeekChange(true) : undefined}
      onMouseLeave={collapsed ? () => onPeekChange(false) : undefined}
    >
      <div
        className={content({
          mode: !collapsed ? "expanded" : peeking ? "peeking" : "collapsed",
        })}
      >
        {children}
      </div>

      <div className={rail({ collapsed })}>
        {/* The ONLY control that opens the pane. Its mirror is the header's collapse
            button, which the pane hides while collapsed, so the two never appear at
            once — one circled arrow pointing right to open, one pointing left to close,
            so the pair reads as one control in two states rather than two glyphs. */}
        <IconButton variant="ghost" size="sm" aria-label={`${t.pane.expand} ${ariaLabel}`} onClick={onExpand}>
          <CircleArrowRight size={18} aria-hidden />
        </IconButton>

        {/* What the pane holds, so a collapsed rail is not an unlabelled sliver.
            Clicking one opens the pane ON that panel, which is why they are buttons
            and not decoration. */}
        {/* These CHOOSE a panel; they deliberately do not open the pane. Opening on
            click pinned the sidebar open on what was meant to be a glance, so the two
            jobs are split: the icons say which panel the hover preview shows, the arrow
            above decides whether the pane is open at all.

            Never `disabled` either — a disabled button swallows the click, so an icon
            that looked like a way in became a dead end. A panel with nothing to show is
            left out of the list upstream instead of rendered inert. */}
        {/* Scrolls, and only this part of the rail does: a workspace with a dozen
            projects must not push the expand control off the bottom of the column.
            `scrollbar-none` because a visible bar inside a 48px rail is most of it. */}
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((group, gi) => (
            <div key={gi} className="flex w-full flex-col items-center gap-1">
              {/* Hairline between groups, never before the first: the rule is a
                  separator, and one at the top would read as a border under the
                  expand control instead. */}
              {gi > 0 && group.length > 0 && (
                <span className="my-1 h-px w-6 shrink-0 bg-brand/30" aria-hidden />
              )}
              {group.map(({ key, Icon, label, active, onSelect, initials, emphasis }) => (
                <button
                  key={key}
                  type="button"
                  aria-current={active || undefined}
                  aria-label={label}
                  title={label}
                  onClick={onSelect}
                  className={railIcon({ active, emphasis })}
                >
                  {initials ? (
                    <span className={railInitials()} aria-hidden>
                      {initials}
                    </span>
                  ) : (
                    <Icon size={17} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`${t.pane.resize} ${ariaLabel}`}
          onMouseDown={startResize}
          className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
        />
      )}
    </aside>
  );
}
