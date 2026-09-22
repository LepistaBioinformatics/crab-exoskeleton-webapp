// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The knowledge graph's multi-select, driven through the panel that owns it.
//
// The one behaviour that cannot be asserted on the presentational lists alone is what
// happens ACROSS a filter: a member ticks an entity, narrows the list by type, and the
// entity they chose leaves the screen. It stays checked — see use-graph-selection.ts —
// and the count bar is what stops that from being invisible. Both halves are here,
// because keeping the name without saying so is the same bug as dropping it.

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
  readGraph.mockReset();
});

async function mount() {
  readGraph.mockResolvedValue(graph);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<MemoryGraphPanel workspace={workspace} active />);
  });
  return host;
}

function tick(host: HTMLElement, name: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(
    `[aria-label="${g.selection.selectEntity.replace("{name}", name)}"]`,
  );
}

function byText(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button reading "${label}"`);
  return found as HTMLButtonElement;
}

function counts(host: HTMLElement): string {
  return host.textContent ?? "";
}

describe("the knowledge graph's multi-select", () => {
  it("ticks a row without opening its detail pane", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());

    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("true");
    expect(tick(host, "Onboarding")!.getAttribute("aria-checked")).toBe("false");
    // The detail pane is the OTHER selection. A tick must not have opened it.
    expect(host.querySelector(`[aria-label="${g.closeDetail}"]`)).toBeNull();
    expect(counts(host)).toContain(g.selection.one);
  });

  // The same affordance takes it back off. Worth its own assertion because the toggle is
  // one line — "remove it if it was there, add it otherwise" — and a refactor that turned
  // it into a plain add would pass every other case in this file.
  it("takes a row back off the selection on a second tick", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());
    await act(async () => tick(host, "Samuel")!.click());

    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("false");
    expect(counts(host)).not.toContain(g.selection.one);
  });

  it("counts several and clears them in one action", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());
    await act(async () => tick(host, "Onboarding")!.click());
    expect(counts(host)).toContain(g.selection.many.replace("{count}", "2"));

    await act(async () => byText(host, g.selection.clear).click());
    expect(counts(host)).not.toContain(g.selection.many.replace("{count}", "2"));
    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("false");
  });

  // The requirement this file exists for: filtering is not deselecting.
  it("keeps a checked entity the type filter stops showing, and says how many", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());

    await act(async () => byText(host, "tema 1").click());
    // Gone from the list...
    expect(tick(host, "Samuel")).toBeNull();
    // ...but still selected, and the count says one of them is out of sight. Without
    // that line the member would carry a selection they can no longer see.
    expect(counts(host)).toContain(g.selection.one);
    expect(counts(host)).toContain(g.selection.hidden.replace("{count}", "1"));

    await act(async () => byText(host, `${g.allTypes} 2`).click());
    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("true");
    expect(counts(host)).not.toContain(g.selection.hidden.replace("{count}", "1"));
  });

  // A tab switch hides the ticks entirely, so the bar is the only thing left carrying
  // the selection — which is why it lives outside the tab's own scroll area.
  it("survives a switch to another tab", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());

    await act(async () => byText(host, g.tabs.recent).click());
    expect(tick(host, "Samuel")).toBeNull();
    expect(counts(host)).toContain(g.selection.one);

    await act(async () => byText(host, g.tabs.browse).click());
    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("true");
  });
});
