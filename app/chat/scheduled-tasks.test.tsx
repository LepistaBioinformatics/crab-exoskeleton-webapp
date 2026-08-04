import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// Same reason as uploads-sidebar.track.test.tsx: the suite runs `environment: "node"`,
// so no effect fires and nothing fetches — but the module graph is imported, so
// anything touched at import time has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import UploadsSidebar from "./uploads-sidebar";
import ScheduledTasksPanel, {
  humanDuration,
  RUNS_SHOWN,
  RunList,
} from "./scheduled-tasks-panel";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";
import {
  buildTaskRef,
  isFinished,
  type CronRun,
  type CronTask,
  type TaskReference,
} from "@/lib/cronTasks";

function task(over: Partial<CronTask> = {}): CronTask {
  return {
    id: "job1",
    name: "A task",
    enabled: true,
    schedule: { kind: "cron", expr: "0 18 * * *" },
    payload: { kind: "agent_turn", message: "do it" },
    state: {},
    createdAtMs: 0,
    updatedAtMs: 0,
    deleteAfterRun: false,
    runs: [],
    ...over,
  };
}

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

// What travels inside the sent message. The transcript must never be in here — a run
// reaches six figures of bytes — and it has to stay one line, because the marker sits
// alongside the member's own prose the way `[anexo: …]` does.
describe("chat reference markers", () => {
  const taskRef: TaskReference = {
    kind: "task",
    jobId: "e520b224e7714d16",
    name: "Relatório diário",
    schedule: "Cron 0 18 * * *",
    lastRun: "02 Aug, 20:58",
  };
  const runRef: TaskReference = {
    kind: "run",
    jobId: "e520b224e7714d16",
    name: "Relatório diário",
    runId: "5e055123-b25a",
    instant: "02 Aug, 20:58",
  };

  it("names the task, its id and its schedule", () => {
    const marker = buildTaskRef(taskRef, t);
    expect(marker).toContain("Relatório diário");
    expect(marker).toContain("e520b224e7714d16");
    expect(marker).toContain("Cron 0 18 * * *");
    expect(marker).toContain("02 Aug, 20:58");
  });

  it("names the run, so the agent can find that exact transcript", () => {
    const marker = buildTaskRef(runRef, t);
    expect(marker).toContain("5e055123-b25a");
    expect(marker).toContain("e520b224e7714d16");
  });

  it("distinguishes a task from one of its executions", () => {
    expect(buildTaskRef(taskRef, t)).not.toBe(buildTaskRef(runRef, t));
    expect(buildTaskRef(taskRef, t)).toContain(t.scheduledTasks.markerTask);
    expect(buildTaskRef(runRef, t)).toContain(t.scheduledTasks.markerRun);
  });

  it("stays a single bracketed line", () => {
    for (const ref of [taskRef, runRef]) {
      const marker = buildTaskRef(ref, t);
      expect(marker, "a multi-line marker would break up the member's prose").not.toContain("\n");
      expect(marker.startsWith("[")).toBe(true);
      expect(marker.endsWith("]")).toBe(true);
    }
  });
});

// Reaches both an `every` schedule ("every 300000ms" is unreadable) and a run's
// duration, so every branch is on a path the panel actually renders.
describe("humanDuration", () => {
  it("keeps sub-minute intervals in seconds", () => {
    expect(humanDuration(45_000)).toBe("45s");
  });

  it("drops a zero seconds remainder", () => {
    expect(humanDuration(300_000)).toBe("5min");
  });

  it("keeps a non-zero seconds remainder", () => {
    expect(humanDuration(153_000)).toBe("2min 33s");
  });

  it("rolls over into hours", () => {
    expect(humanDuration(7_800_000)).toBe("2h 10min");
    expect(humanDuration(7_200_000)).toBe("2h");
  });
});

// Drives what the panel hides by default, so a wrong answer either buries a task the
// member still expects to run or leaves the list full of finished clutter.
describe("isFinished", () => {
  it("is true for a one-shot that already ran", () => {
    expect(
      isFinished(task({ deleteAfterRun: true, state: { lastRunAtMs: 1 } })),
    ).toBe(true);
  });

  it("is true for an `at` task that already ran", () => {
    expect(
      isFinished(task({ schedule: { kind: "at", atMs: 5 }, state: { lastRunAtMs: 1 } })),
    ).toBe(true);
  });

  it("counts a run on record as having run, even with no lastRunAtMs", () => {
    const ran = task({
      deleteAfterRun: true,
      runs: [
        {
          jobId: "job1",
          runId: "r1",
          basename: "agent_cron-job1-r1",
          startedAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:01:00Z",
          count: 3,
          prompt: "do it",
          transcriptMissing: false,
        },
      ],
    });
    expect(isFinished(ran)).toBe(true);
  });

  it("is false while anything is still scheduled ahead", () => {
    expect(
      isFinished(
        task({ deleteAfterRun: true, state: { lastRunAtMs: 1, nextRunAtMs: 2 } }),
      ),
    ).toBe(false);
  });

  it("is false for a one-shot that has never run", () => {
    expect(isFinished(task({ deleteAfterRun: true, state: {} }))).toBe(false);
  });

  // The deliberate narrowness: disabling is reversible, and picoclaw may simply not
  // have recomputed the next instant. Hiding a recurring task would read as deletion.
  it("never hides a recurring task, even disabled with no next run", () => {
    expect(
      isFinished(task({ enabled: false, state: { lastRunAtMs: 1 } })),
    ).toBe(false);
  });
});

