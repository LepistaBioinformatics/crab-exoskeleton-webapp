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
   * agent-projects: the project the view is in. Carried on the workspace rather
   * than threaded as a separate argument through every client because it
   * qualifies exactly the same thing the other three fields do —
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
  // agent-projects: the project being browsed. Absent means the agent's own
  // workspace. See setFragmentProject for why this is here and not in the path.
  p?: string;
  // Optional scroll anchor: the `created_at` of a specific message to scroll to
  // when opening a conversation (e.g. clicking a past point in the tree view).
  // Transient -- consumed and stripped once the target is scrolled into view.
  msg?: string;
  // History sidebar view mode ("tree" | "list"); persisted in the URL so a reload or
  // shared link keeps it. Absent means the default, which is TREE: the tree shows how
  // conversations branch from one another, and a flat list is the reduction of it.
  hv?: string;
  // Which screen the centre pane shows INSTEAD of the conversation. Its only value is
  // "projects". ABSENT means the conversation, which is the shell's resting state and
  // therefore the one that costs no key.
  //
  // It carried the five workspace sections too, for a while, and the owner reversed that
  // on 2026-09-12 after using it: they open beside the conversation, under `rs`, so the
  // chat can coexist with them. TWO KEYS RATHER THAN ONE WITH TWO RENDER TARGETS, and
  // that is what makes every rule below unconditional — a setter either drops `v` or it
  // does not, with no "unless this one is a pane" clause to get wrong.
  //
  // A fragment key and not a route segment, for the reason setFragmentProject records
  // below: a path change is a pushState, which does not fire `hashchange`, and the shell
  // paid for that twice over. `hv` and `rs` already live here and already work.
  v?: string;
  // Which workspace section is open in the pane BESIDE the conversation, or absent for
  // no pane. Live, and written by setRightSidebar.
  //
  // One key covers what used to be two states — a boolean in localStorage plus a section
  // that persisted nowhere — because it replaced `localStorage["chat-files-open"]`
  // deliberately and not additively: keeping both would have left two owners of the same
  // state, disagreeing the moment a second tab was opened. Same migration the history
  // view mode already went through.
  //
  // It briefly stopped being written, while the sections were centre destinations. The
  // one value that did not come back is "menu", the pane's own list of the other four:
  // the sidebar lists them now, so asSection reads it as no section at all.
  rs?: string;
}

export function fragmentHash(workspace: Workspace, sid: string): string {
  const params = new URLSearchParams({ t: workspace.t, s: workspace.s, r: workspace.r, sid });
  return `#${params.toString()}`;
}

// Enters a project (or leaves it, with null). Same assign-`location.hash`
// mechanism as every other setter here.
//
// IT LIVED IN THE PATH FOR A WHILE (/chat/projects/<id>, a catch-all route), and
// that is worth recording because the reason it moved there was real and the
// reason it came back is bigger.
//
// It moved to the path because fragment state is edited IN PLACE: entering a
// project kept whatever `sid` was open — a global conversation — and the chat
// pane went on showing it while the sidebar claimed to be inside a project. A
// route change is a navigation, so the view was rebuilt and the stale session
// did not come along.
//
// But the path bought that with a page navigation, and `router.push` is a
// pushState: it does NOT fire `hashchange`, which is the only thing useFragment
// listens to. So either the route remounted the tree — and then `useFragment`
// restarted at null, the workspace was momentarily unknown, and the sidebar
// track replayed its whole workspaces→chats slide on every project click — or it
// did not remount, and the fragment kept serving the stale `sid` the path was
// introduced to prevent. Both were true at different times; the slide is what
// was visible.
//
// Dropping `sid` and `msg` in the same write is what the route change was
// actually providing, and it is one line. A conversation belongs to exactly one
// project — its transcripts live in that project's workspace — so carrying one
// across would ask for history from a workspace that never held it.
//
// Staying in the fragment also puts the project back under the rule stated at
// the top of this file: it is never sent to a server, so a project id cannot
// turn up in a request log. In the path, it did.
export function setFragmentProject(project: string | null): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (project) params.set("p", project);
  else params.delete("p");
  params.delete("sid");
  params.delete("msg");
  // AND `v`. Entering a project is done FROM the projects screen, so leaving `v` set
  // meant the screen answered the click by re-rendering itself: `p` changed, the centre
  // pane still resolved to "projects", and the member was left looking at the list they
  // had just chosen from with no sign anything had happened.
  //
  // `rs` is NOT dropped with it, and that is the asymmetry the two keys exist for. A
  // pane is not a place you are standing, so entering a project does not leave it —
  // Files stays open beside the conversation and re-reads itself against the project's
  // own directory, which is what `workspace.p` in its fetch is for.
  params.delete("v");
  window.location.hash = params.toString();
}

