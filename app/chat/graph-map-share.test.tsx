// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { Core } from "cytoscape";

// Picking entities ON THE MAP and sharing them, hops and all.
//
// Driven through the real panel and a REAL Cytoscape instance, run headless. jsdom has no
// canvas, so the module is mocked to drop the container and pass `headless: true` — every
// event, every class and every selector then behaves exactly as it does in a browser, the
// graph simply does not draw. A hand-written fake core would have been a second
// implementation of the library, and the wiring under test here is precisely the part that
// talks to it: which mouse modifier arrived with a tap.
//
// The three claims: a plain click REPLACES the selection and a Ctrl/Cmd click ADDS to it,
// the map and the entity list hold ONE set rather than two that agree, and what the share
// sends is that set expanded by the hop control — in either direction along a relation.

const instances: Core[] = [];
vi.mock("cytoscape", async (importOriginal) => {
  // Typed by hand: the package exports the factory itself (`export = cytoscape`), so the
  // namespace type has no `default` even though the interop object at runtime does.
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default: (opts: Record<string, unknown>) => Core;
  };
  return {
    ...actual,
    default: (opts: Record<string, unknown>) => {
      const cy = actual.default({ ...opts, container: undefined, headless: true });
      instances.push(cy);
      return cy;
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const readGraph = vi.fn();
vi.mock("@/lib/memoryGraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memoryGraph")>();
  return {
    ...actual,
    readGraph: (...args: unknown[]) => readGraph(...args),
    // The detail pane's fetch. Stubbed so a plain click does not fall through to the
    // capabilities stub below and set an error where the test wants a selection.
    openNodes: async (_w: unknown, names: string[]) => ({
      entities: names.map((name) => ({ name, entityType: "thing", observations: [] })),
      relations: [],
    }),
  };
});
vi.mock("@/lib/chatSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSession")>();
  return { ...actual, listConversations: async () => [] };
});

const MemoryGraphPanel = (await import("./memory-graph-panel")).default;
const { takePendingShare } = await import("./mangrove-share-bus");
const { MAX_SHARE_NAMES } = await import("./graph-hops");
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";

const g = chatCopy.en.memoryGraph;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const entity = (name: string) => ({
  name,
  type: "thing",
  observationCount: 1,
  relationCount: 1,
});

// Samuel → Onboarding ← Rust, plus an island nothing touches.
//
// The arrow into Onboarding from BOTH sides is the point: from Samuel, reaching Rust means
// walking one relation forwards and one backwards. A traversal that honoured the stored
// direction would stop at Onboarding and the payload would still look reasonable.
const graph = {
  entities: [entity("Samuel"), entity("Onboarding"), entity("Rust"), entity("Island")],
  relations: [
    { from: "Samuel", to: "Onboarding", relationType: "works_on" },
    { from: "Rust", to: "Onboarding", relationType: "used_by" },
  ],
  totalObservations: 4,
};

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  instances.length = 0;
  takePendingShare();
  readGraph.mockReset();
  vi.unstubAllGlobals();
});

async function mount(data: typeof graph = graph) {
  readGraph.mockResolvedValue(data);
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ governs: false, tenantLicensed: false }), {
        status: 200,
      }),
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<MemoryGraphPanel workspace={workspace} active />);
  });
  // The graph read and the capabilities read resolve on separate microtasks.
  await act(async () => {});
  return host;
}

