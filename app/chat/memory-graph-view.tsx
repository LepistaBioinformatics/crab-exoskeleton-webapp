"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import { Search, Share2 } from "lucide-react";
import { buildElements } from "./graph-elements";
import {
  computeBaseMetrics,
  computeBetweenness,
  computeCommunities,
} from "./graph-metrics";
import { buildStylesheet, colorIndexFor, type Palette } from "./graph-stylesheet";
import { findPath, type PathResult } from "./graph-paths";
import { applyHighlight } from "./graph-highlight";
import MapTools, {
  MapFilterBar,
  MapToolsButton,
  type MapFilter,
  type ToolGroup,
} from "./memory-graph-tools";
import {
  clampToStage,
  HoverCard,
  type HoverNode,
  type InsightRow,
  type LegendEntry,
} from "./memory-graph-readouts";
import { isDefaultTools, type MapToolsState } from "./use-map-tools";
import { PanelEmpty } from "@/components/ui/panel-empty";
import type { ChatDict } from "@/lib/i18n/chat";
import {
  legendTypeCounts,
  relationTypeCounts,
  type Relation,
  type SummaryEntity,
} from "@/lib/memoryGraph";

// The knowledge graph as a node-link diagram, rendered by Cytoscape.
//
// This replaced a hand-rolled SVG version over a d3-force layout. That version looked
// plausible in a screenshot and was unusable in practice: the layout spanned far more than
// the panel's column so the fit reduced everything to about a quarter scale, every label
// drew unconditionally and overlapped, edges had no direction, and pan/zoom was my own
// broken viewBox arithmetic. Cytoscape owns exactly those parts — layout, label collision,
// hit-testing, pan/zoom, arrowheads.
//
// The trade, accepted knowingly: Cytoscape styles through its own stylesheet rather than
// the app's CSS vars, so the theme has to be READ and passed in (readPalette) instead of
// being inherited for free. That was the one argument for hand-rolling, and it did not
// survive contact with the result.

/** Entity-type palette, resolved from the app's own tokens at build time of the graph. */
const PALETTE_VARS = [
  "--color-accent",
  "--color-brand",
  "--color-syntax-string",
  "--color-syntax-number",
  "--color-syntax-keyword",
  "--color-syntax-name",
];

// 0.5x is the DEFAULT, not the middle of the range: at 1x the graph opened wider than it
// needed to and the first thing anyone did was pull it in. The range runs upward from here
// because a dense graph is the case that needs the room, not a sparse one.
const MIN_SPREAD = 0.5;
const DEFAULT_SPREAD = 0.5;
const MAX_SPREAD = 8;

const PALETTE_FALLBACK = ["#64c5eb", "#663a88", "#1f7a4d", "#a35200", "#0d6e8c", "#c79ae8"];

/**
 * The hover card's assumed size, for keeping it on the stage.
 *
 * Measuring the real element would mean rendering it off-screen first and reading it back on
 * every hover. A constant matched to its `max-w` and its three lines of text is close enough:
 * the consequence of being a few pixels out is a card a few pixels from the edge.
 */
const HOVER_CARD = { w: 200, h: 64 };

function readPalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    types: PALETTE_VARS.map((name, i) => v(name, PALETTE_FALLBACK[i])),
    fg: v("--color-fg", "#0a2933"),
    muted: v("--color-fg-muted", "#5a6b72"),
    bg: v("--color-bg", "#ffffff"),
    edge: v("--color-brand", "#663a88"),
  };
}