// Enters a project AND opens a specific conversation in it, in ONE write. Two
// writes would leave a frame with the project set and no session — and, worse,
// each `location.hash =` is its own history entry, so Back would step through a
// state the member never chose.
export function setFragmentProjectSid(project: string | null, sid: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (project) params.set("p", project);
  else params.delete("p");
  params.set("sid", sid);
  params.delete("msg");
  // Opening a conversation is asking for the transcript, so the centre pane has to BE
  // the transcript. See setFragmentSid for the rule, and for why `rs` is untouched.
  params.delete("v");
  window.location.hash = params.toString();
}

function readFragment(): FragmentState {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    t: params.get("t") ?? undefined,
    s: params.get("s") ?? undefined,
    r: params.get("r") ?? undefined,
    sid: params.get("sid") ?? undefined,
    p: params.get("p") ?? undefined,
    msg: params.get("msg") ?? undefined,
    hv: params.get("hv") ?? undefined,
    rs: params.get("rs") ?? undefined,
    v: params.get("v") ?? undefined,
  };
}

/**
 * readFragment, for tests only.
 *
 * Exported because a setter is only half of a fragment key: `rs` shipped written but
 * unparsed, which TypeScript cannot catch — every field of FragmentState is optional,
 * so a key missing from readFragment's list is simply undefined forever. The round trip
 * is the only thing that proves a key works, and useFragment cannot provide it without
 * a DOM and an effect.
 */
export function readFragmentForTest(): FragmentState {
  return readFragment();
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
  // CHOOSING A CONVERSATION LEAVES THE PROJECTS SCREEN. `v` names what the centre pane
  // shows, and asking for a conversation is asking for that pane, so a `v` left standing
  // wins over the very thing the click was for -- the sidebar row highlighted, the URL
  // carried the new `sid`, and the screen went on showing the project list.
  //
  // `v` and `sid` are NOT independent (contrast setDestination, which preserves `sid`
  // precisely so the way back exists): a destination is somewhere you go while a
  // conversation waits, a conversation is not somewhere you go while a destination waits.
  //
  // `rs` AND `sid` ARE independent, and unconditionally so. The pane sits beside the
  // transcript rather than in place of it, so switching conversations with Files open
  // leaves Files open — the coexistence is the point of the second key.
  params.delete("v");
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


// Sends the centre pane to a destination, or back to the conversation with `null`. Same
// assign-`location.hash` mechanism as setHistoryView, and the conversation is written by
// REMOVING the key.
//
// IT PRESERVES `sid`, WHICH IS THE EXACT OPPOSITE OF WHAT setFragmentProject DOES WITH
// IT, and the two are not in disagreement. `p` decides which workspace directory a
// conversation lives in, so changing it makes the open `sid` name a transcript the new
// workspace never held — that is why it is dropped there. A destination changes only
// which screen is being looked at; the conversation is still exactly where it was, so a
// member who opens the projects screen and presses the chat crumb lands back in it.
//
// `p` survives for the same kind of reason. `v=projects` with `p` set is the breadcrumb's
// project segment, and clearing it would eject a member from their project for asking to
// see the list.
export function setDestination(destination: string | null): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (destination) params.set("v", destination);
  else params.delete("v");
  window.location.hash = params.toString();
}

