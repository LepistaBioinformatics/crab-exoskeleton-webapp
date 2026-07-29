import type { Workspace } from "./fragment";

// WHICH PANEL the sidebar is showing. Derived on every render from the fragment plus
// one local flag — never stored as its own piece of state.
//
// React-free so it can be tested without mounting anything (the suite runs
// `environment: "node"`), and because a panel state machine that drifts from the URL
// is exactly the bug this shape exists to prevent: a stored panel would survive a
// reload that no longer carries a workspace, or a shared link that does.

export type SidebarPanel = "workspaces" | "chats";

export function resolvePanel({
  workspace,
  browsing,
  forceWorkspaces,
}: {
  /** From the URL fragment. Null until one is chosen (or until the hash is read). */
  workspace: Workspace | null;
  /**
   * The back control was pressed: show the tree so another workspace can be picked.
   * The current selection STAYS — back is a panel move, not a deselection, so the
   * chat on the right never blanks and the link stays shareable.
   */
  browsing: boolean;
  /**
   * The canvas view. It already lanes every conversation, so listing them beside it
   * is the same information twice; switching agent is the only navigation it needs.
   */
  forceWorkspaces: boolean;
}): SidebarPanel {
  if (forceWorkspaces) return "workspaces";
  if (!workspace) return "workspaces";
  return browsing ? "workspaces" : "chats";
}
