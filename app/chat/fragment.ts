"use client";

import { useEffect, useState } from "react";
import { isInstance, type Instance } from "@/lib/mycelium";

// The selected workspace + session live ONLY in the URL fragment as a single
// `#` followed by `&`-separated `key=value` pairs
// (`#t=..&s=..&r=..&sid=..`), parsed with URLSearchParams -- the standard
// fragment-as-query convention (workspace-selection DEC-2). The fragment is
// never sent to any server: the client reads it and passes the ids explicitly
// in the chat POST body, so the workspace ids never appear in request logs.

export interface Workspace {
  t: string; // tenantId
  s: string; // subsAccId
  r: Instance; // role
  /**
   * agent-projects: the project the view is in, from the ROUTE. Carried on the
   * workspace rather than threaded as a separate argument through every client
   * because it qualifies exactly the same thing the other three fields do —
   * WHICH workspace directory a request addresses. Every surface that reads user
   * content (files, folders, scheduled tasks, memory, the knowledge graph) has to
   * agree on it, and a parameter each of them could forget to pass is a parameter
   * some of them would.
   *
   * Undefined/null means the agent's own workspace.
   */
  p?: string | null;
}

export interface FragmentState {
  t?: string;
  s?: string;
  r?: string;
  sid?: string;
  // Optional scroll anchor: the `created_at` of a specific message to scroll to
  // when opening a conversation (e.g. clicking a past point in the tree view).
  // Transient -- consumed and stripped once the target is scrolled into view.
  msg?: string;
  // History sidebar view mode ("tree" | "list"); persisted in the URL so a reload or
  // shared link keeps it. Absent means the default, which is TREE: the tree shows how
  // conversations branch from one another, and a flat list is the reduction of it.
  hv?: string;
  // Top-level workspace view ("canvas"); when set, the Canvas timeline replaces
  // the history sidebar + chat view. Persisted in the URL so a reload or shared
  // link keeps it. Absent means the traditional chat.
  view?: string;
}

export function fragmentHash(workspace: Workspace, sid: string): string {
  const params = new URLSearchParams({ t: workspace.t, s: workspace.s, r: workspace.r, sid });
  return `#${params.toString()}`;
}

// agent-projects lives in the PATH, not here: /chat for the agent's own
// workspace, /chat/projects/<id> for a project.
//
// It was a fragment key first, and that was wrong in a way worth recording.
// Fragment state is edited in place, so entering a project kept whatever `sid`
// was open — a global conversation — and the chat pane went on showing it while
// the sidebar claimed to be inside a project. A route change is a navigation:
// the view is rebuilt, and what does not belong to the destination does not
// come along.
export function projectPath(project: string | null): string {
  return project ? `/chat/projects/${encodeURIComponent(project)}` : "/chat";
}

// The hash to carry ACROSS such a navigation: the workspace and the view mode
// travel, the open conversation does not.
//
// Dropping `sid` is the fix, not a detail. A conversation belongs to exactly one
// project — its transcripts live in that project's workspace — so carrying one
// into a different project would ask for history from a workspace that never
// held it, and the reply would come from the wrong agent.
export function crossProjectHash(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.delete("sid");
  params.delete("msg");
  const q = params.toString();
  return q ? `#${q}` : "";
}

function readFragment(): FragmentState {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    t: params.get("t") ?? undefined,
    s: params.get("s") ?? undefined,
    r: params.get("r") ?? undefined,
    sid: params.get("sid") ?? undefined,
    msg: params.get("msg") ?? undefined,
    hv: params.get("hv") ?? undefined,
    view: params.get("view") ?? undefined,
  };
}

// Sets `sid` on the current fragment while preserving t/s/r. Assigning
// `location.hash` (rather than router.push) fires a native `hashchange` so
// every subscriber re-renders, and adds a history entry so Back moves between
// conversations. An optional `msg` sets a scroll anchor (a message's created_at)
// so opening the conversation lands on that message; omitting it clears any
// stale anchor, so ordinary navigation still lands on the most recent message.
export function setFragmentSid(sid: string, msg?: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set("sid", sid);
  if (msg) params.set("msg", msg);
  else params.delete("msg");
  window.location.hash = params.toString();
}

// Persists the history sidebar view mode in the URL. Assigns `location.hash`
// (same mechanism as setFragmentSid) so a native `hashchange` fires reliably and
// the address bar updates -- other params are preserved. TREE is the default, so it
// is dropped from the hash to keep it clean and "list" is what gets written.
export function setHistoryView(view: "list" | "tree"): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  // Tree is the default, so it is "list" that has to be written into the URL.
  if (view === "list") params.set("hv", "list");
  else params.delete("hv");
  window.location.hash = params.toString();
}

// Persists the top-level workspace view in the URL. Same assign-`location.hash`
// mechanism as setHistoryView so a native `hashchange` fires and the address bar
// updates; other params (t/s/r/sid/hv) are preserved. "chat" is the default, so
// it's dropped from the hash to keep it clean; entering canvas drops the
// transient scroll anchor (`msg`).
export function setView(view: "chat" | "canvas"): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (view === "canvas") params.set("view", "canvas");
  else params.delete("view");
  params.delete("msg");
  window.location.hash = params.toString();
}

// Selects a whole workspace (replacing any previous t/s/r) plus its opening
// session in one write -- used when picking a workspace from the nav sidebar.
// Same native-hashchange mechanism as setFragmentSid. Preserves the history view
// mode (`hv`) so switching workspaces doesn't silently reset tree -> list; drops
// the transient scroll anchor (`msg`).
export function setWorkspace(workspace: Workspace, sid: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set("t", workspace.t);
  params.set("s", workspace.s);
  params.set("r", workspace.r);
  params.set("sid", sid);
  params.delete("msg");
  window.location.hash = params.toString();
}

// `null` means "not read yet" (first client render, before the mount effect
// runs) -- distinct from "read and empty", so callers don't redirect a valid
// fragment away on the initial paint before the hash has been parsed.
export function useFragment(): FragmentState | null {
  const [fragment, setFragment] = useState<FragmentState | null>(null);

  useEffect(() => {
    const sync = () => setFragment(readFragment());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return fragment;
}

export function toWorkspace(fragment: FragmentState): Workspace | null {
  if (!fragment.t || !fragment.s || !fragment.r || !isInstance(fragment.r)) return null;
  return { t: fragment.t, s: fragment.s, r: fragment.r };
}

// History is fetched via the BFF, which forwards tenant_id/subs_acc_id (read
// here from the fragment) to the proxy's session-history route.
export function historyQuery(
  workspace: Workspace,
  sessionId: string,
  project?: string | null,
): string {
  const params = new URLSearchParams({
    session_id: sessionId,
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
  });
  // agent-projects: a project's transcripts live under its own workspace, so
  // omitting this for a project conversation reads the main workspace and
  // returns an empty history — which looks like data loss, not a bug.
  if (project) params.set("project", project);
  return params.toString();
}
