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
// The three claims: which of the two acts a click means is the MODE's to say — a plain click
// opens an entity and leaves the selection alone, a click in select mode ticks it — the map and
// the entity list hold ONE set rather than two that agree, and what the share sends is that set
// expanded by the hop control, in either direction along a relation.

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
const { MAP_STAGE_MIN_HEIGHT } = await import("./memory-graph-view");
const DEFAULT_DETAIL_HEIGHT = 320;
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

/** The switch that makes a tap tick a node rather than open it. */
async function selectMode(host: HTMLElement, on = true) {
  await act(async () => byText(host, on ? g.selection.pick : g.selection.pickOff).click());
  await act(async () => {});
}

/**
 * The map, open and ticking — which is what every test below that builds a selection by
 * tapping needs, now that a bare tap opens an entity instead.
 */
async function openMapPicking(host: HTMLElement) {
  await openMap(host);
  await selectMode(host);
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

/** The nodes the hop control pulled in — the arrivals, never the seeds. */
const drawnAsReached = () =>
  map()
    .nodes()
    .filter((n) => n.hasClass("reached"))
    .map((n) => n.id() as string)
    .sort();

/** Everything the map claims is in the fragment, seeds and arrivals together. */
const drawnAsShared = () =>
  map()
    .nodes()
    .filter((n) => n.hasClass("checked") || n.hasClass("reached"))
    .map((n) => n.id() as string)
    .sort();

/** Setting the share's reach through the control the member actually turns. */
async function setHops(host: HTMLElement, hops: number) {
  const label =
    hops === 1
      ? g.selection.hops.replace("{count}", "1")
      : g.selection.hopsPlural.replace("{count}", String(hops));
  await act(async () => byText(host, label).click());
  await act(async () => {});
}

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
  // THE report this feature exists for. A plain click used to replace the whole multi-select
  // with the one node clicked, so reading entities one after another quietly destroyed a
  // selection the member had built — and there was no way to build one without knowing about
  // a modifier key nothing mentioned.
  it("opens an entity on a plain click without touching the selection", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());
    await openMap(host);

    await tap("Onboarding");

    // The detail pane opened...
    expect(host.querySelector(`[aria-label="${g.closeDetail}"]`)).not.toBeNull();
    // ...and the entity the member had ticked is still the selection, alone.
    expect(host.textContent).toContain(g.selection.one);
    expect(drawnAsChecked()).toEqual(["Samuel"]);
  });

  it("ticks instead of opening once select mode is on", async () => {
    const host = await mount();
    await openMapPicking(host);

    await tap("Samuel");
    expect(drawnAsChecked()).toEqual(["Samuel"]);
    // The other selection stayed shut: in this mode a click is a tick and nothing else.
    expect(host.querySelector(`[aria-label="${g.closeDetail}"]`)).toBeNull();

    await tap("Onboarding");
    // TWO, not one replaced by the other — the mode is what makes a bare click accumulate.
    expect(host.textContent).toContain(g.selection.many.replace("{count}", "2"));
    expect(drawnAsChecked()).toEqual(["Onboarding", "Samuel"]);
  });

  it("takes a node back off on a second tap in select mode", async () => {
    const host = await mount();
    await openMapPicking(host);

    await tap("Samuel");
    await tap("Samuel");

    expect(drawnAsChecked()).toEqual([]);
  });

  // Leaving the mode is not the same act as clearing, and the member has a separate button
  // for the second one.
  it("keeps what was ticked when the mode goes off, and stops ticking", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");

    await selectMode(host, false);
    expect(drawnAsChecked()).toEqual(["Samuel"]);

    await tap("Onboarding");
    expect(drawnAsChecked()).toEqual(["Samuel"]);
    expect(host.textContent).toContain(g.selection.one);
  });

  // Two ways to read a click cannot both be on. Asserted through the controls rather than
  // through the handler, because the exclusivity lives at the switches on purpose.
  it("turns path mode off when select mode comes on, and the reverse", async () => {
    const host = await mount();
    await openMap(host);

    // The tools sidebar, then its Path group: both are shut in the narrow column, and the
    // mode switch this test is about lives at the bottom of the second.
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(`[aria-label="${g.mapTools.open}"]`)!
        .click(),
    );
    await act(async () => byText(host, g.mapTools.path).click());
    await act(async () => byText(host, g.mapTools.pathEnable).click());
    await selectMode(host);
    // Path mode surrendered: its own button offers to START tracing again.
    expect(byText(host, g.mapTools.pathEnable)).toBeDefined();

    await act(async () => byText(host, g.mapTools.pathEnable).click());
    // ...and taking path mode back turns the select mode off, so its button offers to start.
    expect(byText(host, g.selection.pick)).toBeDefined();
  });

  it("adds to the selection on a Ctrl click", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel", { ctrlKey: true });
    await tap("Onboarding", { ctrlKey: true });

    expect(host.textContent).toContain(g.selection.many.replace("{count}", "2"));
    expect(drawnAsChecked()).toEqual(["Onboarding", "Samuel"]);
  });

  // On macOS the platform routes ctrl+click to the context menu, so Cmd is the modifier that
  // reaches this handler at all. Both are honoured and neither is intercepted.
  it("adds to the selection on a Cmd click too", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel", { ctrlKey: true });
    await tap("Rust", { metaKey: true });

    expect(host.textContent).toContain(g.selection.many.replace("{count}", "2"));
  });

  it("takes a node back off on a second Ctrl click", async () => {
    const host = await mount();
    await openMap(host);

    await tap("Samuel", { ctrlKey: true });
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
    await openMapPicking(host);
    await tap("Island");

    expect(host.textContent).toContain(g.selection.sharing.replace("{count}", "1"));
    await act(async () => share(host)!.click());
    expect(takePendingShare()).toEqual({ kind: "entities", names: ["Island"] });
  });

  it("reaches one hop out of what was picked", async () => {
    const host = await mount();
    await openMapPicking(host);
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
    await openMapPicking(host);
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
    await openMapPicking(host);
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
    await openMapPicking(host);
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
    await openMapPicking(host);
    await tap("hub");

    await act(async () => share(host)!.click());
    expect(takePendingShare()).toBeNull();
  });
});