// A daily task accumulates one execution per day forever. Without a cap the panel
// turns into an unbounded scroll of near-identical rows.
describe("RunList", () => {
  // Newest FIRST, which is the order CronRuns serves and therefore the order the cap
  // has to assume: index 0 is the most recent execution.
  const runs = (n: number): CronRun[] =>
    Array.from({ length: n }, (_, i) => {
      const day = String(n - i).padStart(2, "0");
      return {
        jobId: "job1",
        runId: `r${i}`,
        basename: `agent_cron-job1-r${i}`,
        startedAt: `2026-08-${day}T00:00:00Z`,
        updatedAt: `2026-08-${day}T00:01:00Z`,
        count: 4,
        prompt: `run ${i}`,
        transcriptMissing: false,
      };
    });

  const list = (n: number, expandedAll: boolean) =>
    renderToStaticMarkup(
      <RunList
        runs={runs(n)}
        expandedAll={expandedAll}
        onToggleAll={() => {}}
        onOpen={() => {}}
        fmtInstant={(v) => String(v ?? "")}
        runDuration={() => "1min"}
        t={t}
      />,
    );

  const rows = (html: string) => (html.match(/<li>/g) ?? []).length;

  it("shows every run when there are no more than the cap", () => {
    const html = list(RUNS_SHOWN, false);
    expect(rows(html)).toBe(RUNS_SHOWN);
    expect(html).not.toContain("Show");
  });

  it("caps a long history and offers the rest", () => {
    const html = list(10, false);
    expect(rows(html)).toBe(RUNS_SHOWN);
    // The count of what is out of sight, so a capped list never passes for the whole
    // one.
    expect(html).toContain(
      t.scheduledTasks.showMoreRuns.replace("{count}", String(10 - RUNS_SHOWN)),
    );
  });

  it("shows all of them once expanded, and offers to collapse", () => {
    const html = list(10, true);
    expect(rows(html)).toBe(10);
    expect(html).toContain(t.scheduledTasks.showFewerRuns);
  });

  // Asserted on the instant, because that is what a run row actually renders — the
  // prompt is not shown there.
  it("keeps the newest runs and drops the oldest", () => {
    const html = list(10, false);
    expect(html, "the most recent execution is missing").toContain("2026-08-10");
    expect(html, "the 10th-oldest execution should be behind the toggle").not.toContain(
      "2026-08-01",
    );
  });
});

describe("scheduled tasks section", () => {
  it("is offered in the workspace menu", () => {
    const html = renderToStaticMarkup(
      <UploadsSidebar workspace={workspace} refreshSignal={0} onClose={() => {}} />,
    );
    expect(html).toContain(t.scheduledTasks.title);
    expect(html).toContain(t.uploads.sections.tasks);
  });

  // The detail pane's CONTENT is conditional on the chosen section, so at first paint
  // on the menu there is nothing of this panel to assert — hence initialSection.
  it("opens to the panel, which says it is read-only", () => {
    const html = renderToStaticMarkup(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        initialSection="tasks"
      />,
    );
    expect(
      html,
      "the hint is what tells the member to ask the agent instead of looking for an edit button",
    ).toContain(t.scheduledTasks.hint);
  });

  // No fetch happens under `environment: "node"`, so this is first paint with nothing
  // loaded yet: the panel must not claim "no scheduled tasks" before it has looked.
  it("does not claim emptiness before it has loaded", () => {
    const html = renderToStaticMarkup(
      <ScheduledTasksPanel workspace={workspace} />,
    );
    expect(html).not.toContain(t.scheduledTasks.none);
  });

  it("omits the reference action when there is no composer to reference into", () => {
    const html = renderToStaticMarkup(
      <ScheduledTasksPanel workspace={workspace} />,
    );
    expect(html).not.toContain(t.scheduledTasks.referenceAria);
  });

  // The agent schedules tasks between visits, so without this the member has to
  // leave the panel and come back to see a task they just asked for.
  it("offers a refresh control, labelled for tasks rather than for files", () => {
    const html = renderToStaticMarkup(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        initialSection="tasks"
      />,
    );
    expect(html).toContain(t.scheduledTasks.refreshAria);
    expect(html).toContain(t.scheduledTasks.refresh);
    expect(
      html,
      "the tasks panel is showing the files tree's refresh label",
    ).not.toContain(t.uploads.refreshAria);
  });
});
