// Rebuilding the dock after a page reload.
//
// The turns themselves were never at risk -- the proxy runs them on a background context
// so a disconnect cannot cut them, and picoclaw persists the reply. `resumeIfActive`
// already knows how to pick one back up. What it cannot do is FIND them: it resumes the
// conversation the app mounts, and a member who reloaded with three turns in flight
// re-attaches to at most one.
//
// So this module does the discovery, and nothing else. It asks each workspace which
// conversations are mid-turn, joins the answer against the conversation records to get a
// label and a project, and hands each one to the unchanged resume path.

import { listConversations, type ConversationSummary } from "@/lib/chatSession";
import type { Workspace } from "@/app/chat/fragment";
import { getTurn, resumeIfActive, type RunContext } from "@/app/chat/turn-store";

interface RunningTurn {
  sessionId: string;
  since: string | null;
}

/**
 * The server's start time per restored conversation, in epoch millis.
 *
 * The ONLY honest clock for a restored chip. `lastEventAt` is 0 -- only `runTurn` and
 * `consumeStream` write it and a resumed turn goes through neither -- and
 * `recoveringSince` is stamped by `recover()` at resume time, so reading the store would
 * report a nine-minute turn as fresh. That is the exact lie the elapsed readout exists to
 * remove, which is why the proxy's registry carries a first-seen timestamp.
 *
 * Written before `resumeIfActive` marks the turn running, so by the time a chip can be
 * rendered the timestamp is already here. No subscription needed.
 */
const restoredSinceBySid = new Map<string, number>();

export function restoredSince(sid: string): number | null {
  return restoredSinceBySid.get(sid) ?? null;
}

/**
 * Module scope, not a React ref: the shell can remount (a workspace refetch, a locale
 * switch) and the fan-out must not repeat. `resumeIfActive`'s own `running` guard is the
 * second line of defence, not the first.
 */
let started = false;

async function fetchRunning(workspace: Workspace): Promise<RunningTurn[]> {
  const query = new URLSearchParams({ tenant_id: workspace.t, subs_acc_id: workspace.s });
  try {
    const res = await fetch(`/api/chat/${workspace.r}/running?${query.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.turns) ? (data.turns as RunningTurn[]) : [];
  } catch {
    // Unreachable is not "nothing is running". Returning nothing here only means the dock
    // stays empty, which is exactly where it was before this feature existed -- and a
    // connectivity banner for a background convenience would be noise.
    return [];
  }
}

async function restoreWorkspace(
  workspace: Workspace,
  onUnauthorized: () => void,
  resume: typeof resumeIfActive,
) {
  const [running, conversations] = await Promise.all([
    fetchRunning(workspace),
    listConversations(workspace).catch((): ConversationSummary[] => []),
  ]);
  if (running.length === 0) return;

  const byId = new Map(conversations.map((c) => [c.id, c]));
  for (const turn of running) {
    const record = byId.get(turn.sessionId);
    // Skipped, not docked with a placeholder: without a record there is no label and no
    // project, so the chip would name a conversation this client cannot open correctly.
    if (!record) continue;
    // A live turn in the store means this page never went away, so there is nothing to
    // restore. resumeIfActive checks this too; checking here also keeps the timestamp map
    // from claiming an in-session turn.
    if (getTurn(turn.sessionId).running) continue;

    const parsed = turn.since ? Date.parse(turn.since) : NaN;
    if (!Number.isNaN(parsed)) restoredSinceBySid.set(turn.sessionId, parsed);

    const ctx: RunContext = {
      workspace: { ...workspace, p: record.project },
      project: record.project,
      onUnauthorized,
    };

    // NO `active` probe is passed, and that is the load-bearing line of this module.
    //
    // The obvious optimisation is `{ active: () => true }` -- the listing just said so.
    // But resumeIfActive reads the transcript baseline BEFORE probing /active, precisely
    // so a turn that lands during the probe is not baselined with its own reply already
    // counted. The listing above happened EARLIER STILL, so short-circuiting reinstates
    // that race: the baseline would include the reply, never grow, and the turn would be
    // declared lost after eleven minutes. A success shown as a failure.
    //
    // Not awaited: the resume can poll for up to eleven minutes.
    void resume(turn.sessionId, ctx).catch(() => {});
  }
}

/**
 * Discover and resume every turn still in flight across the member's workspaces.
 *
 * Runs at most once per page load. Each probe is an in-memory registry read on the proxy
 * with no container side effects, so fanning out across workspaces costs HTTP overhead
 * rather than a fleet start.
 */
export async function restoreDockedTurns(
  workspaces: Workspace[],
  onUnauthorized: () => void,
  probes: { resume?: typeof resumeIfActive } = {},
): Promise<void> {
  if (started) return;
  started = true;
  const resume = probes.resume ?? resumeIfActive;
  await Promise.all(workspaces.map((ws) => restoreWorkspace(ws, onUnauthorized, resume)));
}

/** Tests only. */
export function __resetRestore() {
  started = false;
  restoredSinceBySid.clear();
}
