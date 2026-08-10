"use client";

import { useEffect, useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerUpLeft,
  Wrench,
} from "lucide-react";
import {
  isFinished,
  listTasks,
  readRun,
  type CronEntry,
  type CronRun,
  type CronSchedule,
  type CronTasks,
  type TaskReference,
} from "@/lib/cronTasks";
import type { Workspace } from "./fragment";
import MessageContent from "./message-content";
import CodeBlock from "./code-block";
import { formatToolBody } from "./tool-output";
import { Alert } from "@/components/ui/alert";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { Spinner } from "@/components/ui/spinner";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { BCP47 } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/context";

// A read-only view of the agent's scheduled tasks and what each execution produced.
//
// Two sources are joined here, and neither is authoritative for the other: the task
// records come from picoclaw's job store, the executions from the per-run session
// transcripts it leaves behind. A one-shot task deletes its own record after running
// while its transcript stays, so "executions whose task is gone" is a normal result
// and gets its own labelled group rather than being hidden.
//
// Nothing here writes. picoclaw owns the store and holds the live schedule in memory,
// so creating or changing a task is done by asking the agent.
//
// Deliberately absent: any success tick on an execution. Per-run outcomes are not
// recorded anywhere. The task carries picoclaw's own `lastStatus`, which describes
// only its most recent run, and it is displayed verbatim because its possible values
// are unknown.

const runRow = cva(
  "flex w-full items-start gap-2 border-b border-brand/20 px-3 py-2 text-left transition-colors hover:bg-elevated",
);

const taskDot = cva("mt-1.5 size-2 shrink-0 rounded-full", {
  variants: {
    enabled: { true: "bg-accent", false: "border border-fg-muted bg-transparent" },
  },
  defaultVariants: { enabled: true },
});

// A switch, built here rather than in components/ui because it is the app's only
// one. The track carries the state; the thumb slides.
const switchTrack = cva(
  "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
  {
    variants: {
      on: { true: "bg-accent", false: "bg-fg-muted/35" },
    },
    defaultVariants: { on: false },
  },
);

const switchThumb = cva(
  "block size-3 rounded-full bg-bg transition-transform motion-reduce:transition-none",
  {
    variants: {
      on: { true: "translate-x-3.5", false: "translate-x-0.5" },
    },
    defaultVariants: { on: false },
  },
);

const toolToggle = cva(
  "flex w-full items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-left text-[11px] text-fg-muted transition-colors hover:text-fg",
);

// Only the user's own turns are distinguished; assistant and tool entries share the
// muted treatment. Modelled as one boolean rather than three role values, two of which
// were the same string — a table that implies they vary independently invites a change
// to one that silently lands on both.
const entryRole = cva("mb-1 text-[10px] font-semibold uppercase tracking-wide", {
  variants: {
    user: { true: "text-accent", false: "text-fg-muted" },
  },
  defaultVariants: { user: false },
});

// How many executions a task shows before "show more". A daily task accumulates one
// per day forever, and the recent ones are what anybody is looking for; the rest are
// one click away.
export const RUNS_SHOWN = 3;

/** The run the member drilled into, plus the label to title it with. */
interface OpenRun {
  run: CronRun;
  taskName: string;
  jobId: string;
}