// Opens a workspace section in the pane BESIDE the conversation, or closes the pane with
// `null`. Same assign-`location.hash` mechanism as setHistoryView, and closed is written
// by REMOVING the key -- which is also what keeps a shared link from carrying a pane the
// recipient did not ask for.
//
// IT TOUCHES `rs` AND NOTHING ELSE, and that is the whole point of the change that
// brought it back. Every other setter here decides something about where the member is;
// this one decides what is open next to them, and a pane that cleared `sid` or `v` on its
// way open would be the coexistence answering the click by taking the chat away.
//
// Typed `string | null` rather than `Section | null`, like setDestination: the fragment
// is strings, and asSection is the one place that turns one back into a section.
export function setRightSidebar(section: string | null): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (section) params.set("rs", section);
  else params.delete("rs");
  window.location.hash = params.toString();
}

// Selects a whole workspace (replacing any previous t/s/r) plus its opening
// session in one write -- used when picking a workspace from the nav sidebar.
// Same native-hashchange mechanism as setFragmentSid. Preserves the history view
// mode (`hv`) so switching workspaces doesn't silently reset tree -> list; drops
// the transient scroll anchor (`msg`).
export function setWorkspace(workspace: Workspace, sid: string, project?: string | null): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set("t", workspace.t);
  params.set("s", workspace.s);
  params.set("r", workspace.r);
  params.set("sid", sid);
  params.delete("msg");
  if (project) {
    // background-turn-dock: a docked chip can be a project conversation in a workspace
    // the shell is not on, and the caller knows which project because it read it off the
    // conversation record. It has to arrive in the SAME write: splitting it into
    // setWorkspace + setFragmentProjectSid leaves a frame on the right workspace with no
    // project, and every per-project fetch in that frame addresses the agent root.
    params.set("p", project);
  } else {
    // A project belongs to ONE agent — it is a picoclaw agent of its own, under that
    // agent's workspace. Carrying `p` into a different workspace would name a project
    // that does not exist there, and every per-project fetch would address a directory
    // nobody created. This stays the default: only a caller that has resolved the project
    // for THIS workspace may pass one.
    params.delete("p");
  }
  window.location.hash = params.toString();
}

/**
 * ARRIVES in a workspace, without naming a conversation in it.
 *
 * The sibling of `setWorkspace`, and the difference is the whole point: that one says
 * "take me to this conversation, which is over there", this one says "take me there".
 * `resolveCentre` answers an absent `sid` with the landing, whose composer is the one
 * place a conversation is minted (shell-path-and-landing FR-3.5) -- so arriving creates
 * nothing, and a member who never sends has left nothing behind.
 *
 * It is what both doors into a workspace use: the picker's click, and the lone-workspace
 * shortcut that skips the picker. The picker used to call `createConversation` first and
 * hand the new id to `setWorkspace`, which predates FR-3.5 and was never brought in
 * line; every entry through it minted a conversation nobody asked for.
 *
 * `p` and `v` GO. Both are qualified by the workspace being left: a project belongs to
 * one agent, and a destination names a surface scoped to both. Carrying either into a
 * different workspace would name something that does not exist there. `hv` and `rs`
 * stay, as they do for every other move -- how you like the history drawn, and what is
 * open beside you, are not places you were standing.
 */
export function enterWorkspace(workspace: Workspace): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set("t", workspace.t);
  params.set("s", workspace.s);
  params.set("r", workspace.r);
  params.delete("sid");
  params.delete("msg");
  params.delete("p");
  params.delete("v");
  window.location.hash = params.toString();
}

// Leaves the workspace entirely: back to the agent grid.
//
// Clears the WHOLE selection rather than only `t`/`s`/`r`. Everything else in the
// fragment is qualified by the workspace that is going away — a `sid` names a transcript
// under it, a `p` names one of its projects, a `v` and an `rs` name surfaces scoped to
// both — so a key left behind would describe a workspace nobody is in. The grid then
// hands back a fresh selection through setWorkspace, which is where those keys come from
// again.
export function clearWorkspace(): void {
  window.location.hash = "";
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
