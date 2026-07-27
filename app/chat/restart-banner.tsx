"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchRestartStatus,
  formatScheduled,
  reasonText,
  restartInstance,
  type RestartStatus,
  type WorkspaceRef,
} from "@/lib/restart";
import { chatCopy } from "@/lib/i18n/chat";
import { useLocale, useT } from "@/lib/i18n/context";
import { BCP47 } from "@/lib/i18n/format";
import type { Workspace } from "./fragment";

// How often the banner re-checks. A restart notice is a human-frequency event
// (an admin saving a secret), so a minute is plenty; anything tighter would poll
// the proxy's Docker inspect for no gain.
const POLL_MS = 60_000;

// The member's restart affordance (restart-control FR-7). Three states:
//
//   - nothing pending          -> renders nothing at all
//   - an admin scheduled one   -> informational, no button (the proxy will do it)
//   - pending, unscheduled     -> actionable: "Restart now"
//
// A read-only member gets the same banner and a 403 if they somehow press the
// button, so the affordance stays honest either way -- the proxy is the gate.
export default function RestartBanner({
  workspace,
  refreshKey = 0,
}: {
  workspace: Workspace;
  // Bumped by callers that just did something needing a restart (a secret
  // write), so the banner appears immediately instead of at the next poll.
  refreshKey?: number;
}) {
  const t = useT(chatCopy).restart;
  const { locale } = useLocale();
  const ws: WorkspaceRef = workspace;
  const [status, setStatus] = useState<RestartStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchRestartStatus(ws));
    } catch {
      // A failed status check is not worth interrupting the conversation over:
      // keep the last known state and try again on the next tick.
    }
  }, [ws.t, ws.s, ws.r]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load, refreshKey]);

  const restart = async () => {
    setBusy(true);
    setError(null);
    try {
      await restartInstance(ws);
      await load();
    } catch (e) {
      // The BFF's normalized codes get catalogue copy; anything else is already
      // a message from the proxy and is shown as-is.
      const raw = e instanceof Error ? e.message : "";
      setError(
        raw === "session_expired"
          ? t.sessionExpired
          : raw === "connectivity"
            ? t.unreachable
            : raw || t.failed,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!status?.pending) return null;

  const scheduled = status.scheduledAt;

  return (
    <div className="flex items-start gap-3 border-b border-brand/40 bg-accent/10 px-4 py-2.5 text-sm">
      {scheduled ? (
        <CalendarClock size={18} className="mt-0.5 shrink-0" aria-hidden />
      ) : (
        <RotateCw size={18} className="mt-0.5 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-fg">
          {scheduled
            ? t.scheduled.replace("{when}", formatScheduled(scheduled, BCP47[locale]))
            : reasonText(t, status.reason)}
        </p>
        {/* When a time is showing, the headline is the time — so the reason
            follows it, ahead of the admin's optional note. */}
        {scheduled && <p className="mt-0.5 text-fg-muted">{reasonText(t, status.reason)}</p>}
        {status.note && <p className="mt-0.5 text-fg-muted">{status.note}</p>}
        {error && <p className="mt-1 text-red-500">{error}</p>}
      </div>

      {!scheduled && (
        <Button
          size="sm"
          variant="tonal"
          onClick={restart}
          // Disabled while in flight is the whole spam control (DEC-4): the
          // proxy's per-container lock already serializes, so a queued click is
          // wasteful rather than harmful and needs no server-side cooldown.
          disabled={busy}
          className="shrink-0"
        >
          {busy ? <Spinner size={14} /> : null}
          {busy ? t.restarting : t.now}
        </Button>
      )}
    </div>
  );
}
