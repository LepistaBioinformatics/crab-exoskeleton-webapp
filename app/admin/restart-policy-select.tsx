"use client";

import { Input } from "@/components/ui/input";
import {
  RESTART_MODES,
  policyIsValid,
  type RestartPolicy,
  type RestartMode,
} from "@/lib/restartPolicy";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// How the next change that needs a container bounce is delivered
// (restart-control FR-8.1). Owned by the admin screen rather than by each panel,
// so one choice covers a run of edits (FR-8.2) instead of asking again per save.
//
// Deliberately NOT persisted server-side: it describes the admin's intent for
// this sitting, and a remembered "notify only" silently changing how a later
// session behaves would be worse than asking.
export default function RestartPolicySelect({
  policy,
  onChange,
}: {
  policy: RestartPolicy;
  onChange: (next: RestartPolicy) => void;
}) {
  const t = useT(adminCopy).restartPolicy;
  const label: Record<RestartMode, string> = {
    now: t.now,
    notice: t.notice,
    schedule: t.schedule,
  };
  const hint: Record<RestartMode, string> = {
    now: t.nowHint,
    notice: t.noticeHint,
    schedule: t.scheduleHint,
  };
  const invalidSchedule = policy.mode === "schedule" && !policyIsValid(policy);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand/40 bg-elevated px-3 py-2.5">
      <span className="text-xs font-medium text-fg-muted">{t.heading}</span>

      <div className="flex flex-wrap gap-1">
        {RESTART_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...policy, mode: mode as RestartMode })}
            aria-pressed={policy.mode === mode}
            className={
              "rounded-lg border px-2.5 py-1 text-sm transition-colors " +
              (policy.mode === mode
                ? "border-brand bg-accent text-accent-fg"
                : "border-brand/40 bg-transparent text-fg hover:bg-accent/10")
            }
          >
            {label[mode]}
          </button>
        ))}
      </div>

      <p className="text-xs text-fg-muted">{hint[policy.mode]}</p>

      {policy.mode === "schedule" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-muted">{t.atLabel}</span>
          <Input
            inputSize="sm"
            type="datetime-local"
            value={policy.at ?? ""}
            onChange={(e) => onChange({ ...policy, at: e.target.value })}
          />
          {invalidSchedule && (
            <span className="text-xs text-red-500">{t.atInvalid}</span>
          )}
        </label>
      )}

      {policy.mode !== "now" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-muted">{t.noteLabel}</span>
          <Input
            inputSize="sm"
            placeholder={t.notePlaceholder}
            value={policy.note ?? ""}
            onChange={(e) => onChange({ ...policy, note: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}
