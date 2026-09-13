import type { Workspace } from "./fragment";

// WHAT THE CENTRE PANE SHOWS INSTEAD OF THE CONVERSATION. Derived on every render from
// the fragment — never stored, for the reason its predecessor recorded: a remembered
// place outlives the URL that justified it, so a reload or a shared link opens somewhere
// nobody asked for.
//
// IT NAMED THE FIVE WORKSPACE SECTIONS TOO, FOR A WHILE, and that half is gone. The
// owner used it and reversed it on 2026-09-12: memory, the knowledge graph, scheduled
// tasks, files and secrets open BESIDE the conversation again, under `rs`, so the chat
// can coexist with them. Two keys, each naming one render target, is what lets every
// rule about either of them be unconditional — see fragment.ts's two setters.
//
// One module because three surfaces read this answer — the sidebar's Projects row, the
// breadcrumb's last segment and the centre pane itself — and three readings of the
// fragment is three things that can disagree about where the member is standing.
//
// React-free so it can be tested without mounting anything (the suite runs
// `environment: "node"`).

export type Destination = "projects";

/**
 * The fragment's `v` as a Destination, or null.
 *
 * `v` is text a member can hand-edit or receive in a link, and the centre pane picks a
 * screen by it. The same unchecked cast on `rs` once reached a panel that indexed its
 * section table by whatever it was handed and called a label on `undefined`; a cast
 * here would buy the same crash on a hand-edited link.
 *
 * A single value does not make the check redundant: what it refuses is every OTHER
 * string, including the five section names a link written against the one-key model
 * still carries.
 */
export function asDestination(value: string | null | undefined): Destination | null {
  return value === "projects" ? "projects" : null;
}

export type Centre =
  | { kind: "loading" }
  | { kind: "agents" }
  | { kind: "destination"; at: Destination }
  | { kind: "chat" };

/**
 * WHAT THE CENTRE PANE SHOWS. FR-1.3's table and nothing else.
 *
 * No `sid`: a workspace with no conversation open is still the chat, an empty one, and
 * ChatView's own empty state is what says so. Deciding that here would put the
 * conversation's emptiness in two places.
 *
 * `rs` is not an input. A section pane opens beside whatever this returns, so it can
 * never change the answer — which is the whole reason it is a second key.
 */
export function resolveCentre({
  resolved,
  workspace,
  destination,
}: {
  /** The fragment has been read. False on the first client render, before the mount effect. */
  resolved: boolean;
  workspace: Workspace | null;
  destination: Destination | null;
}): Centre {
  if (!resolved) return { kind: "loading" };
  if (!workspace) return { kind: "agents" };
  if (destination) return { kind: "destination", at: destination };
  return { kind: "chat" };
}
