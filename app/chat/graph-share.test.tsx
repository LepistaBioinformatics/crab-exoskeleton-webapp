// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Sharing what the member ticked in the knowledge graph.
//
// Two rules, and they are the ones every mangrove affordance keeps: the control is ABSENT
// where there is no mangrove rather than present and refusing, and it is absent with an
// empty selection rather than sitting there doing nothing. What travels is the NAMES —
// the mangrove extracts the entities and the relations among them itself, so a name is
// the whole payload, exactly as it is for the composer's entity reference.

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

const MemoryGraphPanel = (await import("./memory-graph-panel")).default;
const { takePendingShare } = await import("./mangrove-share-bus");
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";

const g = chatCopy.en.memoryGraph;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const graph = {
  entities: [
    { name: "Samuel", type: "pessoa", observationCount: 3, relationCount: 1 },
    { name: "Onboarding", type: "tema", observationCount: 2, relationCount: 1 },
  ],
  relations: [],
  totalObservations: 5,
};

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
  takePendingShare();
  readGraph.mockReset();
  vi.unstubAllGlobals();
});

async function mount(mangrove: "on" | "off", ws: Workspace = workspace) {
  readGraph.mockResolvedValue(graph);
  vi.stubGlobal("fetch", async () =>
    mangrove === "on"
      ? new Response(JSON.stringify({ governs: false, tenantLicensed: false }), { status: 200 })
      : new Response(JSON.stringify({ error: "mangrove_off" }), { status: 404 }),
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<MemoryGraphPanel workspace={ws} active />);
  });
  // The graph read and the capabilities read resolve on separate microtasks.
  await act(async () => {});
  return host;
}

function tick(host: HTMLElement, name: string): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>(
    `[aria-label="${g.selection.selectEntity.replace("{name}", name)}"]`,
  )!;
}

function share(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === g.selection.share,
  ) as HTMLButtonElement | undefined;
}

describe("sharing the graph selection in the mangrove", () => {
  it("is absent where the mangrove is switched off", async () => {
    const host = await mount("off");
    await act(async () => tick(host, "Samuel").click());

    // The selection bar itself is there -- it is the SHARE control that is not.
    expect(host.textContent).toContain(g.selection.one);
    expect(share(host)).toBeUndefined();
  });

  it("is absent with nothing ticked, because the bar it lives in is", async () => {
    const host = await mount("on");
    expect(share(host)).toBeUndefined();
  });

  // Each project keeps its own graph, and publishing carries the project so the
  // entity names resolve against that one.
  it("is present inside a project too", async () => {
    const host = await mount("on", { ...workspace, p: "proj-1" });
    await act(async () => tick(host, "Samuel").click());
    expect(share(host)).toBeDefined();
  });

  it("sends every ticked NAME, and only those", async () => {
    const host = await mount("on");
    await act(async () => tick(host, "Samuel").click());
    await act(async () => tick(host, "Onboarding").click());
    await act(async () => tick(host, "Onboarding").click());

    await act(async () => share(host)!.click());

    expect(takePendingShare()).toEqual({ kind: "entities", names: ["Samuel"] });
  });
});
