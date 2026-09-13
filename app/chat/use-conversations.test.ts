// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

// ONE object for the whole suite, because that is what `useRouter` is: a stable
// reference across renders. Handing back a fresh `{ push }` each call would make the
// mock, not the hook, decide how often an effect keyed on it re-runs.
const push = vi.fn();
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { notifyConversationsUpdated } from "@/lib/chatSession";
import { useConversations } from "./use-conversations";
import type { Workspace } from "./fragment";

// What is worth asserting here is not that a hook returns what it fetched — that is
// React's, not ours. It is the three decisions this hook makes that the sidebar's own
// effect used to make, and that the shell's breadcrumb is about to inherit: where an
// expired session goes, whether entering a project re-reads the list, and what happens
// to the rows already on screen when a read fails.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

function row(id: string, title: string) {
  return {
    id,
    instance: "alpha",
    tenantId: "acme",
    subsAccId: "growth",
    title,
    updatedAt: "2026-01-01T00:00:00.000Z",
    alias: null,
    tags: [],
    sessionKey: null,
    sessionFile: null,
    project: null,
  };
}

function answer(conversations: ReturnType<typeof row>[]) {
  return { ok: true, status: 200, json: async () => ({ conversations }) };
}

let mounted: { host: HTMLElement; root: Root } | null = null;
let seen: ReturnType<typeof useConversations> | null = null;

function Probe({ ws }: { ws: Workspace | null }) {
  seen = useConversations(ws);
  return null;
}

async function mount(ws: Workspace | null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(createElement(Probe, { ws }));
  });
}

async function rerender(ws: Workspace | null) {
  await act(async () => {
    mounted!.root.render(createElement(Probe, { ws }));
  });
}

beforeEach(() => {
  push.mockReset();
  seen = null;
});

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  vi.unstubAllGlobals();
});

describe("useConversations", () => {
  it("sends a member whose session expired to /signin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );

    await mount(workspace);

    // The point of lifting the fetch: useWorkspaceGroups already redirects on 401 and
    // useProjects only reports a code, so a third hand-rolled fetch in the sidebar was
    // a third answer to the same question. An empty conversation list is what an
    // expired session USED to look like here.
    expect(push).toHaveBeenCalledWith("/signin");
    expect(seen!.conversations).toEqual([]);
  });

  it("re-reads when the member enters a project", async () => {
    const fetchMock = vi.fn(async () => answer([row("c1", "Deploy notes")]));
    vi.stubGlobal("fetch", fetchMock);

    await mount(workspace);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The project is a fragment write, not a route change, so nothing remounts. Without
    // `p` in the key the member would enter a project and keep reading the list they
    // were looking at outside it. useProjects deliberately omits `p`; this hook cannot.
    await rerender({ ...workspace, p: "proj-x" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes on the update event, so a rename anywhere reaches every consumer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer([row("c1", "Deploy notes")]))
      .mockResolvedValueOnce(answer([row("c1", "Release notes")]));
    vi.stubGlobal("fetch", fetchMock);

    await mount(workspace);
    expect(seen!.conversations[0].title).toBe("Deploy notes");

    await act(async () => {
      notifyConversationsUpdated();
    });
    expect(seen!.conversations[0].title).toBe("Release notes");
  });

  it("keeps the rows on screen when a read fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer([row("c1", "Deploy notes")]))
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await mount(workspace);
    await act(async () => {
      notifyConversationsUpdated();
    });

    // A list that blanks itself on one failed poll loses the member's place, and the
    // rows it dropped were the last true answer the server gave.
    expect(seen!.conversations).toHaveLength(1);
    expect(seen!.error).toBe("connectivity");
  });

  it("empties the list when there is no workspace to read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer([row("c1", "Deploy notes")])),
    );

    await mount(workspace);
    expect(seen!.conversations).toHaveLength(1);

    await rerender(null);
    expect(seen!.conversations).toEqual([]);
  });
});
