import { errorCode } from "@/lib/i18n/errors";
import { workspaceQuery } from "@/lib/workspaceApi";
import type { Workspace } from "@/app/chat/fragment";

// A tool call the agent is blocked on, waiting for this member to answer.
//
// The turn is STOPPED while this is open. That is what makes it a card in the
// conversation rather than a row in an inbox: there is no "later" -- the harness
// denies on its own five-minute deadline, and the agent is told nobody answered.
export interface PendingApproval {
  id: string;
  sessionId: string;
  toolCallId: string;
  tool: string;
  /** The tool's own arguments, shape decided by the tool. */
  arguments: unknown;
  requestedAt: string;
}

export async function listPendingApprovals(ws: Workspace): Promise<PendingApproval[]> {
  const res = await fetch(`/api/approvals?${workspaceQuery(ws)}`);
  if (!res.ok) {
    // A failed poll is not something to show. The progress line already says the
    // agent is waiting, and an error banner over it would describe the client's
    // problem rather than the member's decision.
    return [];
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.pending) ? (data.pending as PendingApproval[]) : [];
}

export async function answerApproval(
  ws: Workspace,
  input: { id: string; allowed: boolean; reason?: string },
): Promise<void> {
  const res = await fetch(`/api/approvals/answer?${workspaceQuery(ws)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

// --- what the card shows -----------------------------------------------------

/** A schedule as the create tool describes it, for the one tool we can read. */
interface ScheduleArgs {
  message?: unknown;
  kind?: unknown;
  expr?: unknown;
  everyMs?: unknown;
  atMs?: unknown;
  tz?: unknown;
  name?: unknown;
  deleteAfterRun?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The arguments, as a person reads them.
 *
 * ONE TOOL IS UNDERSTOOD, and the rest fall back to their raw JSON. That is the
 * honest shape: a member is being asked to allow something, so hiding an
 * argument the client does not recognise would be hiding the thing they are
 * agreeing to. A new gated tool renders as its own JSON until someone teaches
 * this function about it, which is a worse-looking card and not a wrong one.
 */
export function describeSchedule(args: unknown): { what: string; when: string } | null {
  if (!args || typeof args !== "object") return null;
  const a = args as ScheduleArgs;
  const message = str(a.message);
  if (!message) return null;

  const kind = str(a.kind);
  let when = "";
  if (kind === "cron") {
    const expr = str(a.expr);
    if (expr) when = a.tz ? `${expr} (${str(a.tz)})` : expr;
  } else if (kind === "every") {
    const ms = num(a.everyMs);
    if (ms !== null) when = humanInterval(ms);
  } else if (kind === "at") {
    const ms = num(a.atMs);
    if (ms !== null) when = new Date(ms).toLocaleString();
  }
  return { what: message, when };
}

// Minutes, hours or days -- whichever divides evenly, largest first. The floor
// upstream is fifteen minutes, so nothing smaller needs a word.
export function humanInterval(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}

/** The raw arguments, for a tool this client does not describe. */
export function rawArguments(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return "";
  }
}