function byText(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button reading "${label}"`);
  return found as HTMLButtonElement;
}

function tick(host: HTMLElement, name: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(
    `[aria-label="${g.selection.selectEntity.replace("{name}", name)}"]`,
  );
}

function share(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === g.selection.share,
  ) as HTMLButtonElement | undefined;
}

async function openMap(host: HTMLElement) {
  await act(async () => byText(host, g.tabs.map).click());
  await act(async () => {});
}

/** The live map, which is rebuilt on every filter change — so always the newest one. */
function map(): Core {
  const cy = instances[instances.length - 1];
  if (!cy) throw new Error("the map never built a graph");
  return cy;
}

interface TapMods {
  ctrlKey: boolean;
  metaKey: boolean;
}

/** A tap on a node, carrying the modifier keys a real mouse event would. */
async function tap(name: string, mods: Partial<TapMods> = {}) {
  await act(async () => {
    // `emit` is typed for the library's own fully-populated EventObject. A hand-made event
    // carrying only the fields the handler reads is what a test wants, and does not fit it.
    const node = map().getElementById(name) as unknown as {
      emit: (e: { type: string; originalEvent: TapMods }) => void;
    };
    node.emit({
      type: "tap",
      originalEvent: { ctrlKey: false, metaKey: false, ...mods },
    });
  });
  await act(async () => {});
}

const drawnAsChecked = () =>
  map()
    .nodes()
    .filter((n) => n.hasClass("checked"))
    .map((n) => n.id() as string)
    .sort();

describe("the graph panel's tabs, after the Search tab was removed", () => {
  it("offers Entities, Map and Recent, and nothing else", async () => {
    const host = await mount();
    // The tab row is the first control group in the panel; read its buttons in order.
    const row = host.querySelector(".rounded-lg.border")!;
    const labels = [...row.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual([g.tabs.browse, g.tabs.map, g.tabs.recent]);
  });

  // The capability did not go anywhere: the map's filter still reaches the same server-side
  // ranking, which is why `searchGraph` is still imported by the panel.
  it("still offers a contents search, on the map", async () => {
    const host = await mount();
    await openMap(host);
    expect(host.textContent).toContain(g.mapTools.scopeContents);
  });
});

describe("picking entities on the map", () => {
  it("replaces the selection on a plain click", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel");
    expect(host.textContent).toContain(g.selection.one);

    await tap("Onboarding");
    // Still ONE, and it is the second node — a plain click is "this instead", not "this too".
    expect(host.textContent).toContain(g.selection.one);
    expect(drawnAsChecked()).toEqual(["Onboarding"]);
  });

  it("adds to the selection on a Ctrl click", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel");
    await tap("Onboarding", { ctrlKey: true });

    expect(host.textContent).toContain(g.selection.many.replace("{count}", "2"));
    expect(drawnAsChecked()).toEqual(["Onboarding", "Samuel"]);
  });

  // On macOS the platform routes ctrl+click to the context menu, so Cmd is the modifier that
  // reaches this handler at all. Both are honoured and neither is intercepted.
  it("adds to the selection on a Cmd click too", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel");
    await tap("Rust", { metaKey: true });

    expect(host.textContent).toContain(g.selection.many.replace("{count}", "2"));
  });

  it("takes a node back off on a second Ctrl click", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel");
    await tap("Onboarding", { ctrlKey: true });
    await tap("Onboarding", { ctrlKey: true });

    expect(host.textContent).toContain(g.selection.one);
    expect(drawnAsChecked()).toEqual(["Samuel"]);
  });
});

// The requirement the two halves of the feature share: there is ONE selection, not a list's
// and a map's that happen to agree.
describe("the map's selection and the list's are the same set", () => {
  it("draws on the map what was ticked in the list", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());
    await openMap(host);

    expect(drawnAsChecked()).toEqual(["Samuel"]);
  });

  it("shows in the list what was Ctrl-clicked on the map", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());
    await openMap(host);
    await tap("Rust", { ctrlKey: true });

    await act(async () => byText(host, g.tabs.browse).click());
    expect(tick(host, "Samuel")!.getAttribute("aria-checked")).toBe("true");
    expect(tick(host, "Rust")!.getAttribute("aria-checked")).toBe("true");
    expect(tick(host, "Island")!.getAttribute("aria-checked")).toBe("false");
  });
});

describe("sharing a fragment of the map", () => {
  it("sends the picked nodes alone at one hop", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Island");

    expect(host.textContent).toContain(g.selection.sharing.replace("{count}", "1"));
    await act(async () => share(host)!.click());
    expect(takePendingShare()).toEqual({ kind: "entities", names: ["Island"] });
  });

  it("reaches one hop out of what was picked", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Samuel");

    expect(host.textContent).toContain(g.selection.sharing.replace("{count}", "2"));
    await act(async () => share(host)!.click());
    const sent = takePendingShare();
    expect(sent?.kind).toBe("entities");
    expect([...(sent as { names: string[] }).names].sort()).toEqual([
      "Onboarding",
      "Samuel",
    ]);
  });

  // Two hops from Samuel reaches Rust only by walking the second relation AGAINST its stored
  // direction. This is the same rule graph-hops.test.ts pins down, asserted once through the
  // control the member actually turns.
  it("reaches two hops, including a neighbour that points the other way", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Samuel");

    await act(async () =>
      byText(host, g.selection.hopsPlural.replace("{count}", "2")).click(),
    );
    expect(host.textContent).toContain(g.selection.sharing.replace("{count}", "3"));

    await act(async () => share(host)!.click());
    const sent = takePendingShare();
    expect([...(sent as { names: string[] }).names].sort()).toEqual([
      "Onboarding",
      "Rust",
      "Samuel",
    ]);
  });

  it("never reaches an entity nothing connects to the selection", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Samuel");
    await act(async () =>
      byText(host, g.selection.hopsPlural.replace("{count}", "3")).click(),
    );

    await act(async () => share(host)!.click());
    const sent = takePendingShare();
    expect((sent as { names: string[] }).names).not.toContain("Island");
  });

  // The hop control belongs to the MAP's share. On the entity list there is no such control,
  // so a share there has to carry exactly the count the member can see ticked.
  it("leaves a list share unexpanded", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());

    await act(async () => share(host)!.click());
    expect(takePendingShare()).toEqual({ kind: "entities", names: ["Samuel"] });
  });
});

// Three hops on a dense graph is most of the graph, and a member picking one node cannot see
// that coming. The count is on screen before the share, and past the ceiling the control
// refuses rather than trimming — a truncated fragment is a lie about what was shared.
describe("the whole-graph guard", () => {
  const hub = {
    entities: [
      entity("hub"),
      ...Array.from({ length: MAX_SHARE_NAMES + 10 }, (_, i) => entity(`leaf-${i}`)),
    ],
    relations: Array.from({ length: MAX_SHARE_NAMES + 10 }, (_, i) => ({
      from: "hub",
      to: `leaf-${i}`,
      relationType: "has",
    })),
    totalObservations: 1,
  };

  it("says how many would travel, and refuses past the ceiling", async () => {
    const host = await mount(hub);
    await openMap(host);
    await tap("hub");

    const total = hub.entities.length;
    expect(host.textContent).toContain(
      g.selection.sharing.replace("{count}", String(total)),
    );
    expect(share(host)!.disabled).toBe(true);
    // Disabled AND explained, with the remedy named.
    expect(host.textContent).toContain(
      g.selection.shareTooMany
        .replace("{count}", String(total))
        .replace("{max}", String(MAX_SHARE_NAMES)),
    );
  });

  it("nothing is parked on the bus while the share is refused", async () => {
    const host = await mount(hub);
    await openMap(host);
    await tap("hub");

    await act(async () => share(host)!.click());
    expect(takePendingShare()).toBeNull();
  });
});
