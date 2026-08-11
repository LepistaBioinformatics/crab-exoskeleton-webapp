"use client";

import { cva } from "class-variance-authority";
import { ChevronRight, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Insights,
  Legend,
  PathChain,
  type InsightRow,
  type LegendEntry,
} from "./memory-graph-readouts";
import type { PathResult } from "./graph-paths";
import type { ColorEncoding, MapToolsState, SizeMetric } from "./use-map-tools";
import type { ChatDict } from "@/lib/i18n/chat";

// The discovery tools, as a right-hand SIDEBAR beside the graph.
//
// It began as an absolutely-positioned overlay on the stage, and that is what broke: the overlay
// was sized against the stage, so opening the entity detail pane shrank the stage and the tools
// visibly changed height — moving the member's eye off the entity they had just clicked. As a real
// flex sibling of the graph column its height is the map area's, which the detail pane no longer
// touches.
//
// Collapsed by default in the sidebar column and open by default in fullscreen — the column is
// for LOOKING at the graph, fullscreen is for OPERATING it.
//
// Groups are independently collapsible and all start closed. Not an accordion: "colour by cluster"
// lives in Encoding and "what the clusters are" lives in Legend, and comparing them needs both.

const chip = cva(
  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
  {
    variants: {
      active: {
        true: "border-accent/40 bg-accent/15 text-accent",
        false: "border-brand/30 text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

const segment = cva(
  "flex-1 rounded-md px-2 py-1 text-[11px] transition-colors",
  {
    variants: {
      active: {
        true: "bg-accent/15 text-accent",
        false: "text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

// The map filter's scope switch. Smaller than the tab row because it qualifies an input rather
// than naming a view.
const scopeChip = cva("rounded-full border px-1.5 py-0.5 text-[10px] transition-colors", {
  variants: {
    active: {
      true: "border-accent/40 bg-accent/15 text-accent",
      false: "border-brand/30 text-fg-muted hover:text-fg",
    },
  },
  defaultVariants: { active: false },
});

// Rotated rather than swapped for a second glyph, so the open/closed states read as one control
// changing rather than two different icons.
const chevron = cva("shrink-0 transition-transform", {
  variants: { open: { true: "rotate-90", false: "" } },
  defaultVariants: { open: false },
});

/**
 * The tool groups, by stable key.
 *
 * Keys rather than labels: the labels are translated, and open/closed state keyed on a translated
 * string would reset the moment the member switched locale.
 */
export type ToolGroup = "filters" | "focus" | "encoding" | "legend" | "path" | "insights";

const HOP_RADII: MapToolsState["hopRadius"][] = [1, 2, 3];

/** What the filter input needs from the panel, which owns the query and its debounce. */
export interface MapFilter {
  value: string;
  onChange: (value: string) => void;
  /** A content search is in flight. */
  searching: boolean;
  /** The content search could not be completed — distinct from matching nothing. */
  failed: boolean;
  /** The server returned a full page of hits, so there may be more. */
  capped: boolean;
  /** The reported ceiling, for the capped message. */
  cap: number;
}

/**
 * The map's filter input and its scope switch.
 *
 * It lives INSIDE the view rather than in the panel, and that placement is the fix for a real bug:
 * fullscreen is requested on the view's own shell, so anything rendered outside it — which is where
 * this used to be — simply vanished when the member expanded the map. The filter is part of the
 * map, so it belongs in the element that becomes the map.
 *
 * The tab row deliberately stays in the panel: switching to the Entities tab from inside a
 * fullscreen graph would leave the member in fullscreen looking at a list.
 */
export function MapFilterBar({
  filter,
  tools,
  set,
  copy,
}: {
  filter: MapFilter;
  tools: MapToolsState;
  set: <K extends keyof MapToolsState>(key: K, value: MapToolsState[K]) => void;
  copy: ChatDict["memoryGraph"];
}) {
  const c = copy.mapTools;
  return (
    <div className="shrink-0 px-3 pb-2">
      <Input
        inputSize="sm"
        value={filter.value}
        onChange={(e) => filter.onChange(e.target.value)}
        placeholder={copy.mapFilterPlaceholder}
        aria-label={copy.mapFilterPlaceholder}
      />
      <div className="mt-1 flex items-center gap-1">
        <span className="text-[10px] text-fg-muted">{c.scopeLabel}</span>
        {(["names", "contents"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            aria-pressed={tools.searchScope === scope}
            title={scope === "names" ? c.scopeNamesHint : c.scopeContentsHint}
            onClick={() => set("searchScope", scope)}
            className={scopeChip({ active: tools.searchScope === scope })}
          >
            {scope === "names" ? c.scopeNames : c.scopeContents}
          </button>
        ))}
        {filter.searching && <span className="text-[10px] text-fg-muted">{c.scopeSearching}</span>}
      </div>
      {/* A FAILED search and a search that matched nothing are different facts, and the map's
          empty state can only speak to the second. */}
      {filter.failed && <p className="mt-1 text-[10px] text-danger">{c.scopeFailed}</p>}
      {filter.capped && (
        <p className="mt-1 text-[10px] text-fg-muted">
          {c.scopeCapped.replace("{count}", String(filter.cap))}
        </p>
      )}
    </div>
  );
}

/**
 * The encoding options, labelled by what they ANSWER rather than by their algorithm.
 *
 * "PageRank" and "betweenness centrality" are proper nouns that tell a member nothing about why
 * one circle is bigger. The hints carry the mechanism for anyone who wants it, and the slow one
 * says that it is slow.
 */
export const SIZE_OPTIONS: {
  value: SizeMetric;
  label: keyof ChatDict["memoryGraph"]["mapTools"];
  hint?: keyof ChatDict["memoryGraph"]["mapTools"];
}[] = [
  { value: "observations", label: "sizeObservations" },
  { value: "degree", label: "sizeDegree" },
  { value: "pagerank", label: "sizePagerank", hint: "sizePagerankHint" },
  { value: "betweenness", label: "sizeBetweenness", hint: "sizeBetweennessHint" },
];

export const COLOR_OPTIONS: {
  value: ColorEncoding;
  label: keyof ChatDict["memoryGraph"]["mapTools"];
  hint?: keyof ChatDict["memoryGraph"]["mapTools"];
}[] = [
  { value: "type", label: "colorType" },
  { value: "community", label: "colorCommunity", hint: "colorCommunityHint" },
  { value: "component", label: "colorComponent", hint: "colorComponentHint" },
];

/**
 * Toggle one relation type in the facet.
 *
 * From `null` — which means every type — picking one chip NARROWS to it rather than subtracting
 * it. That is what the click means: on a two-type graph, subtracting would look like nothing
 * happened. From then on it is an ordinary multi-select, and emptying it is allowed because
 * "entities without their connections" is a legitimate thing to want to see (GD-A3).
 *
 * Pure and exported: the null/[] distinction is the kind that reads fine and behaves backwards.
 */
export function toggleRelationType(current: string[] | null, type: string): string[] {
  if (current === null) return [type];
  return current.includes(type)
    ? current.filter((t) => t !== type)
    : [...current, type];
}

export default function MapTools({
  onClose,
  openGroups,
  onToggleGroup,
  tools,
  set,
  relationTypeDomain,
  maxObservations,
  legendDomain,
  renderedCounts,
  typeFilter,
  onTypeFilter,
  colorFor,
  insightRows,
  isolatedCount,
  onSelectEntity,
  pathMode,
  onPathModeChange,
  pathFrom,
  pathResult,
  onPathClear,
  dirty,
  onReset,
  copy,
}: {
  onClose: () => void;
  /**
   * Which groups are expanded. A LIST, not one value: several can be open at once, because the
   * questions they answer are asked together — "colour by cluster" lives in Encoding and "what are
   * the clusters" lives in Legend, and comparing them needs both.
   */
  openGroups: ToolGroup[];
  onToggleGroup: (group: ToolGroup) => void;
  tools: MapToolsState;
  set: <K extends keyof MapToolsState>(key: K, value: MapToolsState[K]) => void;
  /** Every relation type in the graph, unfiltered — see relationTypeCounts. */
  relationTypeDomain: LegendEntry[];
  /** The highest observation count in the graph, which is the floor slider's ceiling. */
  maxObservations: number;
  /** The active colour encoding's values — types, or community/component ids. */
  legendDomain: LegendEntry[];
  /** How many of each legend value are actually drawn right now. */
  renderedCounts: Map<string, number>;
  typeFilter: string | null;
  onTypeFilter: (type: string | null) => void;
  colorFor: (value: string) => string;
  /** Top entities by the active size metric, whole-graph — see Insights. */
  insightRows: InsightRow[];
  isolatedCount: number;
  onSelectEntity: (name: string) => void;
  /**
   * Path state lives in the VIEW, not in useMapTools: it is ephemeral, and GD-C3 requires the
   * endpoints to bypass the panel's `select()` entirely — that function toggles off on re-click
   * and issues an `open_nodes` request per pick.
   */
  pathMode: boolean;
  onPathModeChange: (on: boolean) => void;
  /** The first endpoint, once picked and before the second. */
  pathFrom: string | null;
  pathResult: PathResult | null;
  onPathClear: () => void;
  /** True when anything — tools, query, type filter or path mode — is off its default. */
  dirty: boolean;
  onReset: () => void;
  copy: ChatDict["memoryGraph"];
}) {
  const c = copy.mapTools;
  const activeSize = SIZE_OPTIONS.find((o) => o.value === tools.sizeBy);
  const activeColor = COLOR_OPTIONS.find((o) => o.value === tools.colorBy);

  // No positioning and no width of its own: the view renders this inside an <aside> that is a real
  // flex sibling of the graph column. It used to be an absolutely-positioned overlay sized
  // `max-h-[calc(100%-3rem)]` against the STAGE — so opening the entity detail pane shrank the
  // stage and the whole tools panel visibly changed height, pulling the member's eye away from the
  // entity they had just clicked. As a sidebar its height is the map area's, which the detail pane
  // no longer touches.
  return (
    <div className="flex h-full flex-col overflow-y-auto p-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fg">{c.open}</span>
        {/* Offered only when it can do something. A lit reset with nothing to reset makes a member
            wonder what state they are in; a disabled one that never enables is worse. */}
        <button
          type="button"
          title={dirty ? c.resetHint : c.resetNothing}
          aria-label={c.reset}
          disabled={!dirty}
          onClick={onReset}
          className="flex size-5 items-center justify-center rounded text-fg-muted transition-colors hover:text-fg disabled:opacity-30"
        >
          <RotateCcw size={12} aria-hidden />
        </button>
        <button
          type="button"
          title={c.close}
          aria-label={c.close}
          onClick={onClose}
          className="text-fg-muted transition-colors hover:text-fg"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      <Group
        title={c.filters}
        open={openGroups.includes("filters")}
        onToggle={() => onToggleGroup("filters")}
      >
        <p className="mb-1 text-[10px] text-fg-muted">{c.relationTypes}</p>
        {relationTypeDomain.length === 0 ? (
          <p className="text-[10px] text-fg-muted">{c.noRelationTypes}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                aria-pressed={tools.relationTypes === null}
                onClick={() => set("relationTypes", null)}
                className={chip({ active: tools.relationTypes === null })}
              >
                {c.relationTypesAll}
              </button>
              {relationTypeDomain.map(({ type }) => {
                const on = tools.relationTypes?.includes(type) ?? false;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("relationTypes", toggleRelationType(tools.relationTypes, type))
                    }
                    className={chip({ active: on })}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            {/* An empty list is legitimate but easy to reach by accident, so it explains
                itself rather than looking like the relations failed to load. */}
            {tools.relationTypes?.length === 0 && (
              <p className="mt-1 text-[10px] leading-snug text-fg-muted">
                {c.relationTypesNone}
              </p>
            )}
          </>
        )}

        {/* Hidden when it could do nothing: a slider with one reachable position is worse
            than no slider. */}
        {maxObservations > 0 && (
          <label className="mt-2 block">
            <span className="text-[10px] text-fg-muted">
              {tools.minObservations === 0
                ? c.minObservationsAny
                : c.minObservations.replace("{count}", String(tools.minObservations))}
            </span>
            <input
              type="range"
              min={0}
              max={maxObservations}
              value={tools.minObservations}
              onChange={(e) => set("minObservations", Number(e.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </label>
        )}
      </Group>

      <Group
        title={c.focus}
        open={openGroups.includes("focus")}
        onToggle={() => onToggleGroup("focus")}
      >
        <div className="flex items-center gap-0.5 rounded-md border border-brand/30 p-0.5">
          {HOP_RADII.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={tools.hopRadius === r}
              onClick={() => set("hopRadius", r)}
              className={segment({ active: tools.hopRadius === r })}
            >
              {(r === 1 ? c.focusHops : c.focusHopsPlural).replace("{count}", String(r))}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-fg-muted">{c.focusHint}</p>
      </Group>

      <Group
        title={c.encoding}
        open={openGroups.includes("encoding")}
        onToggle={() => onToggleGroup("encoding")}
      >
        <label className="block">
          <span className="text-[10px] text-fg-muted">{c.sizeBy}</span>
          <select
            value={tools.sizeBy}
            onChange={(e) => set("sizeBy", e.target.value as SizeMetric)}
            className="mt-0.5 w-full rounded-md border border-brand/30 bg-elevated px-1.5 py-1 text-[11px] text-fg"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {c[o.label]}
              </option>
            ))}
          </select>
        </label>
        {activeSize?.hint && (
          <p className="mt-1 text-[10px] leading-snug text-fg-muted">{c[activeSize.hint]}</p>
        )}

        <label className="mt-2 block">
          <span className="text-[10px] text-fg-muted">{c.colorBy}</span>
          <select
            value={tools.colorBy}
            onChange={(e) => set("colorBy", e.target.value as ColorEncoding)}
            className="mt-0.5 w-full rounded-md border border-brand/30 bg-elevated px-1.5 py-1 text-[11px] text-fg"
          >
            {COLOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {c[o.label]}
              </option>
            ))}
          </select>
        </label>
        {activeColor?.hint && (
          <p className="mt-1 text-[10px] leading-snug text-fg-muted">{c[activeColor.hint]}</p>
        )}
      </Group>

      <Group
        title={c.legend}
        open={openGroups.includes("legend")}
        onToggle={() => onToggleGroup("legend")}
      >
        <Legend
          domain={legendDomain}
          renderedCounts={renderedCounts}
          active={typeFilter}
          onPick={onTypeFilter}
          colorFor={colorFor}
          // Only the type encoding has a filter to drive. See Legend's `interactive` note.
          interactive={tools.colorBy === "type"}
          copy={copy}
        />
      </Group>

      <Group
        title={c.path}
        open={openGroups.includes("path")}
        onToggle={() => onToggleGroup("path")}
      >
        <button
          type="button"
          aria-pressed={pathMode}
          onClick={() => onPathModeChange(!pathMode)}
          className={segment({ active: pathMode })}
        >
          {pathMode ? c.pathDisable : c.pathEnable}
        </button>
        {pathMode && (
          <div className="mt-1.5">
            {pathResult ? (
              <>
                <PathChain result={pathResult} copy={copy} />
                <button
                  type="button"
                  onClick={onPathClear}
                  className="mt-1 text-[10px] text-accent underline-offset-2 hover:underline"
                >
                  {c.pathClear}
                </button>
              </>
            ) : (
              <p className="text-[10px] leading-snug text-fg-muted">
                {pathFrom ? (
                  <>
                    {c.pathFrom}: <span className="font-medium text-fg">{pathFrom}</span>
                    <br />
                    {c.pathPickSecond}
                  </>
                ) : (
                  c.pathPickFirst
                )}
              </p>
            )}
            <p className="mt-1 text-[9px] leading-snug text-fg-muted">{c.pathUndirectedHint}</p>
          </div>
        )}
      </Group>

      <Group
        title={c.insights}
        open={openGroups.includes("insights")}
        onToggle={() => onToggleGroup("insights")}
      >
        <Insights
          rows={insightRows}
          metricLabel={activeSize ? c[activeSize.label] : ""}
          isolatedCount={isolatedCount}
          onSelect={onSelectEntity}
          copy={copy}
        />
      </Group>
    </div>
  );
}

/** The collapsed affordance, floated over the stage. Separate because the open panel is a sidebar. */
export function MapToolsButton({
  onOpen,
  copy,
}: {
  onOpen: () => void;
  copy: ChatDict["memoryGraph"];
}) {
  return (
    <button
      type="button"
      title={copy.mapTools.open}
      aria-label={copy.mapTools.open}
      onClick={onOpen}
      className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md border border-brand/30 bg-surface/90 text-fg-muted transition-colors hover:text-fg"
    >
      <SlidersHorizontal size={13} aria-hidden />
    </button>
  );
}

/**
 * One collapsible group.
 *
 * Independent, not an accordion: opening one never closes another, because the questions these
 * answer are asked together — "colour by cluster" and "what are the clusters" are the encoding and
 * the legend, and a member comparing them needs both on screen.
 *
 * All closed on arrival. Six groups expanded at once is a wall of controls in a sidebar; closed,
 * the member sees the six things the panel can do and opens what they came for.
 */
function Group({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-brand/20 first-of-type:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-1 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-fg-muted transition-colors hover:text-fg"
      >
        <ChevronRight
          size={11}
          aria-hidden
          className={chevron({ open })}
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
