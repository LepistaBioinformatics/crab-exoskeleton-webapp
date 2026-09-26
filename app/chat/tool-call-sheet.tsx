"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Spinner } from "@/components/ui/spinner";
import CodeBlock from "./code-block";
import type { TurnEvent } from "./message-rows";
import type { Workspace } from "./fragment";
import { chatCopy } from "@/lib/i18n/chat";
import { useT, useLocale } from "@/lib/i18n/context";
import { BCP47 } from "@/lib/i18n/format";

// WHAT THE CALL ACTUALLY RAN, AND WHAT CAME BACK.
//
// Neither is in the transcript, and neither is an oversight. The harness caps an
// event's arguments at 200 runes on purpose -- "an uncapped event log would grow
// a transcript by everything the agent ever wrote" -- and a tool result is
// written to the context window and nowhere else, because the member never saw
// it. So the row keeps the capped string, which is what makes a step scannable,
// and the whole of it lives in a record this fetches WHEN THE SHEET OPENS.
//
// The same BottomSheet the mangrove and the file list use, rather than a second
// one: two sheets in one app that disagree about their exit or their scroll are
// two things to learn.

interface Record {
  name?: string;
  arguments?: string;
  output?: string;
  status?: string;
  detail?: string;
  started_at?: string;
  ended_at?: string;
}

type State =
  | { at: "loading" }
  | { at: "record"; record: Record }
  /** The call is real; nobody wrote down what it did. A fact, not a failure. */
  | { at: "unrecorded" }
  | { at: "error" };

export default function ToolCallSheet({
  event,
  workspace,
  sessionId,
  project,
  onClose,
}: {
  /** Null when nothing is open. The sheet stays mounted to play its exit. */
  event: TurnEvent | null;
  workspace: Workspace;
  sessionId: string;
  project: string | null;
  onClose: () => void;
}) {
  const t = useT(chatCopy);
  const tag = BCP47[useLocale().locale];
  const [state, setState] = useState<State>({ at: "loading" });
  const auditId = event?.audit_id;

  useEffect(() => {
    if (!auditId) return;
    // Reset on every open: without this, reopening a second call shows the
    // first one's output for as long as the fetch takes.
    setState({ at: "loading" });
    let cancelled = false;
    const query = new URLSearchParams({
      session_id: sessionId,
      tenant_id: workspace.t,
      subs_acc_id: workspace.s,
      audit_id: auditId,
    });
    if (project) query.set("project", project);
    (async () => {
      try {
        const res = await fetch(`/api/chat/${workspace.r}/tool-call?${query.toString()}`);
        if (cancelled) return;
        if (!res.ok) {
          setState({ at: "error" });
          return;
        }
        const data = await res.json();
        setState(
          data?.recorded && data.record
            ? { at: "record", record: data.record as Record }
            : { at: "unrecorded" },
        );
      } catch {
        if (!cancelled) setState({ at: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auditId, sessionId, workspace.t, workspace.s, workspace.r, project]);

  const name = event?.name ?? "";

  return (
    <BottomSheet
      open={event !== null}
      title={name || t.toolCall.title}
      subtitle={state.at === "record" ? subtitle(state.record, t, tag) : undefined}
      onClose={onClose}
    >
      {state.at === "loading" && (
        <div className="flex justify-center py-8">
          <Spinner size={24} />
        </div>
      )}

      {state.at === "error" && <p className="text-sm text-fg-muted">{t.toolCall.failed}</p>}

      {/* SAID PLAINLY, and with the reasons, because every one of them is
          ordinary: the conversation predates the record, or it runs on a harness
          that writes none. A bare "nothing here" reads as a bug. */}
      {state.at === "unrecorded" && (
        <p className="text-sm text-fg-muted">{t.toolCall.unrecorded}</p>
      )}

      {state.at === "record" && (
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t.toolCall.command}
            </h3>
            {/* The same block the transcript renders code in, so a command reads
                here the way it reads there -- but INSIDE A <pre>, which the
                transcript gets from react-markdown and this has to supply. A
                bare CodeBlock is a <code>, and a <code> collapses every newline
                in it. */}
            <Block className="language-json">{prettyArguments(state.record.arguments)}</Block>
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t.toolCall.output}
            </h3>
            {/* No language on the output: a tool's result is not a grammar, and
                guessing one would colour a stack trace as though it were source.
                The <pre> is the whole point here -- a command's output IS its
                lines, and a directory listing rendered as one paragraph is not
                the same information. */}
            {state.record.output ? (
              <Block>{state.record.output}</Block>
            ) : (
              // A DIFFERENT FACT FROM "not recorded", and worth its own sentence.
              // The record exists and says what was being run; the call never
              // came back, because the turn died inside it.
              <p className="text-sm text-fg-muted">{t.toolCall.noOutput}</p>
            )}
          </section>

          {state.record.detail && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
                {t.toolCall.detail}
              </h3>
              <p className="whitespace-pre-wrap text-sm text-fg-muted">{state.record.detail}</p>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * A scrolling, line-preserving frame around a code block.
 *
 * CodeBlock renders a bare `<code>`, and relies on its caller for the `<pre>`.
 * In a transcript react-markdown supplies one, which is why the omission is
 * invisible there and why this was written without one first: the output came
 * back as a single paragraph, because HTML collapses the newlines a `<code>`
 * contains.
 *
 * `whitespace-pre-wrap` rather than the transcript's plain `<pre>` + horizontal
 * scroll. This is a reading surface: a 300-character line of output should come
 * back to the left margin rather than send the member sideways and back for
 * every line under it.
 */
function Block({ className, children }: { className?: string; children: string }) {
  return (
    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-current/10 p-3 text-xs leading-relaxed">
      <CodeBlock code={children} className={className} streaming={false} />
    </pre>
  );
}

/**
 * The call's arguments, indented.
 *
 * A provider sends these as one line, so `{"command":"…","timeout":30}` arrives
 * as a single run of text with the interesting part in the middle of it.
 *
 * RETURNED UNCHANGED WHEN IT DOES NOT PARSE, rather than throwing or blanking.
 * This is a system boundary: the string is whatever the model emitted, and the
 * harness stores it raw precisely because it does not trust it to be valid JSON.
 * Something unparseable is still the best evidence available of what ran, and
 * showing it badly formatted beats showing nothing.
 */
export function prettyArguments(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * How long it took, when both ends are known.
 *
 * Derived rather than stored: the harness writes two instants and a duration
 * computed from them cannot disagree with them. Absent while a call is still
 * running, or when the turn died inside it -- which is the same absence the
 * output has, and says the same thing.
 */
function subtitle(record: Record, t: typeof chatCopy.en, tag: string): string | undefined {
  if (!record.started_at || !record.ended_at) return undefined;
  const ms = new Date(record.ended_at).getTime() - new Date(record.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  // THROUGH Intl, not toFixed. Portuguese writes 1,4 and `toFixed` writes 1.4
  // whatever the reader's language is -- the same reason projects-screen.tsx
  // formats its dates with the locale tag rather than slicing an ISO string.
  const digits = ms < 1000 ? 2 : 1;
  const seconds = new Intl.NumberFormat(tag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ms / 1000);
  return t.toolCall.took.replace("{s}", seconds);
}
