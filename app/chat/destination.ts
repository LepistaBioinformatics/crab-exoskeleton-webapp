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

export type Destination = "projects" | "reef";

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
  // A SECOND ACCEPTED VALUE DOES NOT MAKE THE CHECK REDUNDANT, and the reason is
  // the one the comment above gives: what this refuses is every OTHER string,
  // including the five section names a link written against the one-key model
  // still carries. Listing the values rather than casting is the whole point.
  return value === "projects" || value === "reef" ? value : null;
}

export type Centre =
  | { kind: "loading" }
  | { kind: "agents" }
  | { kind: "destination"; at: Destination }
  | { kind: "landing" }
  | { kind: "chat" };

/**
 * WHAT THE CENTRE PANE SHOWS. FR-3.1's table and nothing else.
 *
 * `sid` IS an input, and it used not to be. The rule was "a workspace with no
 * conversation open is still the chat, an empty one, and ChatView's own empty state is
 * what says so" — and what made that true was an effect in ChatView that minted a
 * conversation whenever `sid` was absent. Entering a project dropped `sid` precisely so
 * that effect would run, which meant entering a place put the member in a blank
 * transcript rather than in the place.
 *
 * The landing is that state given a screen of its own: a composer to start one, and the
 * scope's conversations under it. It is not an empty chat, which is why deciding it here
 * is no longer the duplication the old comment warned about — an empty chat and a
 * landing are two screens, and only one of them can be the answer.
 *
 * `rs` is not an input. A section pane opens beside whatever this returns, so it can
 * never change the answer — which is the whole reason it is a second key.
 */
export function resolveCentre({
  resolved,
  workspace,
  destination,
  sid,
}: {
  /** The fragment has been read. False on the first client render, before the mount effect. */
  resolved: boolean;
  workspace: Workspace | null;
  destination: Destination | null;
  /** The fragment's `sid`. Absent means no conversation has been chosen or started. */
  sid: string | null;
}): Centre {
  if (!resolved) return { kind: "loading" };
  if (!workspace) return { kind: "agents" };
  if (destination) return { kind: "destination", at: destination };
  if (!sid) return { kind: "landing" };
  return { kind: "chat" };
}
