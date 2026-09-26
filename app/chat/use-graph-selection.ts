"use client";

import { useCallback, useState } from "react";

// The member's explicit multi-select over the knowledge graph's entity list.
//
// It lives BESIDE the panel's single `selected`, never instead of it. Those two answer
// different questions: `selected` is which entity the detail pane is showing — clicking a
// row still has to open it — and this set is what the member ticked in order to act on
// several entities at once. Collapsing them would mean either a row click quietly
// enlarging a selection, or opening one entity throwing the rest away.
//
// A name is the identity, because a name is what identifies an entity everywhere in this
// panel and in `lib/memoryGraph.ts`. It is also what makes the set survive the projection
// change between tabs: the browse list holds `SummaryEntity` and the search list holds
// `Entity`, and the only field the two agree on is `name`.

/**
 * A checked name is NOT dropped when a type filter, a search or a tab switch stops
 * showing it. The member chose it; a selection that silently shrank as they narrowed the
 * list would hand whatever acts on it fewer entities than the count they last read — and
 * it would do so invisibly, which is the failure mode worth avoiding. `countHiddenChecked`
 * is how the panel says the difference out loud instead.
 *
 * `toggle` and `clear` keep their identity across renders (functional setState, empty
 * deps). The panel folds `clear` into the `reset` callback that its workspace-switch
 * effect depends on, so a callback rebuilt per render would re-run that effect on every
 * render — which presents as the member's open tab snapping back to Entities, not as a
 * dependency bug.
 */
export interface GraphSelection {
  /** Read-only on the way out: the state object itself must never be mutated in place. */
  checked: ReadonlySet<string>;
  /**
   * The only way in or out of the set, on every surface.
   *
   * There used to be a `replace` beside it, for the map, where a plain click meant "these
   * instead". That click now means "open this entity" and does not touch the selection at
   * all — the map has a select mode instead — so the wholesale replacement went with it.
   */
  toggle: (name: string) => void;
  clear: () => void;
}

export function useGraphSelection(): GraphSelection {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      // `delete` reports whether it removed anything, so one lookup does both halves.
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }, []);

  // `prev` when already empty, not a fresh Set: this runs inside the panel's `reset`,
  // which fires on every workspace switch, and a new identity there is a re-render of the
  // whole list for nothing.
  const clear = useCallback(
    () => setChecked((prev) => (prev.size === 0 ? prev : new Set())),
    [],
  );

  return { checked, toggle, clear };
}

/**
 * How many checked names the view is not currently showing.
 *
 * Zero is the normal case. Anything else is the count the panel has to surface, because
 * the whole point of keeping a filtered-out name checked is undone if nothing on screen
 * says it is still there.
 */
export function countHiddenChecked(
  checked: ReadonlySet<string>,
  visible: readonly string[],
): number {
  const shown = new Set(visible);
  let hidden = 0;
  for (const name of checked) if (!shown.has(name)) hidden++;
  return hidden;
}
