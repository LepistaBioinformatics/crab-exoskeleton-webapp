"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClock, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import {
  getRestartNotice,
  requestRestart,
  withdrawRestart,
  type RestartNotice as Notice,
  type RestartTarget,
} from "@/lib/adminRestart";
import { policyIsValid, type RestartPolicy } from "@/lib/restartPolicy";

// What is pending for this scope, and the verb that acts on it (restart-control
// FR-8.3, over FR-5.1/5.2/5.3).
//
// Sits under the policy radiogroup rather than beside it: the radiogroup answers
// "when do the changes I am about to save take effect", and this answers "what is
// already armed, and act on the scope right now". One mode drives both — a second
// mode picker for the standalone action would let the section contradict itself.
//
// Before this existed, an admin who armed a notice from a save had no way to see
// it, amend it or withdraw it, and no way to bounce a scope without inventing a
// change to save. All three routes were already wired end to end with no caller.

// The scheduled instant is rendered in the viewer's zone. Locale formatting
// differs between the server and the browser, so it is client-only — this
// component is under the admin screen's own client-side scope loading and never
// renders with a notice on the server, but the guard keeps that from being an
// accident.
function whenText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function RestartNoticeBlock({
  target,
  policy,
  scopeLabel,
}: {
  target: RestartTarget;
  /** The mode chosen above; the action verb follows it. */
  policy: RestartPolicy;
  /** The tenant or subscription in the admin's words, for the confirmation. */
  scopeLabel: string;
}) {
  const t = useT(adminCopy).restartPolicy;
  const errs = useT(errorCopy);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const key = `${target.tenantId}|${target.subsAccId ?? ""}|${target.agent ?? ""}`;

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      setNotice(await getRestartNotice(target));
    } catch {
      // A failed read must not take the actions with it: the buttons still work,
      // and the proxy is the authority on what is armed either way.
      setNotice(null);
    } finally {
      setLoaded(true);
    }
    // `key` stands in for the target's identity — the object is rebuilt on every
    // render of the parent, so depending on it directly would refetch forever.
  }, [key]);

  useEffect(() => {
    setDone(null);
    setError(null);
    load();
  }, [load]);

  async function run(fn: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(message);
      await load();
    } catch (e) {
      // Through the catalogue, like every other admin panel: a 403 here would
      // otherwise surface the proxy's English sentence while the same failure
      // one section above reads in the viewer's language.
      setError(errorText(errs, e instanceof Error ? e.message : null));
    } finally {
      setBusy(false);
    }
  }

  const act = () =>
    run(
      () => requestRestart(target, policy),
      policy.mode === "now"
        ? t.doneRestarted
        : policy.mode === "notice"
          ? t.doneArmed
          : t.doneScheduled,
    );

  const actLabel =
    policy.mode === "now" ? t.actNow : policy.mode === "notice" ? t.actNotice : t.actSchedule;

  const reason =
    (t.reasons as Record<string, string | undefined>)[notice?.reason ?? ""] ?? t.reasonUnknown;

  return (
    <div className="flex flex-col gap-2 border-t border-brand/20 pt-3">
      <p className="text-xs text-fg-muted">{t.ridesAlong}</p>

      {!loaded ? (
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          <Spinner size={14} />
          {t.pendingReading}
        </span>
      ) : !notice ? (
        <p className="text-xs text-fg-muted">
          {t.pendingNone
            .replace("{scope}", scopeLabel)
            .replace("{agent}", target.agent ?? t.everyAgentSlot)}
        </p>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-brand/30 bg-surface px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
            {notice.scheduledAt ? (
              <AlarmClock size={13} aria-hidden />
            ) : (
              <BellRing size={13} aria-hidden />
            )}
            {notice.scheduledAt
              ? t.pendingScheduled.replace("{at}", whenText(notice.scheduledAt))
              : t.pendingSince.replace("{at}", whenText(notice.noticeAt))}
          </span>
          <span className="text-[11px] text-fg-muted">
            {reason}
            {notice.by ? ` · ${t.pendingBy.replace("{who}", notice.by)}` : ""}
          </span>
          {notice.note && <span className="text-[11px] text-fg-muted">“{notice.note}”</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="tonal"
          size="sm"
          disabled={busy || !policyIsValid(policy)}
          onClick={() => (policy.mode === "now" ? setConfirming(true) : act())}
        >
          {actLabel}
        </Button>
        {notice && (
          <Button
            variant="text"
            size="sm"
            disabled={busy}
            onClick={() => run(() => withdrawRestart(target), t.doneWithdrawn)}
          >
            {t.withdraw}
          </Button>
        )}
        {done && <span className="text-xs text-fg-muted">{done}</span>}
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Only the immediate bounce is confirmed. Notify and schedule are both
          reversible by the Withdraw button sitting next to them; a restart that
          already happened is not. */}
      <ConfirmDialog
        open={confirming}
        title={t.confirmTitle}
        message={(target.agent ? t.confirmMessageAgent : t.confirmMessage)
          .replace("{scope}", scopeLabel)
          .replace("{agent}", target.agent ?? "")}
        confirmLabel={t.confirmLabel}
        onConfirm={() => {
          setConfirming(false);
          act();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
