"use client";

import { cva } from "class-variance-authority";
import type { PathResult } from "./graph-paths";
import type { ChatDict } from "@/lib/i18n/chat";

// The map's read-only surfaces: what the colours mean, and what a node is before you commit to
// clicking it. Split out of memory-graph-view.tsx, which owns the Cytoscape lifecycle and had
// no business also owning presentation.
//
// Everything here is presentational and rendered directly in tests. The one piece of
// arithmetic — clampToStage — is pure and exported, because the map's first version drowned in
// hand-rolled coordinate maths and this is the only bit of it left.

const legendRow = cva(
  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
  {
    variants: {
      active: {
        true: "bg-accent/15 text-accent",
        false: "text-fg-muted hover:text-fg",
      },
      /** A type the current filter left with nothing on screen. Still listed, visibly quiet. */
      empty: { true: "opacity-50", false: "" },
    },
    defaultVariants: { active: false, empty: false },
  },
);

export interface LegendEntry {
  type: string;
  count: number;
}

/**
 * The colour key, and the map's type filter.
 *
 * `domain` is every type in the WHOLE graph; `renderedCounts` is how many of each are actually
 * drawn. They differ on purpose. If the rows came from what is rendered, clicking a type would
 * collapse the legend to that single row — `typeFilter` is a hard gate — leaving no other type
 * visible to switch to and no way back except a control in a different section of the panel. A
 * legend that empties itself on click is a dead end, so the domain is stable and a filtered-out
 * type simply reads zero.
 */
