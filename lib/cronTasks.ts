import type { Workspace } from "@/app/chat/fragment";
import type { ChatDict } from "@/lib/i18n/chat";
import { getJson, workspaceQuery } from "@/lib/workspaceApi";

// Read-only client for the agent's scheduled tasks (picoclaw cron jobs) and the
// transcripts each execution leaves behind.
//
// Read-only deliberately: picoclaw owns the job store and holds the live schedule
// in memory, so nothing here writes it. Creating and changing tasks is done by
// asking the agent.

/**
 * When a task runs. Exactly one parameter is meaningful, selected by `kind`:
 * `cron` uses `expr`, `every` uses `everyMs`, `at` is the one-shot kind and uses
 * `atMs`. An unfamiliar kind arrives with no parameter at all, so render `kind`.
 */
export interface CronSchedule {
  kind: string;
  expr?: string;
  everyMs?: number;
  atMs?: number;
}

/** What the task does when it fires. Only `agent_turn` has been observed. */
export interface CronPayload {
  kind: string;
  message?: string;
  channel?: string;
  to?: string;
}

/**
 * picoclaw's own bookkeeping.
 *
 * `lastStatus` describes only the MOST RECENT run, and its possible values are
 * unknown — display it, never branch on it. Per-run outcomes are recorded nowhere,
 * which is why executions carry no success mark.
 */
export interface CronState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
  lastError?: string;
}

/**
 * One execution.
 *
 * `startedAt`/`updatedAt` are when picoclaw opened the run's session and last wrote
 * to it — their difference is the only duration available. `basename` is the handle
 * for fetching the transcript.
 */
export interface CronRun {
  jobId: string;
  runId: string;
  basename: string;
  /**
   * The conversation that owned the task when it was scheduled, as the proxy's derived
   * session KEY (not the conversation id — `ConversationSummary.sessionKey` is what it
   * matches). Empty when picoclaw's marker was missing, which callers must treat as "no
   * conversation" rather than guessing one.
   */
  sessionKey: string;
  startedAt: string;
  updatedAt: string;
  count: number;
  prompt: string;
  transcriptMissing: boolean;
}

export interface CronTask {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronState;
  createdAtMs: number;
  updatedAtMs: number;
  deleteAfterRun: boolean;
  runs: CronRun[];
}

/**
 * Executions whose task is gone from the store.
 *
 * The normal end state of a one-shot task: `deleteAfterRun` removes the record and
 * leaves the transcripts. These are real executions the user can still open; they
 * just have no schedule left to describe, so the run's own prompt names them.
 */
export interface CronOrphanGroup {
  jobId: string;
  runs: CronRun[];
}

export interface CronTasks {
  tasks: CronTask[];
  orphans: CronOrphanGroup[];
}

/** One transcript entry, tool activity included. */
export interface CronEntry {
  role: string;
  content: string;
  created_at: string;
  model_name?: string;
  tool_calls?: CronToolCall[];
  tool_call_id?: string;
}

export interface CronToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

/**
 * Whether a task has already run and will not run again — the "done" pile the panel
 * hides by default.
 *
 * Three conditions, all required:
 *
 *  - **Nothing scheduled ahead.** A `nextRunAtMs` means picoclaw still intends to run
 *    it, which settles the question on its own.
 *  - **It has actually run.** A task that never fired is not "already done", however
 *    it is scheduled.
 *  - **Its schedule is one-shot shaped** — `deleteAfterRun`, or the `at` kind.
 *
 * That last condition is the deliberate part. A RECURRING task with no next run is
 * never treated as finished, even disabled: disabling is reversible, picoclaw may
 * simply not have recomputed the next instant yet, and hiding such a task would read
 * as having deleted it. Only tasks whose own schedule says "once" can be done.
 *
 * Executions whose task is gone from the store are finished by definition and are
 * not covered here — the panel groups them separately (see CronOrphanGroup).
 */
export function isFinished(task: CronTask): boolean {
  if (task.state.nextRunAtMs) return false;
  const hasRun = Boolean(task.state.lastRunAtMs) || task.runs.length > 0;
  if (!hasRun) return false;
  return task.deleteAfterRun || task.schedule.kind === "at";
}

/**
 * A task or an execution, picked in the panel and handed to the composer.
 *
 * The human-readable parts are pre-formatted by the panel, which is where the
 * locale lives. Deliberately no transcript: a run can be six figures of bytes, so
 * the reference carries what identifies it and lets the agent — which has the store
 * and the transcripts on its own filesystem — read the rest if it needs to.
 */
export type TaskReference =
  | {
      kind: "task";
      jobId: string;
      name: string;
      schedule: string;
      lastRun: string;
    }
  | {
      kind: "run";
      jobId: string;
      name: string;
      runId: string;
      instant: string;
    };

// Turns a referenced scheduled task or execution into one self-contained line.
//
// Self-contained, and never the transcript: a run can be six figures of bytes, so
// what travels is what identifies it plus enough to answer without a lookup. The
// agent owns the job store and the run transcripts on its own filesystem, so the ids
// are all it needs to read the rest. Same principle as buildQuote, which inlines a
// truncated snippet rather than a whole message.
export function buildTaskRef(ref: TaskReference, t: ChatDict): string {
  if (ref.kind === "task") {
    return `[${t.scheduledTasks.markerTask}: "${ref.name}" (${ref.jobId}) — ${ref.schedule}, ${t.scheduledTasks.markerLastRun} ${ref.lastRun}]`;
  }
  return `[${t.scheduledTasks.markerRun}: "${ref.name}" (${ref.jobId}), run ${ref.runId}, ${ref.instant}]`;
}

export function listTasks(workspace: Workspace): Promise<CronTasks> {
  return getJson<CronTasks>("/api/cron/tasks", workspaceQuery(workspace));
}

export function readRun(
  workspace: Workspace,
  basename: string,
): Promise<{ entries: CronEntry[] }> {
  return getJson<{ entries: CronEntry[] }>(
    "/api/cron/runs",
    workspaceQuery(workspace, { run: basename }),
  );
}
