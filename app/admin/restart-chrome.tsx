"use client";

import { useState } from "react";
import { Timer } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import RestartPolicySelect from "./restart-policy-select";
import RestartNoticeBlock from "./restart-notice";
import { policyIsValid, type RestartPolicy } from "@/lib/restartPolicy";
import type { Tab } from "./tabs";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// HOW CHANGES ARE DELIVERED, as permanent chrome of the menu rather than as an
// accordion inside each section.
//
// It used to be a collapsed `Accordion` repeated in every section except Files. Two
// things followed from that, and both were reported as confusion rather than as bugs:
// the policy in force was something an admin had to remember instead of read, and the
// control appeared and disappeared as they moved between sections.
//
// So: one mount point, in the context bar, on every breakpoint. Not in the rail — the
// rail collapses to an icon column that cannot state "at 2026-07-27 18:00" at a glance,
// which is the one thing this has to do.
//
// It does not unmount where it does not apply. A section that needs no delivery says so
// (`sectionNeedsDelivery` in tabs.ts is the single answer to that question); vanishing
// is the behaviour being removed.

export default function RestartChrome({
  policy,
  onChange,
  target,
  scopeLabel,
  needsDelivery,
  section,
}: {
  policy: RestartPolicy;
  onChange: (next: RestartPolicy) => void;
  target: { tenantId: string; subsAccId?: string; agent?: string };
  scopeLabel: string;
  needsDelivery: boolean;
  section: Tab;
}) {
  const t = useT(adminCopy);
  const [open, setOpen] = useState(false);
  const valid = policyIsValid(policy);

  if (!needsDelivery) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-fg-muted">
        <Timer size={13} className="shrink-0" aria-hidden />
        <span>{t.restartChrome.notNeeded}</span>
        <span>
          {section === "files" ? t.restartChrome.notNeededFiles : t.restartChrome.notNeededMembers}
        </span>
      </p>
    );
  }

  // The policy in force, in words, WITHOUT opening anything. The scheduled time is
  // printed as the admin typed it ("2026-07-27 18:00") rather than through
  // toLocaleString, which renders differently on the server and the client and would
  // trip hydration.
  const summary =
    policy.mode === "now"
      ? t.restartPolicy.summaryNow
      : policy.mode === "notice"
        ? t.restartPolicy.summaryNotice
        : policy.at
          ? t.restartPolicy.summarySchedule.replace("{at}", policy.at.replace("T", " "))
          : t.restartPolicy.summaryScheduleUnset;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <Timer size={13} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="font-medium text-fg-muted">{t.restartChrome.label}</span>
        <span className="min-w-0 flex-1 text-fg">{summary}</span>
        <Button variant="text" size="sm" onClick={() => setOpen((prev) => !prev)}>
          {open ? t.restartChrome.done : t.restartChrome.change}
        </Button>
      </div>

      {/* Forced open while the policy cannot be honoured: you cannot fix a blocking
          error inside a control you have closed. Recomputed on every render rather than
          latched, so a schedule that goes stale on its own — the chosen time simply
          passes — also forces it open. */}
      {(open || !valid) && (
        <div className="flex flex-col gap-3 rounded-lg border border-brand/25 bg-surface p-3">
          <RestartPolicySelect policy={policy} onChange={onChange} />
          <RestartNoticeBlock target={target} policy={policy} scopeLabel={scopeLabel} />
        </div>
      )}

      {/* The proxy rejects an incomplete schedule before writing, so the admin would get
          a 400 on a change they believed they made. Blocked here, where the cause is,
          rather than repeated in every panel. */}
      {!valid && <Alert severity="error">{t.restartPolicy.blocked}</Alert>}
    </div>
  );
}
