"use client";

import { useCallback, useState } from "react";

// The map's discovery-tool state.
//
// It lives in a hook called by the PANEL, not by the view, for the same reason the type
// filter already does: `MemoryGraphView` unmounts when the member switches to another tab,
// and "a filter that reset itself each time would be useless on the graph it exists for".
//
// It is ONE object rather than sixteen more `useState` calls threaded down as sixteen more
// props. The view already took twenty label props before this feature; a second wave of
// individual props is how a component stops being readable.

/** What node SIZE encodes. `observations` is what the map has always drawn. */
export type SizeMetric = "observations" | "degree" | "pagerank" | "betweenness";

/** What node COLOUR encodes. One at a time — see context.md D-3. */
export type ColorEncoding = "type" | "community" | "component";

/**
 * Whether the map's filter input runs locally or asks the server.
 *
 * `names` is an instant case-insensitive substring match over what is already loaded.
 * `contents` spends a request on the server's BM25 ranking, which also reads observation
 * text — the only way to find an entity by something only its observations say.
 */
export type SearchScope = "names" | "contents";

export interface MapToolsState {
  /**
   * Which relation types to draw. `null` means ALL, and is not the same as `[]`, which
   * means none — both are reachable states and they mean opposite things.
   */
  relationTypes: string[] | null;
  /** Floor on an entity's observation count. Zero draws everything. */
  minObservations: number;
  sizeBy: SizeMetric;
  colorBy: ColorEncoding;
  /** How many hops from the selection stay lit. */
  hopRadius: 1 | 2 | 3;
  searchScope: SearchScope;
}

/**
 * Every default reproduces the map as it behaved before this feature.
 *
 * That is deliberate: a member who never opens the tools panel must see the same graph they
 * saw yesterday, so none of this can be a surprise on first paint.
 */
export const MAP_TOOLS_DEFAULTS: MapToolsState = {
  relationTypes: null,
  minObservations: 0,
  sizeBy: "observations",
  colorBy: "type",
  hopRadius: 1,
  searchScope: "names",
};

/**
 * Whether the tools are all still at their defaults.
 *
 * Drives whether the reset control is offered at all: a reset button that cannot change anything
 * is noise, and worse, it makes a member wonder what state they are in.
 *
 * Compared field by field rather than by identity — `useMapTools` replaces the object on every
 * change, so identity would report "dirty" forever after the first click, including after a reset.
 * `relationTypes` needs an element-wise compare for the same reason.
 */
export function isDefaultTools(tools: MapToolsState): boolean {
  const sameRelationTypes =
    tools.relationTypes === null ||
    // A list that happens to hold nothing is NOT the default: `[]` means "hide every relation",
    // which is a deliberate state a member can reach and would want to undo.
    false;
  return (
    sameRelationTypes &&
    tools.minObservations === MAP_TOOLS_DEFAULTS.minObservations &&
    tools.sizeBy === MAP_TOOLS_DEFAULTS.sizeBy &&
    tools.colorBy === MAP_TOOLS_DEFAULTS.colorBy &&
    tools.hopRadius === MAP_TOOLS_DEFAULTS.hopRadius &&
    tools.searchScope === MAP_TOOLS_DEFAULTS.searchScope
  );
}

export function useMapTools() {
  const [tools, setTools] = useState<MapToolsState>(MAP_TOOLS_DEFAULTS);

  // Stable, so the tools panel does not re-render on every panel render. Generic over the
  // key so a caller cannot pass a value of the wrong type for the field it names.
  const set = useCallback(
    <K extends keyof MapToolsState>(key: K, value: MapToolsState[K]) =>
      setTools((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const reset = useCallback(() => setTools(MAP_TOOLS_DEFAULTS), []);

  return { tools, set, reset };
}
