"use client";

import { useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { buildElements, typeColorIndex } from "./graph-elements";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

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

interface Palette {
  types: string[];
  fg: string;
  muted: string;
  bg: string;
  edge: string;
}

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
  selected,
  onSelect,
  emptyLabel,
  expandLabel,
  collapseLabel,
  spreadOutLabel,
  spreadInLabel,
  fitLabel,
  spreadReadout,
  noMatchLabel,
  truncatedLabel,
}: {
  entities: SummaryEntity[];
  relations: Relation[];
  /** The panel's type filter, honoured here too so the narrowing survives a tab switch. */
  typeFilter: string | null;
  /** Substring over entity names — see GraphFilter for why this is not the Search tab. */
  query: string;
  selected: string | null;
  onSelect: (name: string | null) => void;
  emptyLabel: string;
  expandLabel: string;
  collapseLabel: string;
  spreadOutLabel: string;
  spreadInLabel: string;
  fitLabel: string;
  /** "spread {value}x" — the readout, so the control is not two unlabelled arrows. */
  spreadReadout: string;
  /** Shown when a filter hid everything — distinct from an empty graph. */
  noMatchLabel: string;
  /** "{count} more not shown" — the cap is reported, never silent. */
  truncatedLabel: string;
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
  const spreadLabel = spreadReadout.replace("{value}", String(spread));

  useEffect(() => {
    const container = box.current;
    if (!container || entities.length === 0) return;

    const { nodes, edges, types } = buildElements(entities, relations, { type: typeFilter, query });
    const p = readPalette(container);

    const instance = cytoscape({
      container,
      elements: [...nodes, ...edges],
      minZoom: 0.15,
      maxZoom: 6,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": (n: cytoscape.NodeSingular) =>
              p.types[typeColorIndex(types, n.data("type"), p.types.length)],
            // Area tracks observation count on a square root, so one heavily-observed
            // entity cannot swamp the view.
            width: (n: cytoscape.NodeSingular) =>
              14 + Math.sqrt(Math.min(n.data("observations") ?? 0, 100)) * 4,
            height: (n: cytoscape.NodeSingular) =>
              14 + Math.sqrt(Math.min(n.data("observations") ?? 0, 100)) * 4,
            "border-width": 2,
            "border-color": p.bg,
            color: p.fg,
            "font-size": 11,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "120px",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": p.edge,
            "target-arrow-color": p.edge,
            // Relations are directional; the previous version drew plain lines and lost
            // half the information.
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.8,
            opacity: 0.5,
            label: "data(label)",
            "font-size": 9,
            color: p.muted,
            "text-rotation": "autorotate",
            // Relation names appear only for the selection, otherwise they are noise.
            "text-opacity": 0,
          },
        },
        // A node kept only because it neighbours a match is CONTEXT, not an answer. Drawn
        // hollow and unlabelled so the eye lands on what was actually asked for, while the
        // connection it provides is still visible.
        {
          selector: "node[!match]",
          style: {
            "background-opacity": 0.15,
            "border-color": p.muted,
            "border-width": 1.5,
            "text-opacity": 0.45,
          },
        },
        // One hop from the selection stays lit; the rest recedes. Not the transitive
        // closure — on any real graph that is "most of it", which dims nothing.
        { selector: ".faded", style: { opacity: 0.1, "text-opacity": 0 } },
        { selector: "node.picked", style: { "border-color": p.types[0], "border-width": 4 } },
        { selector: "edge.near", style: { opacity: 0.9, "text-opacity": 1, width: 2 } },
      ],
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

    instance.on("tap", "node", (e) => select.current(e.target.id() as string));
    instance.on("tap", (e) => {
      if (e.target === instance) select.current(null);
    });

    cy.current = instance;
    return () => {
      instance.destroy();
      cy.current = null;
    };
  }, [entities, relations, typeFilter, query, spread]);

  // Selection is applied as CLASSES, never by rebuilding: a rebuild re-runs the layout, so
  // clicking a node would rearrange the picture around it.
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    instance.elements().removeClass("faded near picked");
    if (!selected) return;
    const node = instance.getElementById(selected);
    if (node.empty()) return;
    const near = node.closedNeighborhood();
    instance.elements().difference(near).addClass("faded");
    near.edges().addClass("near");
    node.addClass("picked");
  }, [selected]);

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
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const id = requestAnimationFrame(() => {
      instance.resize();
      instance.fit(undefined, 40);
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

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

  const built = buildElements(entities, relations, { type: typeFilter, query });
  if (built.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-fg-muted">
          {entities.length === 0 ? emptyLabel : noMatchLabel}
        </p>
      </div>
    );
  }

  const controls = (
    <div className="absolute bottom-2 right-2 flex gap-1">
      {[
        {
          key: "expand",
          label: expanded ? "⤡" : "⤢",
          title: expanded ? collapseLabel : expandLabel,
          disabled: false,
          onClick: toggleFullscreen,
        },
        {
          key: "fit",
          label: "⤾",
          title: fitLabel,
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
        title={spreadInLabel}
        aria-label={spreadInLabel}
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
        title={spreadOutLabel}
        aria-label={spreadOutLabel}
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
      <div ref={box} className="h-full w-full" />
      {spreadControl}
      {controls}
    </>
  );

  return (
    // `bg-bg` matters in fullscreen: the fullscreen element is composited against black by
    // default, and the graph's own background is transparent.
    <div
      ref={shell}
      className="relative h-full min-h-[320px] bg-bg"
    >
      {stage}
      {built.truncated > 0 && (
        // Never silent: a capped picture that looks complete is worse than one that says
        // what it left out.
        <p className="absolute left-2 top-2 rounded-md border border-brand/30 bg-surface/90 px-2 py-1 text-[10px] text-fg-muted">
          {truncatedLabel.replace("{count}", String(built.truncated))}
        </p>
      )}
    </div>
  );
}
