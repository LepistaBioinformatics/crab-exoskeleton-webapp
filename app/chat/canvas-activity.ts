import type { CronTasks } from "@/lib/cronTasks";
import type { RecentChanges } from "@/lib/memoryGraph";
import type { ConversationSummary } from "@/lib/chatSession";

// What the agent DID, on the same time axis as the conversations.
//
// The timeline showed when the member talked, which the recency-ordered sidebar already
// answers. What it could not show is the two things that happen when nobody is looking:
// the agent running a scheduled task, and the agent learning something. Both are already
// stored, both are already timestamped, and both already carry a conversation — they were
// just never put on an axis.
//
// Pure and separate from the component so the joining can be tested: attributing a run
// or a fact to the WRONG conversation is worse than leaving it unattributed, and that is
// not a thing you can see in a screenshot.

export type ActivityKind = "run" | "learned";

export interface ActivityMark {
  kind: ActivityKind;
  ts: number;
  /**
   * The conversation this belongs to, or null when it cannot be attributed.
   *
   * Null is NORMAL and must stay visible rather than being dropped. A scheduled run
   * whose chat marker is missing, and a fact the proxy could not attribute (cron, the
   * heartbeat, or two chats in flight at once) both land here — and unattended work with
   * no conversation is exactly the work a member is least likely to know about.
   */
  conversationId: string | null;
  label: string;
  /** Set for a run, so the canvas can open that execution. */
  runBasename?: string;
}

/**
 * Two ways a conversation is identified, because the two sources disagree.
 *
 * The knowledge graph's `sourceSessionId` is the conversation id (the fragment's `sid`).
 * A scheduled run carries the proxy's derived session KEY instead, which the
 * conversation list also holds. Resolving both here keeps that asymmetry in one place.
 */
function conversationIndex(conversations: ConversationSummary[]) {
  const byId = new Set(conversations.map((c) => c.id));
  const bySessionKey = new Map<string, string>();
  for (const c of conversations) {
    if (c.sessionKey) bySessionKey.set(c.sessionKey, c.id);
  }
  return {
    fromSessionId: (id: string | undefined) => (id && byId.has(id) ? id : null),
    fromSessionKey: (key: string) => bySessionKey.get(key) ?? null,
  };
}

export function buildActivity({
  tasks,
  graph,
  conversations,
  taskLabel,
  learnedLabel,
}: {
  tasks: CronTasks | null;
  graph: RecentChanges | null;
  conversations: ConversationSummary[];
  /** "{name} ran" — the task's name is interpolated by the caller's dictionary. */
  taskLabel: (name: string) => string;
  /** "learned: {entity}" */
  learnedLabel: (entity: string) => string;
}): ActivityMark[] {
  const index = conversationIndex(conversations);
  const marks: ActivityMark[] = [];

  // Every run of every task, including the orphan groups: a one-shot task deletes its
  // own record after running, and those runs are the clearest example of work that
  // happened while the member was away.
  const runGroups = [
    ...(tasks?.tasks ?? []).map((task) => ({ name: task.name || task.id, runs: task.runs })),
    ...(tasks?.orphans ?? []).map((group) => ({
      name: group.runs[0]?.prompt || group.jobId,
      runs: group.runs,
    })),
  ];
  for (const { name, runs } of runGroups) {
    for (const run of runs) {
      const ts = Date.parse(run.startedAt);
      if (Number.isNaN(ts)) continue; // no instant, no place on an axis
      marks.push({
        kind: "run",
        ts,
        conversationId: index.fromSessionKey(run.sessionKey),
        label: taskLabel(name),
        runBasename: run.basename,
      });
    }
  }

  // What it learned. Observations carry their own timestamp; the entity's name is the
  // label because that is what a member would recognise.
  for (const entry of graph?.recentObservations ?? []) {
    for (const observation of entry.observations) {
      if (!observation.timestamp) continue;
      marks.push({
        kind: "learned",
        ts: observation.timestamp,
        conversationId: index.fromSessionId(observation.sourceSessionId),
        label: learnedLabel(entry.entity),
      });
    }
  }

  return marks.sort((a, b) => a.ts - b.ts);
}

/** The marks that belong to one lane, oldest first. */
export function marksForConversation(
  marks: ActivityMark[],
  conversationId: string,
): ActivityMark[] {
  return marks.filter((m) => m.conversationId === conversationId);
}

/**
 * The marks no conversation claims.
 *
 * Given their own row rather than hidden, because "the agent did something and nothing
 * in your history says so" is the single most useful thing this view can tell a member.
 */
export function unattributedMarks(marks: ActivityMark[]): ActivityMark[] {
  return marks.filter((m) => m.conversationId === null);
}
