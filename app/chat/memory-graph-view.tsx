"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cva } from "class-variance-authority";
import { layoutGraph, neighbourhood, radiusFor, type GraphNode } from "./graph-layout";
import type { Relation, SummaryEntity } from "@/lib/memoryGraph";

// The knowledge graph as a node-link diagram.
//
// Hand-rolled SVG over a d3-force layout, rather than a rendering library. The layout is
// the hard part and d3-force does it; the drawing is what has to match this app, and only
// SVG inherits the theme — the CSS vars flip with the OS scheme, the brand colours are the
// same ones the rest of the chrome uses, and the global reduced-motion guard applies. A
// canvas or WebGL renderer would need its own palette and its own theme switch.
//
// Selection dims everything more than one hop away. On a graph of any size the transitive
// closure is "most of it", which dims nothing and answers nothing.

const VIEW_W = 1200;
const VIEW_H = 800;

const nodeCircle = cva("cursor-pointer transition-opacity", {
  variants: {
    faded: { true: "opacity-15", false: "opacity-100" },
  },
  defaultVariants: { faded: false },
});

const edgeLine = cva("transition-opacity", {
  variants: {
    faded: { true: "opacity-5", false: "opacity-40" },
  },
  defaultVariants: { faded: false },
});

// Labels are drawn only when they can be READ. Below the zoom threshold every label
// overlaps its neighbours into noise, so they are hidden and the shape is what you see;
// a selection always keeps its own neighbourhood labelled regardless of zoom.
const nodeLabel = cva("pointer-events-none select-none transition-opacity", {
  variants: {
    shown: { true: "opacity-90", false: "opacity-0" },
  },
  defaultVariants: { shown: true },
});

/** Below this the labels are noise rather than information. */
const LABEL_ZOOM = 1.1;

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
  /** The entity whose neighbourhood is highlighted, or null for the whole graph. */
  selected: string | null;
  onSelect: (name: string | null) => void;
  emptyLabel: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  // The panel is a ~280px column by default, and the layout spans far more than that, so
  // the fit alone reduced everything to a quarter scale — labels landed at about 3px and
  // no zoom ceiling could recover it. This lets the map take the viewport, which is the
  // only real fix; the zoom range and the label threshold help once it has room.
  const [expanded, setExpanded] = useState(false);
  // Recomputed only when the graph itself changes. The simulation runs to completion, so
  // this is one synchronous cost per load rather than an animation loop — a settling graph
  // moves labels while you read them and makes clicking a node a chase.
  const layout = useMemo(
    () => layoutGraph(entities, relations, { width: VIEW_W, height: VIEW_H }),
    [entities, relations],
  );

  const near = useMemo(
    () => (selected ? neighbourhood(layout, selected) : null),
    [layout, selected],
  );

  // Pan and zoom, hand-rolled on the viewBox for the same reason the timeline's drag is:
  // it is a few lines and it keeps the rendering entirely ours.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x) / zoom, y: d.py + (e.clientY - d.y) / zoom });
  }
  function onPointerUp() {
    drag.current = null;
  }

  if (entities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-fg-muted">{emptyLabel}</p>
      </div>
    );
  }

  const { minX, minY, maxX, maxY } = layout.bounds;
  const pad = 60;
  const w = Math.max(maxX - minX + pad * 2, 200);
  const h = Math.max(maxY - minY + pad * 2, 200);
  const viewBox = [
    minX - pad - pan.x + (w - w / zoom) / 2,
    minY - pad - pan.y + (h - h / zoom) / 2,
    w / zoom,
    h / zoom,
  ].join(" ");

  const isFaded = (id: string) => Boolean(near) && !near!.nodes.has(id);

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 bg-bg"
          : "relative h-full"
      }
    >
      <svg
        viewBox={viewBox}
        className="h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Clicking the background clears the selection, which is the only way back to
        // seeing the whole graph without hunting for a control.
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {layout.edges.map((edge, i) => (
          <line
            key={`${edge.source.id}->${edge.target.id}-${i}`}
            x1={edge.source.x}
            y1={edge.source.y}
            x2={edge.target.x}
            y2={edge.target.y}
            stroke="var(--color-brand)"
            strokeWidth={1.5}
            className={edgeLine({ faded: Boolean(near) && !near!.edges.has(edge) })}
          >
            <title>{`${edge.source.id} → ${edge.label} → ${edge.target.id}`}</title>
          </line>
        ))}

        {layout.nodes.map((node) => (
          <GraphNodeMark
            key={node.id}
            node={node}
            faded={isFaded(node.id)}
            selected={node.id === selected}
            // Readable when zoomed in, or when this node is in the selected
            // neighbourhood — a selection is a question about specific names.
            labelled={zoom >= LABEL_ZOOM || Boolean(near?.nodes.has(node.id))}
            onSelect={onSelect}
          />
        ))}
      </svg>

      <div className="absolute bottom-2 right-2 flex gap-1">
        {[
          {
            label: expanded ? "⤡" : "⤢",
            title: expanded ? collapseLabel : expandLabel,
            to: () => setExpanded((v) => !v),
          },
          { label: "−", title: undefined, to: () => setZoom((z) => Math.max(0.3, z / 1.4)) },
          { label: "+", title: undefined, to: () => setZoom((z) => Math.min(12, z * 1.4)) },
          {
            label: "⤾",
            title: undefined,
            to: () => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            },
          },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onClick={b.to}
            className="flex size-7 items-center justify-center rounded-md border border-brand/30 bg-surface/90 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphNodeMark({
  node,
  faded,
  selected,
  labelled,
  onSelect,
}: {
  node: GraphNode;
  faded: boolean;
  selected: boolean;
  labelled: boolean;
  onSelect: (name: string) => void;
}) {
  const r = radiusFor(node.observations);
  return (
    <g
      className={nodeCircle({ faded })}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={selected ? "var(--color-accent)" : "var(--color-accent-soft)"}
        stroke="var(--color-bg)"
        strokeWidth={2}
      />
      <text
        x={node.x}
        y={node.y + r + 12}
        textAnchor="middle"
        fontSize={11}
        fill="var(--color-fg)"
        className={nodeLabel({ shown: labelled && !faded })}
      >
        {node.id}
      </text>
      <title>{`${node.id} · ${node.type} · ${node.observations} obs · ${node.relations} rel`}</title>
    </g>
  );
}