// The report this block exists for: raising the hop count changed the "sharing N" readout and
// left the map looking identical, so the member could not see what they were about to publish.
//
// Two claims throughout. The arrivals are DRAWN — and drawn as arrivals, not as seeds, because
// the member chose one and the other came along. And what is drawn is the SAME SET the share
// sends: the one assertion that catches a second expansion drifting from the payload.
describe("the map shows what the share would carry", () => {
  it("marks the hop the selection reached, distinctly from the seed", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");

    expect(drawnAsChecked()).toEqual(["Samuel"]);
    expect(drawnAsReached()).toEqual(["Onboarding"]);
  });

  it("marks more nodes as the hop count goes up", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await setHops(host, 2);

    expect(drawnAsReached()).toEqual(["Onboarding", "Rust"]);
    // Still the seed, and only the seed.
    expect(drawnAsChecked()).toEqual(["Samuel"]);
  });

  it("takes them off again as it comes back down", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await setHops(host, 3);
    expect(drawnAsReached()).toEqual(["Onboarding", "Rust"]);

    await setHops(host, 1);
    expect(drawnAsReached()).toEqual(["Onboarding"]);
  });

  // The half of the fix that the class alone does not deliver. A plain click opens the detail
  // pane, which fades everything outside the FOCUS radius — a separate number from the share's
  // hops, and the default is 1. Without the exemption `Rust` would carry the class at
  // `opacity: 0.1` and the map would still look identical to the member.
  it("keeps what it reached visible rather than faded out", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await setHops(host, 2);

    const rust = map().getElementById("Rust");
    expect(rust.hasClass("reached")).toBe(true);
    expect(rust.hasClass("faded")).toBe(false);
  });

  it("never marks an entity nothing connects to the selection", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await setHops(host, 3);

    expect(drawnAsShared()).not.toContain("Island");
  });

  // THE one that would catch the map computing its own expansion. The count on screen would
  // not: two expansions that disagree can still both say "3".
  it("draws exactly the names the share sends, not its own expansion", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await setHops(host, 2);

    const drawn = drawnAsShared();
    await act(async () => share(host)!.click());
    const sent = takePendingShare() as { names: string[] };
    expect(drawn).toEqual([...sent.names].sort());
  });

  it("marks nothing once the selection is cleared", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");
    await act(async () => byText(host, g.selection.clear).click());
    await act(async () => {});

    expect(drawnAsShared()).toEqual([]);
  });
});

// The third report: too many controls, in too many places, in too many shapes. The map used
// to stack the filter, the scope chips, the select mode and its explanatory sentence as four
// separate bands above the graph, and then scatter three more clusters across three corners of
// the stage. What is pinned here is the consolidation, because it is the kind of thing a later
// change undoes by adding "just one more" row.
describe("where the map's own controls sit", () => {
  const byLabel = (host: HTMLElement, label: string) =>
    host.querySelector<HTMLElement>(`[aria-label="${label}"]`);

  it("puts both mode switches on the scope row, not one row each", async () => {
    const host = await mount();
    await openMap(host);

    const pick = byText(host, g.selection.pick);
    const tools = byLabel(host, g.mapTools.open)!;
    const scope = byText(host, g.mapTools.scopeNames);
    // One row: the two switches share a parent, and that parent sits beside the scope group.
    expect(pick.parentElement).toBe(tools.parentElement);
    expect(pick.parentElement!.parentElement!.contains(scope)).toBe(true);
  });

  it("keeps the tools switch out of the stage, so it survives an empty one", async () => {
    const host = await mount();
    await openMap(host);

    // The stage is where the canvas goes. A control that lives there disappears with it.
    const tools = byLabel(host, g.mapTools.open)!;
    const searchBox = host.querySelector(`[aria-label="${g.mapFilterPlaceholder}"]`)!;
    const position = searchBox.compareDocumentPosition(tools);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools.closest("[class*='absolute']")).toBeNull();
  });

  it("gathers pan, spread and fit into one corner", async () => {
    const host = await mount();
    await openMap(host);

    const fit = byLabel(host, g.fitMap)!;
    const spread = byLabel(host, g.spreadOut)!;
    const expand = byLabel(host, g.expandMap)!;
    const cluster = fit.parentElement!.parentElement!;
    expect(cluster.contains(spread)).toBe(true);
    expect(cluster.contains(expand)).toBe(true);
  });
});