export default function ScheduledTasksPanel({
  workspace,
  refreshSignal = 0,
  onReference,
}: {
  workspace: Workspace;
  /**
   * Bumped by the panel header's refresh control. The agent schedules tasks between
   * visits, so a member who just asked for one needs to pick it up without leaving
   * the panel. A refresh deliberately keeps the open run and the expanded tasks — it
   * is "look again", not "start over".
   */
  refreshSignal?: number;
  /**
   * Hands a task or an execution up to the chat view, which holds it as a context
   * slot and serializes it into the next message. Absent in tests and anywhere the
   * panel is shown without a composer.
   */
  onReference?: (ref: TaskReference) => void;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const { locale } = useLocale();

  // ONE object, not a tasks/orphans pair: they arrive together and every render guard
  // reads both, so two states could disagree — a failed reload used to blank `tasks`
  // and leave the previous workspace's orphan groups on screen under the error.
  const [data, setData] = useState<CronTasks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<OpenRun | null>(null);
  const [entries, setEntries] = useState<CronEntry[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // Finished work is hidden by DEFAULT: one-shot tasks pile up as soon as the agent
  // runs a few, and what the member came for is what is still going to happen. Not
  // persisted, matching the panel's siblings — the useful default is the one you want
  // on arrival, and the count of what is hidden is always on screen.
  const [hideFinished, setHideFinished] = useState(true);
  // Which task/orphan groups have had their run list expanded past RUNS_SHOWN. Keyed
  // by group so expanding one long history does not expand every other.
  const [allRuns, setAllRuns] = useState<Set<string>>(new Set());

  // A workspace switch invalidates the navigation too: tasks are per (member, agent),
  // so an open run from the previous workspace is meaningless. Kept OUT of the load
  // effect below so an explicit refresh does not collapse what the member expanded.
  //
  // ENTERING OR LEAVING A PROJECT COUNTS. It also drops `data`, so the incoming scope
  // shows a spinner rather than the outgoing scope's schedule presented as its own —
  // the load effect below cannot do that itself without clearing on every refresh.
  useEffect(() => {
    setOpen(null);
    setExpanded(new Set());
    setData(null);
  }, [workspace.t, workspace.s, workspace.r, workspace.p]);

  // Re-read on every visit rather than cached: the agent schedules and runs things
  // between visits, and a stale list would make the panel lie about what is running.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTasks(workspace)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Primitives, NOT `workspace`: ChatShell rebuilds that object on every one of its
    // own renders, so depending on its identity re-fetches on any unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r, workspace.p, refreshSignal]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setRunError(null);
    readRun(workspace, open.run.basename)
      .then((r) => {
        if (!cancelled) setEntries(r.entries);
      })
      .catch((e: Error) => {
        if (!cancelled) setRunError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `workspace.p` matters even though the effect is keyed on a basename: a run
    // basename only identifies a file WITHIN the sessions dir it was listed from, so
    // the same name under another scope is a different transcript.
  }, [open?.run.basename, workspace.t, workspace.s, workspace.r, workspace.p]);

  const fmtInstant = (value: string | number | undefined): string => {
    if (value === undefined || value === "" || value === 0) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(BCP47[locale], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const scheduleText = (s: CronSchedule): string => {
    if (s.kind === "cron" && s.expr) {
      return t.scheduledTasks.schedule.cron.replace("{expr}", s.expr);
    }
    if (s.kind === "every" && s.everyMs) {
      return t.scheduledTasks.schedule.every.replace(
        "{interval}",
        humanDuration(s.everyMs),
      );
    }
    if (s.kind === "at" && s.atMs) {
      return t.scheduledTasks.schedule.at.replace("{instant}", fmtInstant(s.atMs));
    }
    // A kind from a newer picoclaw: name it rather than guess at its parameter.
    return t.scheduledTasks.schedule.unknown.replace("{kind}", s.kind || "?");
  };

  // One toggle for both Sets: which tasks show their runs, and which groups show
  // every run rather than the most recent few.
  function toggle(
    set: (update: (prev: Set<string>) => Set<string>) => void,
    key: string,
  ) {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function referenceRun(o: OpenRun) {
    onReference?.({
      kind: "run",
      jobId: o.jobId,
      name: o.taskName,
      runId: o.run.runId,
      instant: fmtInstant(o.run.startedAt),
    });
  }

  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-brand/30 px-2 py-2">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronLeft size={14} aria-hidden />
            {t.scheduledTasks.backToTasks}
          </button>
          {onReference && (
            <button
              type="button"
              onClick={() => referenceRun(open)}
              aria-label={t.scheduledTasks.referenceAria}
              title={t.scheduledTasks.reference}
              className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-accent transition-colors hover:bg-elevated"
            >
              <CornerUpLeft size={13} aria-hidden />
              {t.scheduledTasks.reference}
            </button>
          )}
        </div>

        <div className="border-b border-brand/20 px-3 py-2">
          <p className="font-display text-sm font-semibold text-fg">{open.taskName}</p>
          <p className="text-[11px] text-fg-muted">
            {fmtInstant(open.run.startedAt)}
            {runDuration(open.run) && ` · ${runDuration(open.run)}`}
            {` · ${t.scheduledTasks.entries.replace("{count}", String(open.run.count))}`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {open.run.transcriptMissing ? (
            <Alert severity="info">{t.scheduledTasks.transcriptMissing}</Alert>
          ) : runError ? (
            <Alert severity="error">{errorText(err, runError)}</Alert>
          ) : entries === null ? (
            <Spinner />
          ) : (
            <ol className="space-y-3">
              {entries.map((e, i) => (
                <li key={`${e.created_at}-${i}`}>
                  <TranscriptEntry entry={e} t={t} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }

  // Orphan groups are finished by definition: the job removed itself after running,
  // so those executions can never repeat.
  const finishedCount =
    (data?.tasks.filter(isFinished).length ?? 0) + (data?.orphans.length ?? 0);
  const shownTasks = hideFinished
    ? (data?.tasks.filter((task) => !isFinished(task)) ?? null)
    : (data?.tasks ?? null);
  const shownOrphans = hideFinished ? [] : (data?.orphans ?? []);

  const nothing =
    data !== null && data.tasks.length === 0 && data.orphans.length === 0 && !loading;
  // Everything there is, is finished and filtered out. Saying "no scheduled tasks"
  // here would be a lie about the workspace rather than a statement about the filter.
  // No `data !== null` guard needed: with no data `shownTasks` is null on both branches,
  // so the length check is already false.
  const allFiltered =
    !nothing && !loading && shownTasks?.length === 0 && shownOrphans.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-brand/30 px-3 py-2 text-[11px] leading-snug text-fg-muted">
        {t.scheduledTasks.hint}
      </p>

      {finishedCount > 0 && (
        <div className="flex items-center gap-2 border-b border-brand/30 px-3 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={hideFinished}
            onClick={() => setHideFinished((v) => !v)}
            title={t.scheduledTasks.hideFinishedTitle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className={switchTrack({ on: hideFinished })} aria-hidden>
              <span className={switchThumb({ on: hideFinished })} />
            </span>
            <span className="min-w-0 flex-1 text-[11px] text-fg-muted">
              {t.scheduledTasks.hideFinished}
              {/* Always says how many are out of sight, so a filtered list never
                  passes for the whole list. */}
              {hideFinished &&
                ` · ${t.scheduledTasks.finishedHidden.replace("{count}", String(finishedCount))}`}
            </span>
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="px-3 py-2">
            <Alert severity="error">{errorText(err, error)}</Alert>
          </div>
        )}
        {loading && !data && (
          <div className="px-3 py-4">
            <Spinner />
          </div>
        )}
        {nothing && (
          <PanelEmpty
            icon={CalendarClock}
            title={t.scheduledTasks.none}
            body={t.scheduledTasks.noneHint}
          />
        )}
        {allFiltered && (
          <PanelEmpty
            icon={CheckCheck}
            title={t.scheduledTasks.allFinished}
            body={t.scheduledTasks.allFinishedHint}
          />
        )}

        {shownTasks?.map((task) => {
          const isOpen = expanded.has(task.id);
          return (
            <section key={task.id} className="border-b border-brand/30">
              <div className="flex items-start gap-2 px-3 py-2.5">
                <span className={taskDot({ enabled: task.enabled })} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-fg">
                    {task.name || task.id}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {scheduleText(task.schedule)}
                    {!task.enabled && ` · ${t.scheduledTasks.disabled}`}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-[11px] text-fg-muted">
                    <Row
                      label={t.scheduledTasks.lastRun}
                      value={
                        fmtInstant(task.state.lastRunAtMs) ||
                        t.scheduledTasks.neverRan
                      }
                    />
                    {fmtInstant(task.state.nextRunAtMs) && (
                      <Row
                        label={t.scheduledTasks.nextRun}
                        value={fmtInstant(task.state.nextRunAtMs)}
                      />
                    )}
                    {task.state.lastStatus && (
                      <Row
                        label={t.scheduledTasks.lastStatus}
                        value={task.state.lastStatus}
                      />
                    )}
                    {task.state.lastError && (
                      <Row
                        label={t.scheduledTasks.lastErrorLabel}
                        value={task.state.lastError}
                      />
                    )}
                    {task.payload.to && (
                      <p>
                        {t.scheduledTasks.deliversTo.replace(
                          "{target}",
                          task.payload.to,
                        )}
                      </p>
                    )}
                    {task.deleteAfterRun && <p>{t.scheduledTasks.oneShot}</p>}
                  </dl>
                </div>
                {onReference && (
                  <button
                    type="button"
                    onClick={() =>
                      onReference({
                        kind: "task",
                        jobId: task.id,
                        name: task.name || task.id,
                        schedule: scheduleText(task.schedule),
                        lastRun:
                          fmtInstant(task.state.lastRunAtMs) ||
                          t.scheduledTasks.neverRan,
                      })
                    }
                    aria-label={t.scheduledTasks.referenceAria}
                    title={t.scheduledTasks.reference}
                    className="shrink-0 rounded-md p-1 text-accent transition-colors hover:bg-elevated"
                  >
                    <CornerUpLeft size={13} aria-hidden />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => toggle(setExpanded, task.id)}
                className="flex w-full items-center gap-1.5 px-3 pb-2 text-left text-[11px] text-fg-muted transition-colors hover:text-fg"
              >
                <ChevronRight
                  size={12}
                  className={isOpen ? "rotate-90" : undefined}
                  aria-hidden
                />
                {task.runs.length === 0
                  ? t.scheduledTasks.noRuns
                  : t.scheduledTasks.runs.replace(
                      "{count}",
                      String(task.runs.length),
                    )}
              </button>

              {isOpen && task.runs.length > 0 && (
                <>
                  <p className="px-3 pb-1.5 text-[10px] leading-snug text-fg-muted">
                    {t.scheduledTasks.noOutcomeHint}
                  </p>
                  <RunList
                    runs={task.runs}
                    expandedAll={allRuns.has(task.id)}
                    onToggleAll={() => toggle(setAllRuns, task.id)}
                    onOpen={(run) =>
                      setOpen({
                        run,
                        taskName: task.name || task.id,
                        jobId: task.id,
                      })
                    }
                    fmtInstant={fmtInstant}
                    runDuration={runDuration}
                    t={t}
                  />
                </>
              )}
            </section>
          );
        })}

        {shownOrphans.map((group) => (
          <section key={group.jobId} className="border-b border-brand/30">
            <div className="flex items-start gap-2 px-3 py-2.5">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-fg-muted"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-fg">
                  {group.runs[0]?.prompt || t.scheduledTasks.removedTask}
                </p>
                <p className="text-[11px] text-fg-muted">
                  {t.scheduledTasks.removedTask} · {group.jobId}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">
                  {t.scheduledTasks.removedTaskHint}
                </p>
              </div>
            </div>
            <RunList
              runs={group.runs}
              expandedAll={allRuns.has(group.jobId)}
              onToggleAll={() => toggle(setAllRuns, group.jobId)}
              onOpen={(run) =>
                setOpen({
                  run,
                  taskName: run.prompt || t.scheduledTasks.removedTask,
                  jobId: group.jobId,
                })
              }
              fmtInstant={fmtInstant}
              runDuration={runDuration}
              t={t}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-fg-muted/70">{label}: </span>
      {value}
    </p>
  );
}

/**
 * A group's executions, newest first, capped at RUNS_SHOWN until the member asks for
 * the rest. The toggle always names how many more there are, so a truncated history
 * never passes for the whole one.
 */
export function RunList({
  runs,
  expandedAll,
  onToggleAll,
  onOpen,
  fmtInstant,
  runDuration,
  t,
}: {
  runs: CronRun[];
  expandedAll: boolean;
  onToggleAll: () => void;
  onOpen: (run: CronRun) => void;
  fmtInstant: (value: string | number | undefined) => string;
  runDuration: (run: CronRun) => string;
  t: typeof chatCopy.en;
}) {
  const hidden = runs.length - RUNS_SHOWN;
  const shown = expandedAll ? runs : runs.slice(0, RUNS_SHOWN);

  return (
    <>
      <ul>
        {shown.map((run) => (
          <li key={run.basename}>
            <RunButton
              run={run}
              instant={fmtInstant(run.startedAt)}
              duration={runDuration(run)}
              entriesLabel={t.scheduledTasks.entries.replace(
                "{count}",
                String(run.count),
              )}
              onOpen={() => onOpen(run)}
            />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={onToggleAll}
          className="w-full px-3 py-1.5 text-left text-[11px] text-accent transition-colors hover:bg-elevated"
        >
          {expandedAll
            ? t.scheduledTasks.showFewerRuns
            : t.scheduledTasks.showMoreRuns.replace("{count}", String(hidden))}
        </button>
      )}
    </>
  );
}

/**
 * One execution row. It carries the instant, how long the run took and how much it
 * logged — and no success mark, because that is not recorded per run.
 */
function RunButton({
  run,
  instant,
  duration,
  entriesLabel,
  onOpen,
}: {
  run: CronRun;
  instant: string;
  duration: string;
  entriesLabel: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className={runRow()}>
      <Clock size={12} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg">{instant}</span>
        <span className="block text-[10px] text-fg-muted">
          {[duration, entriesLabel].filter(Boolean).join(" · ")}
        </span>
      </span>
      <ChevronRight size={12} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
    </button>
  );
}

/**
 * One transcript entry.
 *
 * Tool activity is collapsed behind a one-line summary: a single run can carry
 * hundreds of kilobytes of tool output, and this column is narrow and resizable.
 * Expanded output scrolls inside its own box so the panel never scrolls sideways.
 */
function TranscriptEntry({
  entry,
  t,
}: {
  entry: CronEntry;
  t: typeof chatCopy.en;
}) {
  const [showTool, setShowTool] = useState(false);
  const isTool = entry.role === "tool";
  const calls = entry.tool_calls ?? [];

  if (isTool) {
    return (
      <CollapsibleTool
        label={t.scheduledTasks.toolResult}
        body={entry.content}
        t={t}
      />
    );
  }

  return (
    <div>
      <p
        className={entryRole({ user: entry.role === "user" })}
      >
        {entry.role}
        {entry.model_name && ` · ${entry.model_name}`}
      </p>
      {entry.content && (
        <div className="text-sm">
          <MessageContent content={entry.content} />
        </div>
      )}
      {calls.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {calls.map((call) => (
            <CollapsibleTool
              key={call.id}
              label={t.scheduledTasks.toolCall.replace("{name}", call.function.name)}
              body={call.function.arguments}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A tool's activity, collapsed behind a one-line summary.
 *
 * One component for both a tool RESULT and a tool CALL: they were written separately
 * and had already drifted on their scroll height for no stated reason. Collapsed by
 * default because a single run can carry hundreds of kilobytes of tool output, and the
 * expanded box scrolls on both axes so a narrow, resizable column never scrolls the
 * page sideways.
 */
function CollapsibleTool({
  label,
  body,
  t,
}: {
  label: string;
  body: string;
  t: typeof chatCopy.en;
}) {
  const [shown, setShown] = useState(false);
  // Only once opened: formatting and highlighting a body nobody expanded is work for nothing,
  // and a run can carry dozens of these.
  const formatted = useMemo(() => (shown ? formatToolBody(body) : null), [shown, body]);
  return (
    <div>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((v) => !v)}
        className={toolToggle()}
      >
        <Wrench size={11} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0">
          {shown ? t.scheduledTasks.collapseTool : t.scheduledTasks.expandTool}
        </span>
      </button>
      {shown && formatted && (
        <div className="mt-1 max-h-64 overflow-auto rounded-md bg-elevated text-[10px] leading-snug">
          {formatted.className ? (
            // Reuses the chat's own code block, so a tool's JSON is highlighted the same way
            // a fenced block in a message is, rather than getting a second treatment.
            <CodeBlock code={formatted.text} className={formatted.className} streaming={false} />
          ) : (
            // Not JSON — prose, or something that only starts like it. Highlighting this
            // would be confident, meaningless colour.
            <pre className="whitespace-pre-wrap p-2 text-fg-muted">{formatted.text}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A run's wall time, from when picoclaw opened its session to its last write. Empty
 * when either instant is unusable — there is no duration to claim, and "0s" would be
 * a claim.
 */
export function runDuration(run: CronRun): string {
  const from = new Date(run.startedAt).getTime();
  const to = new Date(run.updatedAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return "";
  return humanDuration(to - from);
}

/** ms → a short human interval ("45s", "5min", "2h 10min"). */
export function humanDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}min ${seconds}s` : `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}min` : `${hours}h`;
}
