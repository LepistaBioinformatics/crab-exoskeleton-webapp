import type { Relation } from "@/lib/memoryGraph";

// How far a shared graph fragment reaches out from the entities the member picked.
//
// Pure and on its own, deliberately. This is the only part of "share the map selection"
// that can be wrong without looking wrong: an off-by-one in the frontier, a relation
// followed in one direction only, or a cycle walked forever all produce a payload that
// renders perfectly and carries the wrong entities. The component around it cannot be
// asked to prove any of that.

/** The hop counts the share control offers. Zero is reachable in code, never in the UI. */
export type HopRadius = 1 | 2 | 3;

/**
 * The most names one share may carry.
 *
 * Three hops on a dense graph reaches most of it, and the member cannot see that coming
 * from a selection of four nodes. The panel shows the expanded count BEFORE the share and
 * refuses past this ceiling rather than quietly trimming the set: a truncated fragment is
 * a lie about which entities were shared, and the member has an obvious remedy — fewer
 * hops, or fewer entities.
 *
 * Its own number rather than `MAX_NODES`: that ceiling exists because the map's layout is
 * O(n^2) on the main thread, which has nothing to do with how large a post should be.
 */
export const MAX_SHARE_NAMES = 200;

/**
 * Every entity within `hops` relations of `seeds`, the seeds included.
 *
 * **Direction-agnostic.** A relation is stored in active voice (`from` → `to`) because the
 * agent writes it that way, but a neighbour is a neighbour whichever end you arrived from:
 * one hop out of X is everything X points at AND everything that points at X. Following
 * `from` → `to` only would silently drop half of every neighbourhood, and the result would
 * still look like a plausible fragment.
 *
 * Breadth-first by frontier, so a node reached at distance 1 is never expanded again at
 * distance 2. That is the cycle guard and the double-count guard in one: a graph with a
 * loop terminates, and `A relates to B` twice adds B once.
 *
 * A seed the relations never mention is kept — an isolated entity is still the member's
 * choice, and so is a name the current projection happens not to carry (the browse list is
 * capped and filtered, the selection is not).
 */
export function expandByHops(
  seeds: Iterable<string>,
  relations: readonly Relation[],
  hops: number,
): Set<string> {
  const reached = new Set(seeds);
  if (hops <= 0 || reached.size === 0) return reached;

  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = neighbours.get(a);
    if (list) list.push(b);
    else neighbours.set(a, [b]);
  };
  for (const r of relations) {
    // A self-relation adds nothing: the node is already in `reached` the moment it is
    // reached, and linking it to itself would only make the frontier do redundant work.
    if (r.from === r.to) continue;
    link(r.from, r.to);
    link(r.to, r.from);
  }

  let frontier = [...reached];
  for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const name of frontier) {
      for (const other of neighbours.get(name) ?? []) {
        if (reached.has(other)) continue;
        reached.add(other);
        next.push(other);
      }
    }
    frontier = next;
  }
  return reached;
}