// A layout report, and a pre-existing one: opening an entity on the map made the panel's
// horizontal scrollbar appear and disappear over and over.
//
// The arithmetic behind it: the graph column holds the stage, which will not go below its
// floor, and the detail pane, whose height is a fixed pixel count from a drag. Together they
// were taller than the column, so the overflow spilled into the panel's scroll area; its
// vertical scrollbar took ~15px of width; and the Cytoscape canvas, sized before that
// scrollbar existed, then overhung by exactly that much. The overflow is what was measured;
// the oscillation on top of it is put down to Cytoscape's own ResizeObserver re-matching the
// canvas, which was not reproduced outside a real browser.
//
// jsdom does no layout, so what is asserted here is the CONTRACT that makes the arithmetic
// work: on the map the pane carries a ceiling expressed against the stage's floor, and
// everywhere else it does not, because there its neighbour is a list that can shrink.
describe("how tall the detail pane may grow", () => {
  const pane = (host: HTMLElement) =>
    host.querySelector<HTMLElement>(`[aria-label="${g.resizeDetail}"]`)?.parentElement ??
    null;

  it("may not eat into the graph's floor on the map", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Samuel");

    const style = pane(host)!.style;
    expect(style.height).toBe(`${DEFAULT_DETAIL_HEIGHT}px`);
    // The floor the stage keeps, subtracted from the column — see MAP_STAGE_MIN_HEIGHT.
    expect(style.maxHeight).toContain(`calc(100% - ${MAP_STAGE_MIN_HEIGHT}px)`);
  });

  // The trap the ceiling sets: state still holds 320 while the pane draws at the cap, so a
  // drag that measured from state would spend its first hundred pixels changing a number
  // nobody can see. The handle would read as broken.
  it("drags from the height on screen, not the one in state", async () => {
    const host = await mount();
    await openMap(host);
    await tap("Samuel");

    const handle = host.querySelector<HTMLElement>(`[aria-label="${g.resizeDetail}"]`)!;
    // jsdom lays nothing out, so the rendered height has to be supplied. 209px is what the
    // ceiling leaves on a 600px pane — measured in a browser, see the spec's BUG-1.
    handle.parentElement!.getBoundingClientRect = () =>
      ({ height: 209 }) as DOMRect;

    await act(async () => {
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 500 }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 490 }));
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    // Ten pixels up from what was on screen. From state it would have been 330.
    expect(pane(host)!.style.height).toBe("219px");
  });

  it("is uncapped on the entity list, whose neighbour can shrink", async () => {
    const host = await mount();
    // The list's own row, which is what opens the pane on that tab — not the tick beside it.
    const row = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Samuel") && !b.getAttribute("aria-label"),
    )!;
    await act(async () => row.click());
    await act(async () => {});

    expect(pane(host)!.style.maxHeight).toBe("");
  });
});

// The other report: the share controls appeared ABOVE the map's search box, so the controls
// that act on a selection came before the box used to find one.
describe("where the selection controls sit", () => {
  const searchBox = (host: HTMLElement) =>
    host.querySelector(`[aria-label="${g.mapFilterPlaceholder}"]`);

  it("puts them after the search box on the map", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");

    const position = searchBox(host)!.compareDocumentPosition(share(host)!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders them once, not once per home", async () => {
    const host = await mount();
    await openMapPicking(host);
    await tap("Samuel");

    const shares = [...host.querySelectorAll("button")].filter(
      (b) => b.textContent?.trim() === g.selection.share,
    );
    expect(shares).toHaveLength(1);
  });

  // The bar is the same element on every tab, and the tabs with no search box must not have
  // lost it on the way.
  it("still shows them on the entity list, which has no search box", async () => {
    const host = await mount();
    await act(async () => tick(host, "Samuel")!.click());

    expect(host.textContent).toContain(g.selection.one);
    expect(share(host)).toBeDefined();
    expect(searchBox(host)).toBeNull();
  });
});
