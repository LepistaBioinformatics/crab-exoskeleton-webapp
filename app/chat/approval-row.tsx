"use client";

// What the agent asked permission for, and what the member answered.
//
// WHY THIS ROW EXISTS. The approval card is the most consequential thing in a
// conversation and was the only one that left nothing behind. It is polled into
// existence while a turn runs, it disappears the moment the decision resolves
// the blocked call, and it disappears WITHOUT a decision when the harness's
// deadline passes -- which is a member stepping away for five minutes and
// coming back to a conversation where nothing happened and nothing says why.
// The answer was written to an audit file no screen reads.
//
// SHAPED LIKE THE COMPACTION DIVIDER, deliberately. Both are things that
// happened AROUND the conversation rather than inside it, so neither takes a
// message band: a centred rule, a short line, and the detail behind a click.
// Two different shapes for two notes of the same weight would make the screen
// read as though one of them mattered more.
//
// NOT a copy of CompactionRow, which stays where it is. That row explains a
// mechanism nobody asked about; this one reports a decision the member made,
// and has a tool name, arguments and sometimes their own words to show.

import { ChevronRight, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { ApprovalRecord, ApprovalStatus } from "@/app/chat/message-rows";
import type { ChatDict } from "@/lib/i18n/chat";

const ICONS: Record<ApprovalStatus, typeof ShieldCheck> = {
  ok: ShieldCheck,
  denied: ShieldX,
  // Not a refusal and not a breakage. Both are the same shrug to the member:
  // the question went nowhere and the call did not run.
  expired: ShieldAlert,
  failed: ShieldAlert,
};

function line(t: ChatDict, r: ApprovalRecord): string {
  const tool = r.tool || t.approval.loggedUnknownTool;
  const template =
    r.status === "ok"
      ? t.approval.loggedAllowed
      : r.status === "denied"
        ? t.approval.loggedRefused
        : r.status === "expired"
          ? t.approval.loggedExpired
          : t.approval.loggedFailed;
  return template.replace("{tool}", tool);
}

export default function ApprovalRow({ record, t }: { record: ApprovalRecord; t: ChatDict }) {
  const Icon = ICONS[record.status];
  // Nothing to open when the harness recorded neither the arguments nor a
  // reason -- every transcript written before this feature, and an allow of a
  // tool called with none. A chevron that expands to an empty box is worse
  // than a line that is just a line.
  const hasDetail = record.args !== "" || record.reason !== "";

  const summary = (
    <>
      <span className="h-px flex-1 bg-rule" aria-hidden />
      <Icon size={12} aria-hidden />
      <span>{line(t, record)}</span>
      {hasDetail && (
        <ChevronRight
          size={12}
          className="transition-transform group-open:rotate-90"
          aria-hidden
        />
      )}
      <span className="h-px flex-1 bg-rule" aria-hidden />
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-3">
      {hasDetail ? (
        /* The rule IS the button, the pattern the compaction divider
           established: under a line that already reads as one status, a
           separate "What happened here?" row would be a second thing to read
           about the same event. `<details>` rather than state, so the keyboard
           operation and the expanded/collapsed announcement come for free. */
        <details className="group">
          <summary
            title={t.approval.loggedWhat}
            className="flex cursor-pointer list-none items-center gap-2 text-xs text-fg-muted/70 hover:text-fg-muted [&::-webkit-details-marker]:hidden"
          >
            {summary}
          </summary>
          <dl className="mx-auto mt-2 max-w-[520px] space-y-1.5 text-[11px] leading-relaxed text-fg-muted/70">
            {record.args !== "" && (
              <div>
                <dt>{t.approval.loggedArgs}</dt>
                {/* VERBATIM, AND NEVER PARSED. The harness flattens and caps
                    these at 200 runes, so what arrives may be a JSON document
                    with its tail cut off -- which is not JSON, and is still
                    the only description of what was allowed. */}
                <dd className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 font-mono text-fg">
                  {record.args}
                </dd>
              </div>
            )}
            {record.reason !== "" && (
              <div>
                <dt>{t.approval.loggedReason}</dt>
                <dd className="mt-0.5 text-fg">{record.reason}</dd>
              </div>
            )}
          </dl>
        </details>
      ) : (
        <div className="flex items-center gap-2 text-xs text-fg-muted/70">{summary}</div>
      )}
    </div>
  );
}
