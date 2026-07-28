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
import { cva } from "class-variance-authority";

const option = cva("rounded-lg border px-2.5 py-1 text-sm transition-colors", {
  variants: {
    chosen: {
      true: "border-brand bg-accent text-accent-fg",
      false: "border-brand/40 bg-transparent text-fg hover:bg-accent/10",
    },
  },
  defaultVariants: { chosen: false },
});

// How the next change that needs a container bounce is delivered
// (restart-control FR-8.1). Owned by the admin screen rather than by each panel,
// so one choice covers a run of edits (FR-8.2) instead of asking again per save.
//
// Deliberately NOT persisted server-side: it describes the admin's intent for
// this sitting, and a remembered "notify only" silently changing how a later
// session behaves would be worse than asking.
//
// A radiogroup, not a row of buttons. These were <button aria-pressed> labelled
// "Restart now" / "Notify members" / "Schedule for…", and an admin read the first
// one as a command, clicked it, and reported that no instance restarted. Nothing
// was wrong — the choice only takes effect on the next save — but a control that
// looks like an action and is worded like an action will be read as one. Radio
// semantics say "pick one of these", `aria-checked` says which, and the line
// under the group says outright that nothing happens until a change is saved.
export default function RestartPolicySelect({
  policy,
  onChange,
  modes = RESTART_MODES,
}: {
  policy: RestartPolicy;
  onChange: (next: RestartPolicy) => void;
  /**
   * Narrows the offered set. The instance-config editor passes ["now","notice"]:
   * the proxy reduces that endpoint's policy per WORKSPACE, where "schedule"
   * behaves as "notice", so offering a scheduler would promise a window nothing
   * arms.
   */
  modes?: readonly RestartMode[];
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
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fg-muted">{t.heading}</span>

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t.groupAria}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            onClick={() => onChange({ ...policy, mode: mode as RestartMode })}
            aria-checked={policy.mode === mode}
            className={option({ chosen: policy.mode === mode })}
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