export default function MemoryGraphView({
  entities,
  relations,
  typeFilter,
  query,
  matchNames,
  filter,
  selected,
  onSelect,
  tools,
  setTool,
  onTypeFilter,
  onResetFilters,
  detail,
  copy,
}: {
  entities: SummaryEntity[];
  relations: Relation[];
  /** The panel's type filter, honoured here too so the narrowing survives a tab switch. */
  typeFilter: string | null;
  /** The legend drives the panel's type filter rather than a second notion of it — GD-A1. */
  onTypeFilter: (type: string | null) => void;
  /**
   * Restores the panel-owned state to its defaults: the tools, the query, and the entity-type
   * filter. Path mode is this view's and is cleared here — see resetEverything.
   */
  onResetFilters: () => void;
  /**
   * The selected entity's detail pane, handed in by the panel and rendered inside the GRAPH COLUMN.
   *
   * It used to be a sibling of the whole map, below it. That made the map area shrink when it
   * opened, and the tools panel was sized against the map area — so selecting an entity visibly
   * resized the tools, pulling the eye away from the thing that had just been clicked. Rendered
   * here it takes space from the graph only, and the sidebar beside it does not move.
   */
  detail?: ReactNode;
  /** The discovery-tool state, owned by the panel so it survives a tab switch. */
  tools: MapToolsState;
  setTool: <K extends keyof MapToolsState>(key: K, value: MapToolsState[K]) => void;
  /** Substring over entity names — see GraphFilter for why this is not the Search tab. */
  query: string;
  /**
   * The server's BM25 hit names, when the filter's scope is `contents`. Null when the filter is
   * matching names locally. Must be STATE in the panel, never derived per render — see NFR-4c.
   */
  matchNames: Set<string> | null;
  /**
   * The filter input's state, owned by the panel because the panel owns the debounce and the
   * request. Rendered HERE so it is inside the element that goes fullscreen.
   */
  filter: MapFilter;
  selected: string | null;
  onSelect: (name: string | null) => void;
  /**
   * The whole `memoryGraph` dictionary, not a label per control.
   *
   * This replaced eleven individual label props. `EntityDetail` established passing `copy`,
   * and the panel already hands it `t.memoryGraph` whole; spelling the keys out again as a
   * structural subset would be thirty-odd lines that have to be kept in sync with the
   * dictionary by hand for no added safety.
   */
  copy: ChatDict["memoryGraph"];
}) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  // A graph in a ~280px column is cramped by construction, and that — not the zoom range —
  // is what made the earlier version unreadable. Full screen is the state this view is
  // usable in.
  //
  // Done with the FULLSCREEN API, not by repositioning. Two earlier attempts failed for
  // reasons worth keeping: `position: fixed` was contained by the sidebar's transformed
  // sliding track, so it never covered the viewport; and portalling to <body> made React
  // build a NEW container div, leaving Cytoscape attached to a detached node — the graph
  // simply vanished. requestFullscreen moves nothing in the DOM, so the instance survives.
  const shell = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // How far apart the layout pushes things. Exposed because the right spread depends on the
  // graph: a dozen entities want them close enough to read as one picture, a hundred want
  // room to separate into clusters, and no single constant serves both.
  //
  // The range reaches 8x rather than 4x because a dense graph genuinely needs it, and the
  // current multiplier is SHOWN — the first version was two near-identical arrow glyphs
  // with no readout, so there was no way to tell them apart or to know where you were.
  const [spread, setSpread] = useState(DEFAULT_SPREAD);
  // Kept in a ref so the tap handler never goes stale without rebuilding the graph, which
  // would re-run the layout and move every node.
  const select = useRef(onSelect);
  select.current = onSelect;
  // Reassigned every render so the tap handler reads current state without the graph being
  // rebuilt to refresh a closure — a rebuild re-runs the layout.
  const onNodeTap = useRef<(id: string) => void>(() => {});
  const onBackgroundTap = useRef<() => void>(() => {});
  const spreadLabel = copy.spreadReadout.replace("{value}", String(spread));
  // The tools panel's own open state. Seeded from `expanded` by the effect below: the column is
  // for LOOKING at the graph, fullscreen is for OPERATING it (see context.md D-5).
  const [toolsOpen, setToolsOpen] = useState(false);
  // Every group starts CLOSED. Six expanded groups is a wall of controls; closed, the panel reads as
  // a menu of the six things it can do. Held here rather than inside MapTools so collapsing the
  // sidebar and reopening it does not throw away what the member had expanded.
  const [openGroups, setOpenGroups] = useState<ToolGroup[]>([]);
  const toggleGroup = (group: ToolGroup) =>
    setOpenGroups((cur) =>
      cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group],
    );
  const [hover, setHover] = useState<{ node: HoverNode; left: number; top: number } | null>(
    null,
  );
  // Path state is the view's, not useMapTools': it is ephemeral, and its endpoints must NOT go
  // through the panel's select() — that toggles off on re-click and fires an open_nodes request
  // per pick, so two picks would mean two requests and clicking the already-picked node would
  // clear the state mid-trace (GD-C3).
  const [pathMode, setPathMode] = useState(false);
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [path, setPath] = useState<PathResult | null>(null);
  // The theme, read from the app's tokens once per graph build. Held BOTH ways on purpose: the
  // legend renders, so it needs state; the stylesheet effect runs after a paint, so it needs a
  // ref that is always current without being a dependency.
  const [palette, setPalette] = useState<Palette | null>(null);
  const paletteRef = useRef<Palette | null>(null);

  // Built ONCE per graph-and-filter, and shared with the effect below. It was computed twice
  // — once to feed Cytoscape, once in the render path — and the render copy re-ran on every
  // re-render (hover, selection, spread, fullscreen). That is a filter plus a sort over the
  // whole graph repeated for nothing, which undercuts the point of capping the node count.
  //
  // EVERY facet has to be in these deps. A missing one makes its control do nothing at all,
  // with no error anywhere — and `relationTypes` is only safe to depend on by identity because
  // `useMapTools` holds it in state rather than rebuilding it per render.
  const built = useMemo(
    () =>
      buildElements(entities, relations, {
        type: typeFilter,
        query,
        matchNames,
        relationTypes: tools.relationTypes,
        minObservations: tools.minObservations,
      }),
    [
      entities,
      relations,
      typeFilter,
      query,
      matchNames,
      tools.relationTypes,
      tools.minObservations,
    ],
  );

  // The colour domain is the WHOLE graph's types, not the rendered ones.
  //
  // This is a fix, not just a new input. The stylesheet used `built.types`, which shrinks under
  // a filter — so narrowing to one type moved it to index 0 and every node CHANGED COLOUR. That
  // was invisible while nothing named the colours; with a legend it would be a legend that
  // lies. Alphabetical over the unfiltered set is stable under every filter.
  const colorDomain = useMemo(
    () => [...new Set(entities.map((e) => e.type || "unknown"))].sort(),
    [entities],
  );

  // Whole-graph metrics (context.md D-2), split by cost. These depend on `entities`/`relations`
  // and NOT on `built` — narrowing a facet must not recompute them, and "most central" must not
  // change because the member looked at a subset.
  //
  // Deliberately NOT inputs to `buildElements`: if they were, `built` would depend on them and
  // switching to betweenness would re-run the layout. They are written into node data instead.
  const base = useMemo(() => computeBaseMetrics(entities, relations), [entities, relations]);
  const communities = useMemo(
    () => (tools.colorBy === "community" ? computeCommunities(entities, relations) : null),
    [entities, relations, tools.colorBy],
  );
  const betweenness = useMemo(
    () => (tools.sizeBy === "betweenness" ? computeBetweenness(entities, relations) : null),
    [entities, relations, tools.sizeBy],
  );

  // `legendTypeCounts`, NOT `entityTypeCounts`: the latter drops a blank type, which is right for
  // the Browse chip row and wrong here. The map draws an untyped entity under "unknown" in a real
  // colour, so a legend built on entityTypeCounts left a colour nothing named and nothing could
  // filter — breaking GD-A1's own promise.
  const typeDomain = useMemo(() => legendTypeCounts(entities), [entities]);
  const relationTypeDomain = useMemo(() => relationTypeCounts(relations), [relations]);
  const maxObservations = useMemo(
    () => entities.reduce((m, e) => Math.max(m, e.observationCount), 0),
    [entities],
  );
  // Which legend value an entity falls under, for the active colour encoding.
  const groupKey = useMemo(() => {
    if (tools.colorBy === "type") return null;
    return tools.colorBy === "community" ? communities : base.component;
  }, [tools.colorBy, communities, base.component]);

  // The legend's rows. For types this is the WHOLE graph's types, so the legend cannot empty
  // itself when a type is picked. For the group encodings it is every group present.
  const legendDomain = useMemo<LegendEntry[]>(() => {
    if (tools.colorBy === "type") return typeDomain;
    if (!groupKey) return [];
    const counts = new Map<string, number>();
    for (const e of entities) {
      const id = groupKey.get(e.name);
      if (id === undefined) continue;
      const k = String(id);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [tools.colorBy, typeDomain, groupKey, entities]);

  // What the legend counts: how many of each value are actually on screen right now.
  const renderedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of built.nodes) {
      const key = groupKey ? String(groupKey.get(n.data.id) ?? "") : n.data.type;
      if (key === "") continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [built, groupKey]);

  // Shared with the stylesheet through colorIndexFor, so the legend and the graph cannot
  // disagree about a colour.
  const colorFor = (value: string) => {
    const types = palette?.types ?? PALETTE_FALLBACK;
    return types[colorIndexFor(tools.colorBy, value, colorDomain, types.length)];
  };

  // The strongest entities by the active metric, over the WHOLE graph — so a row can name an
  // entity the cap or a filter left undrawn. That is labelled rather than hidden (D-6).
  const insightRows = useMemo<InsightRow[]>(() => {
    const drawn = new Set(built.nodes.map((n) => n.data.id));
    const valueOf = (e: SummaryEntity): number => {
      switch (tools.sizeBy) {
        case "degree":
          return e.relationCount;
        case "pagerank":
          return base.pagerank.get(e.name) ?? 0;
        case "betweenness":
          return betweenness?.get(e.name) ?? 0;
        default:
          return e.observationCount;
      }
    };
    // Counts read as integers; the normalised metrics are proportions and read as percentages.
    const proportion = tools.sizeBy === "pagerank" || tools.sizeBy === "betweenness";
    return [...entities]
      .map((e) => ({ e, v: valueOf(e) }))
      .sort((a, b) => b.v - a.v || a.e.name.localeCompare(b.e.name))
      .slice(0, 5)
      .map(({ e, v }) => ({
        name: e.name,
        value: proportion ? `${Math.round(v * 100)}%` : String(v),
        onMap: drawn.has(e.name),
      }));
  }, [entities, built, tools.sizeBy, base.pagerank, betweenness]);

  function clearPath() {
    setPathFrom(null);
    setPath(null);
  }

  // "Dirty" spans three owners: the tools (this hook's state, in the panel), the query and the
  // entity-type filter (the panel's, and the latter is SHARED with the Entities tab), and path mode
  // (this view's). Only this component sees all three, which is why the reset is composed here
  // rather than in the panel or in the tools panel.
  const dirty =
    !isDefaultTools(tools) || typeFilter !== null || filter.value !== "" || pathMode;

  function resetEverything() {
    // Path mode first and locally: leaving it clears its own endpoints through the effect that
    // watches `pathMode`, so there is no second place that has to remember to.
    setPathMode(false);
    onResetFilters();
  }

  // Endpoint picking. Never routed through the panel's select() — see the path state above.
  onNodeTap.current = (id: string) => {
    if (!pathMode) {
      select.current(id);
      return;
    }
    const instance = cy.current;
    if (!instance) return;
    // A completed trace means the next tap starts a new one, rather than silently doing nothing.
    if (pathFrom === null || path !== null) {
      setPathFrom(id);
      setPath(null);
      return;
    }
    setPath(findPath(instance, pathFrom, id));
  };

  onBackgroundTap.current = () => {
    if (pathMode) clearPath();
    else select.current(null);
  };

  useEffect(() => {
    const container = box.current;
    if (!container || entities.length === 0) return;

    const { nodes, edges } = built;
    const p = readPalette(container);
    // Also to state, for the legend, and to a ref, for the stylesheet effect. Neither is a
    // dependency of this effect, so this cannot loop.
    paletteRef.current = p;
    setPalette(p);

    const instance = cytoscape({
      container,
      elements: [...nodes, ...edges],
      minZoom: 0.15,
      maxZoom: 6,
      // The stylesheet is built by graph-stylesheet.ts, and it is built HERE with the member's
      // CURRENT encodings rather than with defaults. Constructing with a default and letting the
      // stylesheet effect replace it would flash the wrong picture on every rebuild for anyone
      // who is not on the default encoding.
      style: buildStylesheet({
        palette: p,
        sizeBy: tools.sizeBy,
        colorBy: tools.colorBy,
        colorDomain,
      }),
      layout: {
        name: "cose",
        animate: false,
        // The elements carry deterministic seed positions, so cose must RELAX from them
        // rather than throw them away. This is what makes leaving the tab and coming back
        // show the same picture instead of a reshuffled one.
        randomize: false,
        // Both scale together: repulsion alone pushes nodes apart while the edges pull
        // them back, so the graph fights itself and the result barely changes.
        nodeRepulsion: () => 9000 * spread,
        idealEdgeLength: () => 110 * spread,
        nodeOverlap: 12 * spread,
      },
    });

    instance.on("tap", "node", (e) => onNodeTap.current(e.target.id() as string));
    instance.on("tap", (e) => {
      if (e.target === instance) onBackgroundTap.current();
    });

    // Hover. `renderedPosition()` is a library call that already accounts for pan and zoom —
    // this is deliberately NOT the hand-rolled viewBox arithmetic the map's first version died
    // of. The only maths left is keeping the card on the stage, and that is a pure function.
    instance.on("mouseover", "node", (e) => {
      const n = e.target;
      setHover({
        node: {
          name: n.id() as string,
          type: n.data("type"),
          observations: n.data("observations") ?? 0,
          relations: n.data("relations") ?? 0,
        },
        ...clampToStage(n.renderedPosition(), HOVER_CARD, {
          w: container.clientWidth,
          h: container.clientHeight,
        }),
      });
    });
    // Cleared on all four, not just mouseout: panning or zooming moves the node out from under
    // a card that would otherwise sit there pointing at nothing.
    instance.on("mouseout", "node", () => setHover(null));
    instance.on("pan zoom tapstart", () => setHover(null));

    cy.current = instance;
    return () => {
      instance.destroy();
      cy.current = null;
    };
    // `colorDomain` is derived from `entities`, which `built` already depends on, so it cannot
    // change without `built` changing. Listed for honesty rather than for effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, spread, colorDomain]);

  // Metrics go into node DATA, not into the elements the layout was computed from. A data write
  // does not move anything, and the stylesheet's size and colour functions re-evaluate off it —
  // which is what lets an encoding change be free of a relayout (GD-B5).
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    instance.batch(() => {
      instance.nodes().forEach((n) => {
        const id = n.id() as string;
        n.data("pagerank", base.pagerank.get(id) ?? 0);
        n.data("component", base.component.get(id) ?? 0);
        // Only when computed. Writing 0 for an uncomputed metric would be indistinguishable
        // from a genuine 0, and the stylesheet already treats absent as the floor.
        if (communities) n.data("community", communities.get(id) ?? 0);
        if (betweenness) n.data("betweenness", betweenness.get(id) ?? 0);
      });
    });
  }, [built, base, communities, betweenness]);

  // An encoding change is a STYLESHEET SWAP. `instance.style()` neither re-runs the layout nor
  // clears element classes, so the selection's fading survives it.
  useEffect(() => {
    const instance = cy.current;
    const p = paletteRef.current;
    if (!instance || !p) return;
    instance.style(
      buildStylesheet({
        palette: p,
        sizeBy: tools.sizeBy,
        colorBy: tools.colorBy,
        colorDomain,
      }),
    );
  }, [built, tools.sizeBy, tools.colorBy, colorDomain]);

  // Highlighting is applied as CLASSES, never by rebuilding: a rebuild re-runs the layout, so
  // clicking a node would rearrange the picture around it.
  //
  // THIS IS THE ONLY OWNER OF `faded` (NFR-4b). Selection and path both want to fade the
  // complement of their own highlight, so as two effects whichever ran last would win and they
  // would clobber each other — a path blinking out when a selection re-applies, and the reverse.
  //
  // `built` is in the deps even though nothing here reads it. A rebuild replaces the instance
  // with a fresh one carrying NO classes, while `selected` has not changed — so without it an
  // active selection silently lost its fading on every filter change, and the member was left
  // looking at a graph that had quietly stopped answering.
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    applyHighlight(instance, {
      selected,
      hopRadius: tools.hopRadius,
      path,
      pathMode,
      pathFrom,
    });
  }, [built, selected, tools.hopRadius, path, pathMode, pathFrom]);

  // Leaving path mode drops the trace, so re-entering never starts half-way through somebody
  // else's question.
  useEffect(() => {
    if (!pathMode) {
      setPathFrom(null);
      setPath(null);
    }
  }, [pathMode]);

  // Esc leaves path mode. Not bound when the mode is off, so it cannot swallow an Escape the
  // rest of the app wanted — and fullscreen has its own Escape handling, which this must not
  // pre-empt, hence the fullscreen check.
  useEffect(() => {
    if (!pathMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setPathMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pathMode]);

  // The tools panel follows the stage it sits on: shut in the ~280px column, open in fullscreen.
  // Driven by `expanded` rather than set once, so leaving fullscreen puts the column back the
  // way the member expects to find it.
  useEffect(() => setToolsOpen(expanded), [expanded]);

  // Esc and the browser's own control leave fullscreen without going through our button, so
  // the flag follows the document rather than the click.
  useEffect(() => {
    const sync = () => setExpanded(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Cytoscape does not observe its container, so a size change needs telling. Deferred a
  // frame: on entering fullscreen the new size is not laid out yet when the event fires, and
  // fitting against the old one leaves the graph off-view.
  //
  // `toolsOpen` belongs here too, now that the tools are a SIDEBAR rather than an overlay: opening
  // them takes real width from the stage. An overlay changed nothing about the container, so this
  // effect did not need to know; a sidebar does, and without it the graph stays laid out for the
  // old width and sits clipped or off-centre.
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const id = requestAnimationFrame(() => {
      instance.resize();
      instance.fit(undefined, 40);
    });
    return () => cancelAnimationFrame(id);
  }, [expanded, toolsOpen]);

  // The detail pane is inside the graph column, so opening it changes the stage's HEIGHT and
  // Cytoscape has to be told — otherwise the canvas keeps the old dimensions and the graph draws
  // clipped.
  //
  // `resize()` WITHOUT `fit()`, unlike above. Re-framing the graph at the exact moment the member
  // selected an entity would move every node away from the one they just clicked — which is the
  // complaint this whole rearrangement exists to fix. The canvas is corrected; the viewport is left
  // where they put it.
  const hasDetail = Boolean(detail);
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const id = requestAnimationFrame(() => instance.resize());
    return () => cancelAnimationFrame(id);
  }, [hasDetail]);

  async function toggleFullscreen() {
    const el = shell.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      // Refused (no gesture, or unsupported): the pane simply stays as it is.
    }
  }

  // An empty graph and a filter that hid everything are different facts about the
  // workspace, and the fix for each is different — so they stay two states, sharing
  // only their presentation.
  //
  // Only the EMPTY-GRAPH case returns early. A filter that hid everything must keep the tools
  // panel on screen: it is the only thing that can undo the filter, and returning a bare empty
  // state here stranded the member with no control to reach — the same dead end the legend's
  // stable domain exists to avoid.
  if (built.nodes.length === 0 && entities.length === 0) {
    return <PanelEmpty icon={Share2} title={copy.empty.title} body={copy.empty.body} />;
  }
  const filteredToNothing = built.nodes.length === 0;

  const controls = (
    <div className="absolute bottom-2 right-2 flex gap-1">
      {[
        {
          key: "expand",
          label: expanded ? "⤡" : "⤢",
          title: expanded ? copy.collapseMap : copy.expandMap,
          disabled: false,
          onClick: toggleFullscreen,
        },
        {
          key: "fit",
          label: "⤾",
          title: copy.fitMap,
          disabled: false,
          onClick: () => cy.current?.fit(undefined, 40),
        },
      ].map((b) => (
        <button
          key={b.key}
          type="button"
          title={b.title}
          aria-label={b.title}
          disabled={b.disabled}
          onClick={b.onClick}
          className="flex size-7 items-center justify-center rounded-md border border-brand/30 bg-surface/90 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          {b.label}
        </button>
      ))}
    </div>
  );

  // The spread group is separate from the icon row because it needs a readout, and a
  // number wedged between two 28px icon buttons reads as an icon rather than a value.
  const spreadControl = (
    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md border border-brand/30 bg-surface/90 px-1">
      <button
        type="button"
        title={copy.spreadIn}
        aria-label={copy.spreadIn}
        disabled={spread <= MIN_SPREAD}
        onClick={() => setSpread((v) => Math.max(MIN_SPREAD, +(v / 1.4).toFixed(2)))}
        className="flex size-6 items-center justify-center text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
      >
        −
      </button>
      <span
        className="min-w-[3.2rem] text-center font-mono text-[10px] text-fg-muted"
        title={spreadLabel}
      >
        {spreadLabel}
      </span>
      <button
        type="button"
        title={copy.spreadOut}
        aria-label={copy.spreadOut}
        disabled={spread >= MAX_SPREAD}
        onClick={() => setSpread((v) => Math.min(MAX_SPREAD, +(v * 1.4).toFixed(2)))}
        className="flex size-6 items-center justify-center text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
      >
        +
      </button>
    </div>
  );

  const stage = (
    <>
      {filteredToNothing ? (
        // The wording has to name the filter that actually matched nothing. The names-only
        // hint sent members hunting for a typo when they had searched observation text.
        <PanelEmpty
          icon={Search}
          title={matchNames ? copy.mapNoMatchContents : copy.mapNoMatch}
          body={matchNames ? copy.mapNoMatchContentsHint : copy.mapNoMatchHint}
        />
      ) : (
        <div ref={box} className="h-full w-full" />
      )}
      {hover && (
        <HoverCard node={hover.node} left={hover.left} top={hover.top} copy={copy} />
      )}
      {!toolsOpen && <MapToolsButton onOpen={() => setToolsOpen(true)} copy={copy} />}
      {/* Pan, zoom and spread act on a graph that is not there when a filter hid everything,
          so they go with it. The tools sidebar deliberately does not. */}
      {!filteredToNothing && spreadControl}
      {!filteredToNothing && controls}
    </>
  );

  const toolsSidebar = (
    <MapTools
      onClose={() => setToolsOpen(false)}
      openGroups={openGroups}
      onToggleGroup={toggleGroup}
      tools={tools}
      set={setTool}
      relationTypeDomain={relationTypeDomain}
      maxObservations={maxObservations}
      legendDomain={legendDomain}
      renderedCounts={renderedCounts}
      typeFilter={typeFilter}
      onTypeFilter={onTypeFilter}
      colorFor={colorFor}
      insightRows={insightRows}
      isolatedCount={base.isolated.length}
      // Routes to the panel's select(), which already handles a name outside the current
      // list — it falls back to open_nodes. That is what makes an off-map row clickable.
      onSelectEntity={(name) => select.current(name)}
      pathMode={pathMode}
      onPathModeChange={setPathMode}
      pathFrom={pathFrom}
      pathResult={path}
      onPathClear={clearPath}
      dirty={dirty}
      onReset={resetEverything}
      copy={copy}
    />
  );

  return (
    // `bg-bg` matters in fullscreen: the fullscreen element is composited against black by
    // default, and the graph's own background is transparent.
    //
    // A COLUMN, not a bare relative box. The filter bar is a flow child above the stage, and the
    // stage takes the rest — which is what puts the filter INSIDE the fullscreen element. It used
    // to be rendered by the panel, outside this shell, so expanding the map made the member's own
    // search box and its scope switch disappear.
    //
    // The 320px floor is on the STAGE, not on this shell. On the shell it would include the filter
    // bar's ~60px, so moving the bar inside would have quietly cost the graph that much height.
    // An explicit min-height also overrides flex's `min-height: auto`, which is what `min-h-0`
    // would otherwise be needed for.
    <div ref={shell} className="flex h-full flex-col bg-bg">
      <MapFilterBar filter={filter} tools={tools} set={setTool} copy={copy} />
      {/* Horizontal: the graph column, then the tools sidebar. This row's height is the whole map
          area, so the sidebar's height no longer depends on whether the detail pane is open. */}
      <div className="flex min-h-0 flex-1">
        {/* The graph column. The detail pane is a child HERE rather than a sibling of the whole
            map, which is what keeps it inside the graph's area instead of running underneath the
            tools strip — and what stops it resizing them. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-[240px] flex-1">
            {stage}
            {built.truncated > 0 && (
              // Never silent: a capped picture that looks complete is worse than one that says
              // what it left out. Top-LEFT, because the tools own the right side.
              <p className="absolute left-2 top-2 max-w-[45%] rounded-md border border-brand/30 bg-surface/90 px-2 py-1 text-[10px] text-fg-muted">
                {copy.mapTruncated.replace("{count}", String(built.truncated))}
              </p>
            )}
          </div>
          {detail}
        </div>
        {toolsOpen && (
          // `w-60 max-w-[60%]`: a fixed sidebar would leave nothing of the graph in the ~280px
          // sidebar column, so it yields there rather than squeezing the thing it describes.
          <aside className="w-60 max-w-[60%] shrink-0 overflow-hidden border-l border-brand/30 bg-surface">
            {toolsSidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
