// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Reported in use: files and scheduled tasks both carry a refresh control in the panel
// header and the knowledge graph does not — and the graph is the pane most likely to be
// stale, because the agent writes to it mid-conversation while the member is looking at
// it. Arriving at the section re-fetches; staying on it never did.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const readGraph = vi.fn();
vi.mock("@/lib/memoryGraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memoryGraph")>();
  return { ...actual, readGraph: (...args: unknown[]) => readGraph(...args) };
});
vi.mock("@/lib/chatSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSession")>();
  return { ...actual, listConversations: async () => [] };
});
const listWorkspaceMedia = vi.fn();
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, listWorkspaceMedia: (...args: unknown[]) => listWorkspaceMedia(...args) };
});

const UploadsSidebar = (await import("./uploads-sidebar")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

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
  readGraph.mockReset();
  listWorkspaceMedia.mockReset();
});

async function mount(section: "graph" | "files") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        section={section}
      />,
    );
  });
  return host;
}

describe("the knowledge graph's refresh control", () => {
  it("re-reads the graph when it is pressed", async () => {
    readGraph.mockResolvedValue({ entities: [], relations: [] });
    listWorkspaceMedia.mockResolvedValue([]);

    const host = await mount("graph");
    expect(readGraph).toHaveBeenCalledTimes(1);

    const button = host.querySelector<HTMLButtonElement>(
      `[aria-label="${t.memoryGraph.refreshAria}"]`,
    );
    expect(button).not.toBeNull();

    await act(async () => button!.click());
    expect(readGraph).toHaveBeenCalledTimes(2);
  });

  it("is not offered on a section that has its own", async () => {
    listWorkspaceMedia.mockResolvedValue([]);
    const host = await mount("files");
    expect(host.querySelector(`[aria-label="${t.memoryGraph.refreshAria}"]`)).toBeNull();
  });
});
