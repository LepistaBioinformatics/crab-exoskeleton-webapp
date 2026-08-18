// The admin screen's section identity, kept in `?tab=` so a reload, a shared link
// or Back land on the same section. Pure and separate from the screen component so
// the parse is unit-testable without mounting the whole admin tree.

import { railItems, type Authority, type RailItem } from "./admin-nav";

export const TAB_KEYS = [
  "files",
  "secrets",
  "skills",
  "persona",
  "model",
  "config",
  "members",
  "branding",
] as const;
export type Tab = (typeof TAB_KEYS)[number];

export const DEFAULT_TAB: Tab = "files";

// The SECTIONS OF A SELECTED WORKSPACE — an agent AND a scope, both asked for before
// any of these is reachable.
//
// `members` is one of them now. It used to be a top-level mode with no agent at all,
// while the invite form inside it carried an agent picker of its own — two agent
// selections on one screen, and the one that decided who got access was the invisible
// one. What merged is the SELECTION; the scoping rules are unchanged (the roster is
// still the subscription's, whatever agents it runs). It sits last because the sections
// before it are all about content.
//
// Which of these a given agent actually offers is not fixed: the model registry governs
// picoclaw agents only, and the legacy all-agents entry gets neither the picoclaw
// sections nor `members`. That rule lives in `agent-scope.ts`, with the rest of the
// agent's vocabulary; this is the full set it draws from.
export const SECTION_TABS: Tab[] = [
  "files",
  "secrets",
  "skills",
  "persona",
  "model",
  "config",
  "members",
];

// WHETHER A SECTION'S WRITES NEED A CONTAINER BOUNCE, which is what decides whether the
// menu's restart policy applies to it.
//
// Answered in exactly one place because the restart control is now permanent chrome of
// the menu (spec FR-10) rather than an accordion each section decided to render. Two
// sections say no, for different reasons:
//
//   `files` — shared files reach containers through a live read-only mount, so there is
//   nothing to deliver.
//
//   `members` — its one write that needs delivery is a member's config.json, and
//   `InstanceConfigEditor` carries its own per-workspace policy for it. The menu-level
//   policy governs the writes the OTHER sections make, and claiming this one too would
//   promise a reach it does not have.
//
// It is also what keeps an incomplete schedule from blocking a section that never
// needed the policy: the block is gated on this, not on the control being on screen.
export function sectionNeedsDelivery(tab: Tab): boolean {
  return tab !== "files" && tab !== "members";
}

// An absent or unrecognized value falls back to the default rather than rendering
// an empty panel — the query string is user-editable, so `?tab=garbage` has to
// resolve to something.
export function parseTab(raw: string | null | undefined): Tab {
  return (TAB_KEYS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : DEFAULT_TAB;
}

// WHICH TOP-LEVEL ITEM the rail is on. `?tab=` carries it, as it carried the mode
// before: `branding` is an item, everything else is a section of the merged menu, so
// one parameter still addresses the whole screen.
//
// The item list itself and the caller's authority live in `admin-nav.ts`, with the rest
// of the navigation model.

// Derived from the tab rather than kept beside it: two sources for one piece of state is
// how they drift, and `?tab=` already survives a reload, a shared link and Back.
//
// `?tab=` is user-editable, so a hand-typed `?tab=branding` must not render the branding
// panel to someone without branding rights. The proxy is the real gate (NFR-1), but a
// screen showing a panel the caller cannot use is a worse answer than one showing what
// they can.
//
// The fallback is the caller's FIRST available item, not a fixed one: a branding-only
// caller landing on `workspaces` would get a gate leading nowhere.
export function resolveRailItem(tab: Tab, a: Authority): RailItem {
  if (tab === "branding" && a.canEditBranding) return "branding";
  if (a.hasScopes) return "workspaces";
  return railItems(a)[0] ?? "workspaces";
}
