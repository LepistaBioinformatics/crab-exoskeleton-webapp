// The admin screen's section identity, kept in `?tab=` so a reload, a shared link
// or Back land on the same section. Pure and separate from the screen component so
// the parse is unit-testable without mounting the whole admin tree.

export const TAB_KEYS = ["files", "secrets", "skills", "model", "members", "branding"] as const;
export type Tab = (typeof TAB_KEYS)[number];

export const DEFAULT_TAB: Tab = "files";

// The tabs whose actions target an agent (shared content stores + the model
// registry), i.e. the ones that show the agent picker. Members is not
// agent-scoped and Branding is instance-wide.
export const AGENT_TABS: Tab[] = ["files", "secrets", "skills", "model"];

// Everything except Branding operates on a selected tenant or subscription, so the
// screen splits at that line: Branding is instance-wide and has no scope, the rest
// are sections OF a scope. The split drives a two-level navigation — a mode switch
// between the two worlds, then the sections inside the scoped one — so the sections
// can be nested beside the scope rail and stop needing to restate which scope they
// are acting on.
export const SCOPED_TABS: Tab[] = ["files", "secrets", "skills", "model", "members"];

export function isScopedTab(t: Tab): boolean {
  return t !== "branding";
}

// An absent or unrecognized value falls back to the default rather than rendering
// an empty panel — the query string is user-editable, so `?tab=garbage` has to
// resolve to something.
export function parseTab(raw: string | null | undefined): Tab {
  return (TAB_KEYS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : DEFAULT_TAB;
}
