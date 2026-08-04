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
  selected,
  onSelect,
  emptyLabel,
  expandLabel,
  collapseLabel,
}: {
  entities: SummaryEntity[];
  relations: Relation[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  emptyLabel: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  // A graph in a ~280px column is cramped by construction, and that — not the zoom range —
  // is what made the previous version unreadable. Full screen is the state this view is
  // usable in.
  const [expanded, setExpanded] = useState(false);
  // Kept in a ref so the tap handler never goes stale without rebuilding the graph, which
  // would re-run the layout and move every node.
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const container = box.current;
    if (!container || entities.length === 0) return;

    const { nodes, edges, types } = buildElements(entities, relations);
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
        // One hop from the selection stays lit; the rest recedes. Not the transitive
        // closure — on any real graph that is "most of it", which dims nothing.
        { selector: ".faded", style: { opacity: 0.1, "text-opacity": 0 } },
        { selector: "node.picked", style: { "border-color": p.types[0], "border-width": 4 } },
        { selector: "edge.near", style: { opacity: 0.9, "text-opacity": 1, width: 2 } },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 110,
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
  }, [entities, relations]);

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

  // Cytoscape does not observe its container, so going full screen needs telling.
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    instance.resize();
    instance.fit(undefined, 40);
  }, [expanded]);

  if (entities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-fg-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={expanded ? "fixed inset-0 z-50 bg-bg" : "relative h-full min-h-[320px]"}>
      <div ref={box} className="h-full w-full" />
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button
          type="button"
          title={expanded ? collapseLabel : expandLabel}
          aria-label={expanded ? collapseLabel : expandLabel}
          onClick={() => setExpanded((v) => !v)}
          className="flex size-7 items-center justify-center rounded-md border border-brand/30 bg-surface/90 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          {expanded ? "⤡" : "⤢"}
        </button>
        <button
          type="button"
          onClick={() => cy.current?.fit(undefined, 40)}
          className="flex size-7 items-center justify-center rounded-md border border-brand/30 bg-surface/90 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          ⤾
        </button>
      </div>
    </div>
  );
}
