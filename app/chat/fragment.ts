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
  // History sidebar view mode ("tree" | "list"); persisted in the URL so a
  // reload or shared link keeps it. Absent means the default (list).
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
// the address bar updates -- other params are preserved. "list" is the default,
// so it's dropped from the hash to keep it clean.
export function setHistoryView(view: "list" | "tree"): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (view === "tree") params.set("hv", "tree");
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
export function historyQuery(workspace: Workspace, sessionId: string): string {
  return new URLSearchParams({
    session_id: sessionId,
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
  }).toString();
}
