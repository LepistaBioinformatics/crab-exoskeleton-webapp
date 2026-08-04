import { describe, it, expect } from "vitest";
import {
  buildActivity,
  marksForConversation,
  unattributedMarks,
} from "./canvas-activity";
import type { CronRun, CronTasks } from "@/lib/cronTasks";
import type { RecentChanges } from "@/lib/memoryGraph";
import type { ConversationSummary } from "@/lib/chatSession";

// The join is the whole feature: attributing a run or a fact to the WRONG conversation
// puts it on the wrong lane, which is a lie a screenshot cannot show. The two sources
// identify a conversation DIFFERENTLY — the graph by conversation id, a run by the
// proxy's derived session key — and mixing those up is the mistake to guard.

const taskLabel = (name: string) => `${name} ran`;
const learnedLabel = (entity: string) => `learned: ${entity}`;

function conv(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv-a",
    role: "alpha",
    tenantId: "t",
    subsAccId: "s",
    title: "A chat",
    updatedAt: 0,
    alias: null,
    tags: [],
    sessionKey: "key-a",
    sessionFile: null,
    ...over,
  } as ConversationSummary;
}

function run(over: Partial<CronRun> = {}): CronRun {
  return {
    jobId: "job1",
    runId: "r1",
    basename: "agent_cron-job1-r1",
    sessionKey: "key-a",
    startedAt: "2026-08-02T20:58:00Z",
    updatedAt: "2026-08-02T21:00:00Z",
    count: 4,
    prompt: "do it",
    transcriptMissing: false,
    ...over,
  };
}

const noGraph: RecentChanges = {
  recentEntities: [],
  recentRelations: [],
  recentObservations: [],
};

describe("buildActivity — scheduled runs", () => {
  it("puts a run on the lane of the conversation that scheduled it", () => {
    const tasks: CronTasks = {
      tasks: [{ ...({} as never), id: "job1", name: "Daily report", runs: [run()] }] as never,
      orphans: [],
    };
    const marks = buildActivity({
      tasks,
      graph: noGraph,
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks).toHaveLength(1);
    expect(marks[0].kind).toBe("run");
    expect(marks[0].conversationId).toBe("conv-a");
    expect(marks[0].label).toBe("Daily report ran");
    // Carried so the canvas can open that exact execution.
    expect(marks[0].runBasename).toBe("agent_cron-job1-r1");
  });

  // A run matches on sessionKey. Matching it against the conversation ID instead would
  // silently attribute nothing at all, and the lane would look idle.
  it("does not confuse the session key with the conversation id", () => {
    const marks = buildActivity({
      tasks: { tasks: [{ id: "job1", name: "T", runs: [run({ sessionKey: "conv-a" })] }] as never, orphans: [] },
      graph: noGraph,
      conversations: [conv({ id: "conv-a", sessionKey: "key-a" })],
      taskLabel,
      learnedLabel,
    });
    expect(marks[0].conversationId, "matched a session key against an id").toBeNull();
  });

  it("keeps a run whose conversation cannot be resolved, unattributed", () => {
    const marks = buildActivity({
      tasks: { tasks: [{ id: "job1", name: "T", runs: [run({ sessionKey: "" })] }] as never, orphans: [] },
      graph: noGraph,
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks, "an unattributable run was dropped").toHaveLength(1);
    expect(unattributedMarks(marks)).toHaveLength(1);
  });

  // The clearest case of work the member was away for: the task deleted itself.
  it("includes orphan groups, named by their run's prompt", () => {
    const marks = buildActivity({
      tasks: {
        tasks: [],
        orphans: [{ jobId: "gone", runs: [run({ prompt: "one-off report" })] }],
      },
      graph: noGraph,
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toBe("one-off report ran");
  });

  it("skips a run with no parseable instant, having no place on an axis", () => {
    const marks = buildActivity({
      tasks: { tasks: [{ id: "j", name: "T", runs: [run({ startedAt: "" })] }] as never, orphans: [] },
      graph: noGraph,
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks).toHaveLength(0);
  });
});

describe("buildActivity — what the agent learned", () => {
  const graph: RecentChanges = {
    recentEntities: [],
    recentRelations: [],
    recentObservations: [
      {
        entity: "ledger",
        observations: [
          { content: "written in Go", timestamp: 1_000, sourceSessionId: "conv-a" },
          // Provenance is absent for cron, the heartbeat and concurrent chats. The
          // landing copy qualifies that; this must not invent a conversation for it.
          { content: "no source", timestamp: 2_000 },
        ],
      },
    ],
  };

  it("attributes an observation by conversation id and leaves the rest unattributed", () => {
    const marks = buildActivity({
      tasks: null,
      graph,
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks).toHaveLength(2);
    expect(marksForConversation(marks, "conv-a")).toHaveLength(1);
    expect(unattributedMarks(marks)).toHaveLength(1);
    expect(marks[0].label).toBe("learned: ledger");
  });

  it("ignores a sourceSessionId that names no conversation the member still has", () => {
    const marks = buildActivity({
      tasks: null,
      graph: {
        ...noGraph,
        recentObservations: [
          { entity: "x", observations: [{ content: "c", timestamp: 5, sourceSessionId: "deleted" }] },
        ],
      },
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks[0].conversationId).toBeNull();
  });
});

describe("buildActivity — ordering and empties", () => {
  it("returns marks oldest first, across both sources", () => {
    const marks = buildActivity({
      tasks: {
        tasks: [{ id: "j", name: "T", runs: [run({ startedAt: "2026-08-05T00:00:00Z" })] }] as never,
        orphans: [],
      },
      graph: {
        ...noGraph,
        recentObservations: [
          { entity: "e", observations: [{ content: "c", timestamp: Date.parse("2026-08-01T00:00:00Z") }] },
        ],
      },
      conversations: [conv()],
      taskLabel,
      learnedLabel,
    });
    expect(marks.map((m) => m.kind)).toEqual(["learned", "run"]);
  });

  it("is empty rather than throwing when neither source has loaded", () => {
    expect(
      buildActivity({ tasks: null, graph: null, conversations: [], taskLabel, learnedLabel }),
    ).toEqual([]);
  });
});
