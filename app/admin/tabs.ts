// The admin screen's section identity, kept in `?tab=` so a reload, a shared link
// or Back land on the same section. Pure and separate from the screen component so
// the parse is unit-testable without mounting the whole admin tree.

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

// The SECTIONS OF AN AGENT. Every one of them acts on the selected agent, which is
// now the first thing the screen asks for — before any tenant or subscription,
// because that is the order the system is built in.
//
// Which of these a given agent actually offers is not fixed: the model registry
// governs picoclaw agents only. That rule lives in `agent-scope.ts`, with the rest of
// the agent's vocabulary; this is the full set it draws from.
export const SECTION_TABS: Tab[] = ["files", "secrets", "skills", "persona", "model", "config"];

// An absent or unrecognized value falls back to the default rather than rendering
// an empty panel — the query string is user-editable, so `?tab=garbage` has to
// resolve to something.
export function parseTab(raw: string | null | undefined): Tab {
  return (TAB_KEYS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : DEFAULT_TAB;
}

// WHICH WORLD the screen is in. `members` and `branding` are not sections — a member
// list belongs to a subscription whatever agents it runs, and branding is
// instance-wide — so they are modes, and `?tab=` is what carries them.
export type AdminMode = "agents" | "members" | "branding";

interface Authority {
  /** At least one manageable tenant or subscription. */
  hasScopes: boolean;
  /** At least one manageable SUBSCRIPTION; a tenant scope has no member list. */
  hasSubscriptions: boolean;
  canEditBranding: boolean;
}

// The modes this caller can actually use. The bar is drawn only when there is more
// than one: with a single mode there is nothing to switch between.
export function availableModes(a: Authority): AdminMode[] {
  const modes: AdminMode[] = [];
  if (a.hasScopes) modes.push("agents");
  if (a.hasSubscriptions) modes.push("members");
  if (a.canEditBranding) modes.push("branding");
  return modes;
}

// Derived from the tab rather than kept beside it: two sources for one piece of state
// is how they drift, and `?tab=` already survives a reload, a shared link and Back.
//
// `?tab=` is user-editable, so a hand-typed `?tab=branding` must not render the
// branding panel to someone without branding rights, and `?tab=members` must not
// render an empty rail to someone who manages no subscription directly. The proxy is
// the real gate (NFR-1), but a screen showing a panel the caller cannot use is a
// worse answer than one showing what they can.
//
// The fallback is the caller's FIRST available mode, not a fixed one: a
// branding-only caller landing on `agents` would get a gate leading nowhere.
export function resolveMode(tab: Tab, a: Authority): AdminMode {
  if (tab === "branding" && a.canEditBranding) return "branding";
  if (tab === "members" && a.hasSubscriptions) return "members";
  if (a.hasScopes) return "agents";
  return availableModes(a)[0] ?? "agents";
}
