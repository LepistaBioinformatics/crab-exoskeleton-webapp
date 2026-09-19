"use client";

// The agent is asking permission, and the turn is stopped until this is answered.
//
// WHY A CARD IN THE CONVERSATION and not a notification or an inbox. The request
// is synchronous: Loop.runTool blocks on it, the harness denies after five
// minutes, and the agent is then told nobody answered. There is no "later" to
// defer to. It also belongs beside the turn because the member has to see WHAT
// they are allowing -- a row saying "schedule_create is pending" is a decision
// with the subject removed.
//
// A REFUSAL IS NOT A FAILURE. The reason travels back to the model as a result it
// reads (DEC-2), so the agent can say why it did not schedule the thing rather
// than reporting an error. That is why the refusal path offers a reason field at
// all: it is the member talking to the agent, not dismissing a dialog.
//
// Nothing here polls when no turn is running. The parent mounts it only while one
// is, and the window a request can exist in is bounded by the harness's deadline.

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  answerApproval,
  describeSchedule,
  listPendingApprovals,
  rawArguments,
  type PendingApproval,
} from "@/lib/approvals";
import type { Workspace } from "@/app/chat/fragment";
import { chatCopy } from "@/lib/i18n/chat";
import { commonCopy } from "@/lib/i18n/common";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// Often enough that the card appears while the agent's own progress line is
// still saying it is waiting; rarely enough that five minutes of waiting is a
// hundred requests, not a thousand.
const POLL_MS = 3000;

export default function ApprovalCard({ workspace }: { workspace: Workspace }) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);

  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(() => {
    listPendingApprovals(workspace).then(setPending).catch(() => {});
  }, [workspace]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  async function answer(id: string, allowed: boolean, why?: string) {
    setError(null);
    setBusy(id);
    try {
      await answerApproval(workspace, { id, allowed, reason: why });
      // Drop it locally at once: the turn resumes immediately and the next poll
      // would otherwise leave the card on screen for up to three seconds after
      // the decision was made.
      setPending((list) => list.filter((p) => p.id !== id));
      setRefusing(null);
      setReason("");
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : "unknown"));
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <div className="space-y-2">
      {pending.map((p) => {
        const schedule = p.tool === "schedule_create" ? describeSchedule(p.arguments) : null;
        return (
          <div
            key={p.id}
            className="rounded-lg border border-rule-strong bg-elevated p-3 text-sm"
          >
            <div className="flex items-center gap-2 text-fg">
              <ShieldQuestion size={16} aria-hidden />
              <span className="font-semibold">{t.approval.title}</span>
            </div>

            {schedule ? (
              <dl className="mt-2 space-y-1 text-xs">
                <div>
                  <dt className="text-fg-muted">{t.approval.what}</dt>
                  <dd className="text-fg">{schedule.what}</dd>
                </div>
                {schedule.when && (
                  <div>
                    <dt className="text-fg-muted">{t.approval.when}</dt>
                    {/* An identifier the member may want to copy, not prose. */}
                    <dd className="font-mono text-fg">{schedule.when}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <>
                {/* A tool this client does not describe. Showing the raw
                    arguments is worse-looking and not wrong: hiding what is
                    being allowed would be. */}
                <p className="mt-2 text-xs text-fg-muted">
                  {t.approval.unknownTool.replace("{tool}", p.tool)}
                </p>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-xs text-fg">
                  {rawArguments(p.arguments)}
                </pre>
              </>
            )}

            <p className="mt-2 text-xs text-fg-muted">{t.approval.note}</p>
            {error && <p className="mt-2 text-xs text-blocked">{error}</p>}

            {refusing === p.id ? (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(ev: FormEvent) => {
                  ev.preventDefault();
                  void answer(p.id, false, reason.trim() || undefined);
                }}
              >
                <Input
                  value={reason}
                  onChange={(ev) => setReason(ev.target.value)}
                  placeholder={t.approval.reasonPlaceholder}
                  className="min-w-48 flex-1"
                  disabled={busy !== null}
                  autoFocus
                />
                <Button type="submit" variant="outlined" disabled={busy !== null}>
                  {t.approval.refuse}
                </Button>
                <Button
                  type="button"
                  variant="text"
                  disabled={busy !== null}
                  onClick={() => {
                    setRefusing(null);
                    setReason("");
                  }}
                >
                  {c.actions.cancel}
                </Button>
              </form>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  disabled={busy !== null}
                  onClick={() => void answer(p.id, true)}
                >
                  {t.approval.allow}
                </Button>
                <Button
                  variant="outlined"
                  disabled={busy !== null}
                  onClick={() => setRefusing(p.id)}
                >
                  {t.approval.refuse}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
