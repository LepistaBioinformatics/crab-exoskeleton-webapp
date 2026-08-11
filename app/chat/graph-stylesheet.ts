import type cytoscape from "cytoscape";
import { typeColorIndex } from "./graph-elements";
import type { ColorEncoding, SizeMetric } from "./use-map-tools";

// The map's visual encodings, as a Cytoscape stylesheet.
//
// Lifted out of memory-graph-view.tsx so that switching an encoding is a STYLESHEET SWAP rather
// than a rebuild. That distinction is the feature's central constraint: rebuilding re-runs the
// layout, so changing "colour by" would rearrange the entire picture under the member's cursor.
// Metrics live in node data, the stylesheet reads them, and `instance.style(...)` re-applies
// without touching positions or element classes.

/** The floor diameter — the size of an entity with nothing to show for itself. */
const SIZE_MIN = 14;
/** Multiplier for count-based metrics, preserved from the map's original observation sizing. */
const COUNT_SCALE = 4;
/** Ceiling on counts, so one heavily-observed entity cannot swamp the view. */
const COUNT_CAP = 100;
/** Span for the normalised (0..1) metrics, chosen so a top entity lands near a capped count. */
const NORMALISED_SPAN = 40;

export interface Palette {
  types: string[];
  fg: string;
  muted: string;
  bg: string;
  edge: string;
}

/** What the stylesheet reads off a node. Metrics are optional: they arrive after the build. */
export interface NodeMetricData {
  observations: number;
  relations: number;
  pagerank?: number;
  betweenness?: number;
}

/**
 * Node diameter for the active size metric.
 *
 * Width tracks the SQUARE ROOT of the value throughout, so AREA is proportional to the value.
 * That was the reasoning behind the original observation sizing and it has to hold for the new
 * metrics too, or two encodings would exaggerate the same difference by different amounts.
 *
 * A metric that has not arrived yet reads as zero rather than as NaN. Betweenness is only
 * computed when it is selected, and the metrics effect runs after the graph is built — so the
 * stylesheet WILL be asked to size a node with no value, and a NaN width makes Cytoscape drop
 * the node without saying anything.
 */
export function nodeDiameter(sizeBy: SizeMetric, d: NodeMetricData): number {
  switch (sizeBy) {
    case "degree":
      return SIZE_MIN + Math.sqrt(Math.min(d.relations ?? 0, COUNT_CAP)) * COUNT_SCALE;
    case "pagerank":
      return SIZE_MIN + Math.sqrt(d.pagerank ?? 0) * NORMALISED_SPAN;
    case "betweenness":
      return SIZE_MIN + Math.sqrt(d.betweenness ?? 0) * NORMALISED_SPAN;
    case "observations":
    default:
      return SIZE_MIN + Math.sqrt(Math.min(d.observations ?? 0, COUNT_CAP)) * COUNT_SCALE;
  }
}

/**
 * Which palette slot a value gets under the active colour encoding.
 *
 * **Shared with the legend on purpose.** The legend and the graph must agree on every colour, and
 * the only way to guarantee that is for both to call this. Two implementations that looked
 * equivalent would eventually diverge, and the symptom would be a legend that quietly lies.
 *
 * For `type` the domain is the whole graph's types, alphabetically — NOT the rendered ones, which
 * shrink under a filter and would recolour every node when the member narrows.
 *
 * For `community` and `component` the value is a numeric id, mapped straight onto the palette.
 * An absent or unparseable id falls back to the first colour rather than to `palette[NaN]`.
 */
export function colorIndexFor(
  colorBy: ColorEncoding,
  value: string,
  colorDomain: string[],
  paletteSize: number,
): number {
  if (colorBy === "type") return typeColorIndex(colorDomain, value, paletteSize);
  const id = Number(value);
  if (!Number.isFinite(id) || value === "") return 0;
  return Math.abs(Math.trunc(id)) % paletteSize;
}

/** Which node-data key the active colour encoding reads. */
function colorKey(colorBy: ColorEncoding): string {
  return colorBy === "type" ? "type" : colorBy;
}

export function buildStylesheet({
  palette: p,
  sizeBy,
  colorBy,
  colorDomain,
}: {
  palette: Palette;
  sizeBy: SizeMetric;
  colorBy: ColorEncoding;
  colorDomain: string[];
}): cytoscape.StylesheetJson {
  const diameter = (n: cytoscape.NodeSingular) =>
    nodeDiameter(sizeBy, {
      observations: n.data("observations") ?? 0,
      relations: n.data("relations") ?? 0,
      pagerank: n.data("pagerank"),
      betweenness: n.data("betweenness"),
    });

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "background-color": (n: cytoscape.NodeSingular) =>
          p.types[
            colorIndexFor(colorBy, String(n.data(colorKey(colorBy)) ?? ""), colorDomain, p.types.length)
          ],
        width: diameter,
        height: diameter,
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
        // Relations are directional and the arrowheads say so, even though the path search and
        // the metrics both read the graph undirected. Showing the direction is not the same as
        // treating it as a constraint.
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
    // A node kept only because it neighbours a match is CONTEXT, not an answer. Drawn hollow and
    // quiet so the eye lands on what was actually asked for, while the connection it provides is
    // still visible.
    {
      selector: "node[!match]",
      style: {
        "background-opacity": 0.15,
        "border-color": p.muted,
        "border-width": 1.5,
        "text-opacity": 0.45,
      },
    },
    { selector: ".faded", style: { opacity: 0.1, "text-opacity": 0 } },
    { selector: "node.picked", style: { "border-color": p.types[0], "border-width": 4 } },
    { selector: "edge.near", style: { opacity: 0.9, "text-opacity": 1, width: 2 } },
    // The traced route. Heavier than `.near` because it is an answer to a specific question
    // rather than ambient context, and its relation names are always shown — reading the chain
    // edge by edge on the graph is the point.
    {
      selector: "node.path",
      style: { "border-color": p.fg, "border-width": 3, "text-opacity": 1 },
    },
    {
      selector: "edge.path",
      style: { "line-color": p.fg, "target-arrow-color": p.fg, opacity: 1, width: 3, "text-opacity": 1 },
    },
  ];
}
