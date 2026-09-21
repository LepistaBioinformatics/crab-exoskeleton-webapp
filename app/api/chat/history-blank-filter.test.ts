import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// THE FILTER THAT WAS DROPPING A SHIPPED FEATURE.
//
// This route drops blank turns at the boundary, so a message with nothing in it
// never reaches a consumer that would render it as a tall empty band. The rule
// was written when "blank" meant "no text and no reasoning" — and then the
// harness started writing two entries that are blank by construction and carry
// their whole meaning in `events`:
//
//   - the SILENT TOOL CALL: an iteration that ran tools and narrated nothing.
//     `toRows` has had a branch for it since it was written; the entry never got
//     there, so that branch had never run against a real payload.
//   - the COMPACTION RECORD: the harness saying it shortened the context.
//
// The filter is the only thing between the proxy and every consumer — chat-view
// fetches this route directly, and so does history-cache — so a drop here is
// total and silent.

const fetchMycelium = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ token: "tok" }),
  clearSession: async () => {},
}));

vi.mock("@/lib/mycelium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mycelium")>();
  return {
    ...actual,
    fetchMycelium: (...args: unknown[]) => fetchMycelium(...args),
    isInstance: (v: unknown) => v === "alpha" || v === "beta",
    MyceliumConnectivityError: class extends Error {},
    upstreamError: async () => ({ error: "upstream", status: 500 }),
  };
});

const { GET } = await import("@/app/api/chat/[instance]/history/route");

const QUERY = "session_id=s1&tenant_id=t1&subs_acc_id=a1";

/** Serves `messages` from the proxy and returns what the route passes on. */
async function served(messages: unknown[]): Promise<{ role: string; content: string; kind?: string }[]> {
  fetchMycelium.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({ messages }),
  });
  const res = await GET(new NextRequest(`http://localhost/api/chat/alpha/history?${QUERY}`), {
    params: Promise.resolve({ instance: "alpha" }),
  });
  const body = await res.json();
  return body.messages;
}

beforeEach(() => {
  fetchMycelium.mockReset();
});

describe("the blank-turn filter", () => {
  it("keeps a compaction record, which has no text by construction", async () => {
    const got = await served([
      { role: "user", content: "oi" },
      {
        role: "assistant",
        content: "",
        kind: "compaction",
        events: [{ kind: "compact", count: 12, detail: "[12 earlier messages…]" }],
      },
      { role: "assistant", content: "pronto" },
    ]);
    expect(got).toHaveLength(3);
    expect(got[1].kind).toBe("compaction");
  });

  it("keeps a silent tool call, which it had been dropping", async () => {
    const got = await served([
      { role: "user", content: "oi" },
      {
        role: "assistant",
        content: "",
        kind: "step",
        events: [{ kind: "tool", name: "sh", status: "ok" }],
      },
    ]);
    expect(got).toHaveLength(2);
  });

  // The rule this replaces, still in force: a message with nothing at all is a
  // tall empty gap in the transcript.
  it("still drops a turn with no text, no reasoning and no events", async () => {
    const got = await served([
      { role: "user", content: "oi" },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "pronto" },
    ]);
    expect(got.map((m) => m.content)).toEqual(["oi", "pronto"]);
  });

  it("still keeps a reasoning-only step", async () => {
    const got = await served([
      { role: "assistant", content: "", kind: "step", reasoning: "pensando" },
    ]);
    expect(got).toHaveLength(1);
  });
});
