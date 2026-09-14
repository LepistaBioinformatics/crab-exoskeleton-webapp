// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ConversationSummary } from "@/lib/chatSession";

// The two-stage filter, which was an effect inside HistorySidebar until the landing
// needed the same grammar. What is worth pinning is the STAGING, not the predicates —
// `conversation-filter.test.ts` already owns those.
//
// `getHistory` is mocked because reaching it at all is the thing under test: a query
// with no free text must never touch a transcript, and a slow earlier keystroke must
// never clobber a fresher result.

const reads: string[] = [];

vi.mock("./history-cache", () => ({
  getHistory: async (_workspace: unknown, conversation: { id: string }) => {
    reads.push(conversation.id);
    return [{ role: "user", content: "contrato de locação" }];
  },
}));

import { useConversationSearch } from "./use-conversation-search";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const workspace = { t: "acme", s: "growth", r: "alpha" };

function conversation(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "c1",
    role: "alpha",
    tenantId: "acme",
    subsAccId: "growth",
    title: "Parecer",
    updatedAt: Date.now(),
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project: null,
    ...over,
  } as ConversationSummary;
}

const LIST = [
  conversation({ id: "c1", alias: "contrato" }),
  conversation({ id: "c2", alias: "folha" }),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reads.length = 0;
  vi.useRealTimers();
});

type Api = ReturnType<typeof useConversationSearch>;

function mount(): () => Api {
  let latest: Api;
  function Probe() {
    latest = useConversationSearch(workspace, LIST);
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Probe />);
  });
  return () => latest!;
}

describe("useConversationSearch", () => {
  // Null, not []. "No filter" and "filtered to nothing" render differently, and a hook
  // that conflated them would paint an empty list over a full one.
  it("reports no filter rather than an empty result for an empty query", () => {
    const api = mount();
    expect(api().results).toBeNull();
    act(() => api().setQuery("   "));
    expect(api().results).toBeNull();
  });

  it("narrows on the synchronous predicates without reading a transcript", async () => {
    vi.useFakeTimers();
    const api = mount();
    act(() => api().setQuery("alias:contrato"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(api().results?.map((c) => c.id)).toEqual(["c1"]);
    expect(reads, "a query with no free text must not touch a transcript").toEqual([]);
    expect(api().searching).toBe(false);
  });

  // The content stage runs only over the survivors of the synchronous one, which is the
  // reason the two are staged rather than combined: a `text:` over an unnarrowed list is
  // one transcript read per conversation.
  it("reads transcripts only for what the first stage left", async () => {
    vi.useFakeTimers();
    const api = mount();
    act(() => api().setQuery("alias:contrato text:locação"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(reads).toEqual(["c1"]);
    expect(api().results?.map((c) => c.id)).toEqual(["c1"]);
  });

  // Debounced, so a burst of keystrokes is one pass. Without this every character typed
  // into the box started a fan-out over the whole list.
  it("waits for the typing to settle", async () => {
    vi.useFakeTimers();
    const api = mount();
    act(() => api().setQuery("alias:con"));
    act(() => api().setQuery("alias:contrato"));
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(api().results).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(api().results?.map((c) => c.id)).toEqual(["c1"]);
  });
});
