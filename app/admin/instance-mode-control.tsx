"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Power } from "lucide-react";
import {
  readInstanceMode,
  writeInstanceMode,
  type InstanceMode,
  type InstanceModeView,
  type InstanceRef,
} from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { adminCopy } from "@/lib/i18n/admin";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// One instance's lifecycle mode, inline on its row.
//
// The reason this control exists is scheduled tasks. They run from timers inside
// the container, so a scale-to-zero instance fires none — and until now that was
// decided for a whole agent, which meant choosing between a permanently running
// container per member and no working schedules for anybody. One member who needs
// a daily report is a reason to keep ONE container up.
//
// The consequence is stated on the control rather than left to be inferred,
// because the member's own panel now says the same thing from the other side and
// an admin arriving from that report should recognise it.

const selectClass = "h-8 rounded-lg border border-brand bg-surface px-2 text-xs text-fg";

// Loaded LAZILY, one request per row and only once the member's row is expanded.
// The members panel lists every instance a member has, and fetching a mode for
// each on render would put N requests behind opening a row that an admin most
// often opens to do something else.
export default function InstanceModeControl({ instance }: { instance: InstanceRef }) {
  const t = useT(adminCopy);
  const err = useT(errorCopy);
  const [view, setView] = useState<InstanceModeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    readInstanceMode(instance)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.tenantId, instance.subsAccId, instance.userAccId, instance.agent]);

  async function change(next: InstanceMode | "") {
    setBusy(true);
    setError(null);
    try {
      // The response replaces the whole view rather than being merged: a clear
      // changes `effective`, `override` and `fires` together, and reconstructing
      // that here would be a second copy of the proxy's precedence rule.
      setView(await writeInstanceMode(instance, next));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !view) {
    return <Alert severity="error">{errorText(err, error)}</Alert>;
  }
  if (!view) {
    return <Spinner />;
  }

  // "" is the absence of an override, and it is a real, selectable choice --
  // "follow the agent" -- not a null state to be hidden.
  const selected: InstanceMode | "" = view.override;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Power size={14} className="shrink-0 text-fg-muted" aria-hidden />
        <select
          className={selectClass}
          value={selected}
          disabled={busy}
          aria-label={t.members.modeLabel}
          onChange={(e) => change(e.target.value as InstanceMode | "")}
        >
          <option value="">
            {t.members.modeInherit.replace("{default}", modeName(t, view.agentDefault))}
          </option>
          <option value="continuous">{t.members.modeContinuous}</option>
          {/* Offered only when the agent declares an idleTimeout. Without one
              the mode is unrepresentable and the write would be refused, so the
              choice is absent rather than present and broken. */}
          {view.scaleToZeroAllowed && (
            <option value="scale-to-zero">{t.members.modeScaleToZero}</option>
          )}
        </select>
        <Badge tone={view.fires ? "accent" : "neutral"}>
          {view.fires ? t.members.modeTasksRun : t.members.modeTasksInert}
        </Badge>
      </div>

      {/* The consequence, not the setting. An admin is here because a member
          said their scheduled tasks never ran. */}
      {!view.fires && (
        <p className="flex items-start gap-1 text-[11px] leading-snug text-fg-muted">
          <CalendarClock size={12} className="mt-0.5 shrink-0" aria-hidden />
          {t.members.modeTasksInertHint}
        </p>
      )}
      {error && <Alert severity="error">{errorText(err, error)}</Alert>}
    </div>
  );
}

function modeName(t: (typeof adminCopy)["en"], mode: InstanceMode): string {
  return mode === "continuous" ? t.members.modeContinuous : t.members.modeScaleToZero;
}