export function Legend({
  domain,
  renderedCounts,
  active,
  onPick,
  colorFor,
  interactive = true,
  copy,
}: {
  domain: LegendEntry[];
  renderedCounts: Map<string, number>;
  active: string | null;
  /** Called with the type, or null when the active row is clicked again to clear it. */
  onPick: (type: string | null) => void;
  /** Resolved from the app's CSS tokens by the view, which is the only place that can read them. */
  colorFor: (value: string) => string;
  /**
   * SPEC_DEVIATION: GD-A1 said community and component rows would "select that group".
   * Reason: there is no group filter among the facets to drive, and inventing one would mean
   * a third claimant on the `faded` class alongside selection and path — which NFR-4b exists
   * to forbid. Under those encodings the legend is a colour KEY, not a control. The discovery
   * value (seeing and counting the clusters) is unaffected.
   */
  interactive?: boolean;
  copy: ChatDict["memoryGraph"];
}) {
  if (domain.length === 0) {
    return (
      <p className="px-1.5 text-[11px] text-fg-muted">{copy.empty.body}</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {domain.map(({ type, count }) => {
        const shown = renderedCounts.get(type) ?? 0;
        const isActive = active === type;
        return (
          <button
            key={type}
            type="button"
            disabled={!interactive}
            aria-pressed={interactive ? isActive : undefined}
            title={shown === 0 ? copy.mapTools.legendHiddenByFilter : undefined}
            onClick={() => interactive && onPick(isActive ? null : type)}
            className={legendRow({ active: isActive, empty: shown === 0 })}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(type) }}
            />
            <span className="min-w-0 flex-1 truncate">{type}</span>
            {/* Rendered count, not the graph-wide one: the legend explains the picture on
                screen, so a number that disagreed with what is countable in front of the
                member would read as a defect. `count` is the graph-wide total, kept in the
                title for when they differ. */}
            <span className="font-mono tabular-nums" title={String(count)}>
              {shown}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface InsightRow {
  name: string;
  /** Already formatted by the caller — a count and a proportion read differently. */
  value: string;
  /** False when the entity is not currently drawn. See below. */
  onMap: boolean;
}

/**
 * The strongest entities by the active metric, and how much the agent knows but never connected.
 *
 * Scores are whole-graph (context.md D-2), while the map draws at most `MAX_NODES` and fewer
 * under a filter. So a row here CAN name an entity that is not on screen. That is stated on the
 * row rather than hidden: clicking it opens the detail pane — `select()` handles a name outside
 * the current list — but the map will not highlight anything, and an unexplained dead click is
 * worse than a labelled one.
 */
export function Insights({
  rows,
  metricLabel,
  isolatedCount,
  onSelect,
  copy,
}: {
  rows: InsightRow[];
  metricLabel: string;
  isolatedCount: number;
  onSelect: (name: string) => void;
  copy: ChatDict["memoryGraph"];
}) {
  const c = copy.mapTools;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-fg-muted">
        {c.insightsTop.replace("{metric}", metricLabel)}
      </p>
      <div className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => onSelect(r.name)}
            title={r.onMap ? r.name : `${r.name} — ${c.insightsOffMap}`}
            className={legendRow({ active: false, empty: !r.onMap })}
          >
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {!r.onMap && (
              <span className="shrink-0 text-[9px] italic">{c.insightsOffMap}</span>
            )}
            <span className="shrink-0 font-mono tabular-nums">{r.value}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-fg-muted">
        {isolatedCount === 0
          ? c.insightsIsolatedNone
          : isolatedCount === 1
            ? c.insightsIsolatedOne
            : c.insightsIsolated.replace("{count}", String(isolatedCount))}
      </p>
      <p className="text-[9px] leading-snug text-fg-muted">{c.insightsScope}</p>
    </div>
  );
}

/**
 * The traced route, written out.
 *
 * A highlighted path on a dense graph is still read edge by edge, at whatever zoom the member
 * happens to be at. The chain says the same thing in one line of text.
 *
 * The arrow follows each step's STORED direction, not the direction of travel — rendering
 * `A —relation→ B` for an edge the agent wrote as `B → A` would assert a relation that does not
 * exist. The path is searched undirected; that does not license misreporting it.
 */
export function PathChain({
  result,
  copy,
}: {
  result: PathResult;
  copy: ChatDict["memoryGraph"];
}) {
  const c = copy.mapTools;

  if (result.kind === "endpoint-missing") {
    return (
      <div>
        <p className="text-[11px] text-fg">
          {c.pathMissing.replace("{names}", result.missing.join(", "))}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">{c.pathMissingHint}</p>
      </div>
    );
  }

  if (result.kind === "unreachable") {
    return (
      <div>
        <p className="text-[11px] text-fg">{c.pathUnreachable}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">{c.pathUnreachableHint}</p>
      </div>
    );
  }

  if (result.steps.length === 0) {
    return <p className="text-[11px] text-fg-muted">{c.pathSame}</p>;
  }

  return (
    <p className="text-[11px] leading-relaxed text-fg">
      <span className="font-medium">{result.nodes[0]}</span>
      {result.steps.map((s, i) => (
        <span key={`${s.from}-${s.to}-${i}`}>
          <span className="text-fg-muted">
            {" "}
            {s.reversed ? "←" : "—"}
            {s.relation ? ` ${s.relation} ` : " "}
            {s.reversed ? "—" : "→"}{" "}
          </span>
          <span className="font-medium">{s.to}</span>
        </span>
      ))}
    </p>
  );
}

export interface HoverNode {
  name: string;
  type: string;
  observations: number;
  relations: number;
}

/**
 * What a node is, before the member commits to clicking it.
 *
 * The detail pane costs a request (`open_nodes`) and takes half the column. Wanting to know
 * which node you are looking at should not cost either.
 */
export function HoverCard({
  node,
  left,
  top,
  copy,
}: {
  node: HoverNode;
  left: number;
  top: number;
  copy: ChatDict["memoryGraph"];
}) {
  return (
    <div
      // Positioned, so this is inline by necessity rather than by preference.
      style={{ left, top }}
      className="pointer-events-none absolute z-10 max-w-[200px] rounded-md border border-brand/30 bg-surface/95 px-2 py-1.5 text-[11px] shadow-sm"
    >
      <p className="truncate font-medium text-fg">{node.name}</p>
      <p className="truncate text-fg-muted">
        {copy.mapTools.hoverType}: {node.type}
      </p>
      <p className="text-fg-muted">
        <span className="font-mono tabular-nums">{node.observations}</span>{" "}
        {copy.observations} ·{" "}
        <span className="font-mono tabular-nums">{node.relations}</span>{" "}
        {copy.relations}
      </p>
    </div>
  );
}

/**
 * Where to put the hover card so it stays on the stage.
 *
 * Prefers below-and-right of the node, flips to the other side of each axis when that would
 * overflow, and clamps as a last resort for a card that cannot fit at all. In a ~280px sidebar
 * column the flip is not an edge case — it is most of the right-hand half of the graph.
 *
 * Pure and exported: the position comes from `node.renderedPosition()`, which is a library call
 * that already accounts for pan and zoom, so this is the ONLY arithmetic left and it is the
 * kind that is invisible until a member hovers the wrong node.
 */
export function clampToStage(
  pos: { x: number; y: number },
  card: { w: number; h: number },
  stage: { w: number; h: number },
  gap = 12,
): { left: number; top: number } {
  let left = pos.x + gap;
  if (left + card.w > stage.w) left = pos.x - gap - card.w;
  let top = pos.y + gap;
  if (top + card.h > stage.h) top = pos.y - gap - card.h;
  // Math.max before Math.min, so a card larger than the stage lands at 0 rather than negative.
  return {
    left: Math.max(0, Math.min(left, stage.w - card.w)),
    top: Math.max(0, Math.min(top, stage.h - card.h)),
  };
}
