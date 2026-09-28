// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ConversationSummary } from "@/lib/chatSession";
import type { Workspace } from "./fragment";

// Deleting a conversation from the sidebar, now that the sidebar draws only the tree.
//
// The tree asks (conversation-tree.test.tsx pins that); the ANSWER is here — the
// confirmation, the call, and the optimistic drop out of the list. That split is the point:
// the drop has to reach the conversation list and the search results both, and the tree
// holds neither.

const deleted: string[] = [];
vi.mock("@/lib/chatSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSession")>();
  return {
    ...actual,
    onConversationsUpdated: () => () => {},
    deleteConversation: async (id: string) => {
      deleted.push(id);
    },
  };
});
vi.mock("./history-cache", () => ({
  getHistory: async () => [
    { role: "user", content: "olá", created_at: "2026-09-20T10:00:00Z" },
  ],
}));

let list: ConversationSummary[] = [];
vi.mock("./use-conversations", () => ({
  useConversations: () => ({
    conversations: list,
    loaded: true,
    error: null,
    apply: (fn: (l: ConversationSummary[]) => ConversationSummary[]) => {
      list = fn(list);
    },
  }),
}));
vi.mock("./use-conversation-search", () => ({
  useConversationSearch: () => ({
    query: "",
    setQuery: () => {},
    results: null,
    searching: false,
    applyToResults: () => {},
  }),
}));
vi.mock("./fragment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fragment")>();
  return { ...actual, useFragment: () => ({}) };
});

const HistorySidebar = (await import("./history-sidebar")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
const { commonCopy } = await import("@/lib/i18n/common");

const t = chatCopy.en.history;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

function conversation(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    role: "alpha",
    tenantId: "acme",
    subsAccId: "growth",
    title: "Parecer TBDC",
    updatedAt: Date.parse("2026-09-20T10:00:00Z"),
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project: null,
    ...over,
  } as ConversationSummary;
}

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  deleted.length = 0;
  list = [];
});

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<HistorySidebar workspace={workspace} project={null} />);
  });
  await act(async () => {});
  return host;
}

/** A button anywhere on the page — the confirmation is portalled out of the panel. */
function byText(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe("the conversation sidebar", () => {
  it("draws the tree, with no switch to another rendering", async () => {
    list = [conversation()];
    const host = await mount();

    expect(host.querySelector('[role="tree"]')).toBeTruthy();
    // The List|Tree segmented control is gone, not hidden.
    expect(host.querySelector('[aria-label="List view"]')).toBeNull();
    expect(host.querySelector('[aria-label="Tree view"]')).toBeNull();
  });

  it("confirms a delete asked for from a tree row, then makes the call", async () => {
    list = [conversation()];
    const host = await mount();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[aria-label="${t.deleteAria}"]`)!.click();
    });
    // Named, so a member deleting from a row that is one VISIT knows the whole thread goes.
    expect(document.body.textContent).toContain("Parecer TBDC");

    await act(async () => byText(commonCopy.en.actions.delete)!.click());
    expect(deleted).toEqual(["c1"]);
    // And dropped from the list the panel holds, without waiting for a refetch.
    expect(list).toEqual([]);
  });

  it("keeps the conversation when the confirmation is dismissed", async () => {
    list = [conversation()];
    const host = await mount();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[aria-label="${t.deleteAria}"]`)!.click();
    });
    await act(async () => byText(commonCopy.en.actions.cancel)!.click());

    expect(deleted).toEqual([]);
    expect(list.map((c) => c.id)).toEqual(["c1"]);
  });
});
