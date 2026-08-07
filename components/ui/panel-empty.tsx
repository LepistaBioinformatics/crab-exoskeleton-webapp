import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// The one "nothing to show here" surface for both sidebars.
//
// Every branch used to be hand-rolled at its call site, and they drifted into three
// alignments, three type scales and two structures — the knowledge graph alone showed
// four different treatments across its four sub-tabs, one of which painted a blank
// pane. A single component is the only thing that keeps them together.
//
// Copy arrives as STRINGS, not through useT: memory-graph-views.tsx is deliberately a
// set of pure functions of props so the `environment: "node"` suite can render them
// directly, and a context lookup in here would put that back.

// ONE anchor: a block at the top of whatever container holds it, directly under the
// tab bar or filter the member was just using. The graph map briefly had a variant that
// centred it vertically, since that pane owns its whole height — seen side by side with
// the others it just read as a fourth inconsistency, which is the thing this component
// exists to remove.
const PANEL_EMPTY = "px-4 py-8 text-center";

export interface PanelEmptyProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** The lucide component itself, so the size and tone stay with the primitive. */
  icon?: LucideIcon;
  /** What happened. One short line — never a paragraph. */
  title: string;
  /** What to do next. Optional: a state with nothing to add is not padded with filler. */
  body?: string;
}

export function PanelEmpty({
  icon: Icon,
  title,
  body,
  className,
  ...props
}: PanelEmptyProps) {
  return (
    <div
      // The marker the structural test asserts on. It is what mechanically proves a
      // branch went through this component rather than through look-alike markup.
      data-empty-state=""
      className={cn(PANEL_EMPTY, className)}
      {...props}
    >
      {Icon && (
        <Icon
          size={20}
          className="mx-auto mb-2 text-fg-muted opacity-60"
          aria-hidden
        />
      )}
      <p className="font-display text-sm font-semibold text-fg">{title}</p>
      {body && (
        <p className="mx-auto mt-1 max-w-[22rem] text-xs leading-relaxed text-fg-muted">
          {body}
        </p>
      )}
    </div>
  );
}
