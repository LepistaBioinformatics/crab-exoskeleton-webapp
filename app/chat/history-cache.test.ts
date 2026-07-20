import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getHistory, clearHistoryCache } from "./history-cache";
import type { ConversationSummary } from "@/lib/chatSession";

const workspace = { t: "t1", s: "s1", r: "picoclaw" } as never;

function conv(id: string, updatedAt: number): ConversationSummary {
  return {
    id, role: "picoclaw" as never, tenantId: "t1", subsAccId: "s1",
    title: "T", updatedAt, alias: null, tags: [], sessionKey: null, sessionFile: null,
  };
}

describe("getHistory", () => {
  beforeEach(() => clearHistoryCache());
  afterEach(() => vi.restoreAllMocks());

  it("fetches once then serves from cache for the same updatedAt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ role: "user", content: "hello" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getHistory(workspace, conv("a", 100));
    const second = await getHistory(workspace, conv("a", 100));

    expect(first).toEqual([{ role: "user", content: "hello" }]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when updatedAt advances", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, json: async () => ({ messages: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await getHistory(workspace, conv("a", 100));
    await getHistory(workspace, conv("a", 200));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns [] on non-ok without a prior cache entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await getHistory(workspace, conv("z", 1))).toEqual([]);
  });
});
