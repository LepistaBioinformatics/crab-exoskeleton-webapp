import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "./fragment";
import { __resetRestore, restoreDockedTurns, restoredSince } from "./turn-restore";
import { __reset, __seed, dockedTurns } from "./turn-store";

vi.mock("@/lib/chatSession", () => ({
  listConversations: vi.fn(),
  // turn-store imports these; the restore path never reaches them here.
  notifyConversationsUpdated: vi.fn(),
  syncSessionRefs: vi.fn(() => Promise.resolve()),
  touchConversation: vi.fn(() => Promise.resolve()),
}));

import { listConversations } from "@/lib/chatSession";

const wsA: Workspace = { t: "T1", s: "S1", r: "alpha" };
const wsB: Workspace = { t: "T1", s: "S1", r: "beta" };

function conversation(id: string, ws: Workspace, project: string | null = null) {
  return {
    id,
    role: ws.r,
    tenantId: ws.t,
    subsAccId: ws.s,
    title: `title-${id}`,
    updatedAt: 0,
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project,
  };
}

let resumeCalls: Array<{ sid: string; project: string | null | undefined; probes: unknown }>;

beforeEach(() => {
  __reset();
  __resetRestore();
  resumeCalls = [];
  vi.mocked(listConversations).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __reset();
  __resetRestore();
});

function stubFetch(byInstance: Record<string, Array<{ sessionId: string; since: string | null }>>) {
  const fetchMock = vi.fn(async (url: string) => {
    const instance = url.match(/\/api\/chat\/([^/]+)\/running/)?.[1] ?? "";
    if (!(instance in byInstance)) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: true,
      json: async () => ({ turns: byInstance[instance] }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const resume = async (sid: string, ctx: { project?: string | null }, probes: unknown) => {
  resumeCalls.push({ sid, project: ctx.project, probes });
};

describe("restoreDockedTurns", () => {
  it("resumes a discovered conversation with the workspace and project from its record", async () => {
    stubFetch({ alpha: [{ sessionId: "conv-a", since: "2026-08-18T12:00:00Z" }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA, "proj-x")]);

    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(resumeCalls).toHaveLength(1);
    expect(resumeCalls[0].sid).toBe("conv-a");
    expect(resumeCalls[0].project).toBe("proj-x");
  });

  // THE requirement of this task. resumeIfActive reads the transcript baseline BEFORE it
  // probes /active, and its own docblock explains why: a turn that lands during the probe
  // would otherwise be baselined with its own reply already counted, never grow, and
  // report turn_lost after eleven minutes -- a success displayed as a failure.
  //
  // The listing probe here happens EARLIER STILL, so telling resumeIfActive "it's active,
  // don't check" puts the sequence back into exactly that broken order. The listing
  // discovers candidates; each candidate is then confirmed by the unchanged path.
  it("does not short-circuit resumeIfActive's own active probe", async () => {
    stubFetch({ alpha: [{ sessionId: "conv-a", since: null }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await restoreDockedTurns([wsA], () => {}, { resume });

    const probes = resumeCalls[0].probes as { active?: unknown } | undefined;
    expect(probes?.active).toBeUndefined();
  });

  it("skips a session id no conversation record matches", async () => {
    stubFetch({ alpha: [{ sessionId: "ghost", since: null }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(resumeCalls).toHaveLength(0);
  });

  it("probes every workspace and unions the results", async () => {
    stubFetch({
      alpha: [{ sessionId: "conv-a", since: null }],
      beta: [{ sessionId: "conv-b", since: null }],
    });
    vi.mocked(listConversations).mockImplementation(async (ws) =>
      ws.r === "alpha" ? [conversation("conv-a", wsA)] : [conversation("conv-b", wsB)],
    );

    await restoreDockedTurns([wsA, wsB], () => {}, { resume });

    expect(resumeCalls.map((c) => c.sid).sort()).toEqual(["conv-a", "conv-b"]);
  });

  // A background convenience must not produce a banner. The member is no worse off than
  // before the feature existed.
  it("docks nothing and does not throw when a probe fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await expect(restoreDockedTurns([wsA], () => {}, { resume })).resolves.toBeUndefined();
    expect(resumeCalls).toHaveLength(0);
    expect(dockedTurns()).toHaveLength(0);
  });

  it("runs once per page load, however often it is called", async () => {
    const fetchMock = stubFetch({ alpha: [{ sessionId: "conv-a", since: null }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await restoreDockedTurns([wsA], () => {}, { resume });
    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resumeCalls).toHaveLength(1);
  });

  it("does not resume a conversation that already has a live turn in the store", async () => {
    stubFetch({ alpha: [{ sessionId: "conv-a", since: null }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);
    __seed("conv-a", { running: true });

    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(resumeCalls).toHaveLength(0);
  });
});

describe("restoredSince", () => {
  // The only honest clock for a restored chip. lastEventAt is 0 (a resumed turn goes
  // through neither runTurn nor consumeStream) and recoveringSince is stamped by
  // recover() at resume time, so reading the store would show a nine-minute turn as fresh.
  it("records the server's timestamp for a restored conversation", async () => {
    stubFetch({ alpha: [{ sessionId: "conv-a", since: "2026-08-18T12:00:00Z" }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(restoredSince("conv-a")).toBe(Date.parse("2026-08-18T12:00:00Z"));
  });

  it("is null for a conversation that was never restored", () => {
    expect(restoredSince("conv-a")).toBeNull();
  });

  it("is null when the server sent no timestamp", async () => {
    stubFetch({ alpha: [{ sessionId: "conv-a", since: null }] });
    vi.mocked(listConversations).mockResolvedValue([conversation("conv-a", wsA)]);

    await restoreDockedTurns([wsA], () => {}, { resume });

    expect(restoredSince("conv-a")).toBeNull();
  });
});
