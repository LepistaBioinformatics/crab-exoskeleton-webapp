// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// jsdom, because the catalog arrives from an effect and the suite's default
// `environment: "node"` never fires one. What this covers is what the panel makes of the
// catalog it gets back: the list it draws from it, the key it still lets an admin reach
// when the catalog does not carry it, and whether the template option exists at all.
const catalogs = {
  // A picoclaw agent: the template file IS the source, and writing it is the
  // established way to reach members created later.
  picoclaw: {
    template: "alpha-tpl",
    templateRevision: "sha256:abc",
    templateWritable: true,
    keys: [
      { key: "model_list", value: [], managed: true, harness: "picoclaw" },
      { key: "tools.web.brave.enabled", value: false, managed: false, harness: "picoclaw" },
    ],
  },
  // A ganglion agent: the document is generated per member, so there is no template
  // name, no revision to gate a write on, and no write to offer. The keys carry no
  // value either — nothing is on disk to read a default from.
  ganglion: {
    template: "",
    templateRevision: "",
    templateWritable: false,
    keys: [
      { key: "model_list", managed: true, harness: "ganglion" },
      { key: "tools.web.brave.enabled", managed: false, harness: "ganglion" },
    ],
  },
};

let served: keyof typeof catalogs = "picoclaw";

// A SPY, not a plain stub: selecting a key now reads it, so how many times the proxy is
// asked is part of the behaviour rather than an implementation detail. The cache is only
// a cache if a second visit to the same key asks nobody.
// Set by the one test that needs a read to still be IN FLIGHT while the selection moves.
// Everything else leaves it null and the mock resolves immediately.
let held: { promise: Promise<void>; release: () => void } | null = null;

const inspected = vi.fn(async (_scope: unknown, _agent: string, key: string) => {
  if (held) await held.promise;
  return {
  key,
  agent: "alpha",
  total: 1,
  // One member holding one value, which is the least that makes the panel show its
  // value field and the "members created later" fieldset under it.
  buckets: [
    {
      state: "present" as const,
      value: false,
      instances: [{ userAccId: "u1", email: "person@example.com", revision: "sha256:i" }],
    },
  ],
  };
});

vi.mock("@/lib/scopeConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scopeConfig")>("@/lib/scopeConfig");
  return {
    ...actual,
    listConfigKeys: async () => catalogs[served],
    inspectConfigKey: (...args: [unknown, string, string]) => inspected(...args),
  };
});

import BulkConfigPanel from "./bulk-config-panel";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.bulkConfig;

// A key neither catalog carries, and not a hypothetical one: the ganglion reads it and
// the document it generates does not emit it.
const TYPED = "agents.defaults.max_tool_iterations";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  inspected.mockClear();
  held = null;
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(which: keyof typeof catalogs) {
  served = which;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BulkConfigPanel scope={{ kind: "subscription", tenantId: "t1", subsAccId: "s1" }} agent="alpha" />,
    );
  });
  return host!;
}

// A controlled input ignores a plain assignment: React's own value setter has to be
// bypassed for the change event to carry the new value.
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// A key is chosen by CLICKING ITS ROW, and selecting it reads it — there is no second
// button between the two any more. Everything about the value and the future target is
// downstream of that click.
async function pick(el: HTMLElement, key: string) {
  const row = rowFor(el, key);
  await act(async () => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function futureValues(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll<HTMLInputElement>('input[name="bc-future"]')).map(
    (i) => i.value,
  );
}

function rowTexts(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll("ul li button")).map((b) =>
    b.querySelector("span")!.textContent!.trim(),
  );
}

function rowFor(el: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(el.querySelectorAll<HTMLButtonElement>("ul li button")).find(
    (b) => b.querySelector("span")!.textContent!.trim() === text,
  )!;
}

describe("BulkConfigPanel — the key list", () => {
  // The whole catalog is on screen without typing. The datalist this replaced only
  // opened once the admin typed, so a key nobody remembered the name of could not be
  // found at all.
  it("lists every key the catalog carries", async () => {
    const el = await mount("picoclaw");
    expect(rowTexts(el)).toEqual(["model_list", "tools.web.brave.enabled"]);
  });

  // The bug the harness label was written for: a ganglion agent was offered picoclaw's
  // keys with nothing on screen saying which document they came from. The key alone
  // cannot say — model_list exists in both. Said once, over the list, because the proxy
  // resolves one harness per catalog.
  it("names the harness whose document the list came from", async () => {
    const el = await mount("ganglion");
    expect(el.textContent).toContain(t.catalogHarness.replace("{h}", "ganglion"));
    expect(el.textContent).not.toContain(t.catalogHarness.replace("{h}", "picoclaw"));
  });

  it("marks the keys the proxy owns", async () => {
    const el = await mount("picoclaw");
    expect(rowFor(el, "model_list").textContent).toContain(t.managedSuffix);
    expect(rowFor(el, "tools.web.brave.enabled").textContent).not.toContain(t.managedSuffix);
  });

  it("narrows the list to what the filter matches", async () => {
    const el = await mount("picoclaw");
    await type(el.querySelector<HTMLInputElement>("#bc-key")!, "brave");
    expect(rowTexts(el)).toContain("tools.web.brave.enabled");
    expect(rowTexts(el)).not.toContain("model_list");
  });

  // The contract the proxy states in admin_bulk_config.go: the catalog is a SUGGESTION
  // LIST, not a whitelist. A list with no way to name a key the document omits would
  // silently repeal it — and agents.defaults.max_tool_iterations is the live case, read
  // by the ganglion and absent from the document it generates.
  it("offers a key the catalog does not carry, as the last row", async () => {
    const el = await mount("ganglion");
    await type(el.querySelector<HTMLInputElement>("#bc-key")!, TYPED);
    expect(rowTexts(el)).toEqual([t.keyUseTyped.replace("{k}", TYPED)]);
    expect(el.textContent).toContain(t.keyNoMatch.replace("{q}", TYPED));
  });

  // And it is reachable, not merely visible.
  it("reads a typed key when its row is picked", async () => {
    const el = await mount("ganglion");
    await type(el.querySelector<HTMLInputElement>("#bc-key")!, TYPED);
    await pick(el, t.keyUseTyped.replace("{k}", TYPED));
    expect(el.textContent).toContain(t.distribution);
  });

  // Selecting reads: the detail is there on the click, with no button between the two.
  it("reads the key as soon as its row is picked", async () => {
    const el = await mount("picoclaw");
    expect(el.textContent).not.toContain(t.distribution);
    await pick(el, "tools.web.brave.enabled");
    expect(el.textContent).toContain(t.distribution);
    expect(el.textContent).toContain(t.valueLabel);
  });

  // A managed row is selectable rather than inert — isManagedKey exists so the screen
  // can say WHY, and a row that swallows the click says nothing at all. What it must
  // not do is read the key or offer a value to write.
  it("explains a managed key instead of reading it", async () => {
    const el = await mount("picoclaw");
    await pick(el, "model_list");
    expect(el.textContent).toContain(t.managedPicked);
    expect(el.textContent).not.toContain(t.distribution);
    expect(el.textContent).not.toContain(t.valueLabel);
  });
});

describe("BulkConfigPanel — the catalog's harness", () => {
  // There is no template for the write to land in, so the option is not offered at all.
  // A disabled radio would still advertise an action the proxy could only refuse, and
  // the admin would read a stale-revision error for a write that was never made.
  it("offers no template write when the catalog has no template", async () => {
    const el = await mount("ganglion");
    await pick(el, "tools.web.brave.enabled");
    expect(futureValues(el)).toEqual(["none", "subscription"]);
    expect(el.textContent).toContain(t.futureTemplateAbsent);
  });

  // And the disclosure that goes with it: these keys belong to a document the proxy
  // regenerates, which is not something the per-row managed flag says.
  it("says the configuration is generated rather than seeded", async () => {
    const el = await mount("ganglion");
    expect(el.textContent).toContain(t.generatedDoc);
  });

  // The half a back-compat mistake would break first. An older proxy omits
  // templateWritable entirely, and every agent it knows about has a template.
  it("keeps the template write for a picoclaw agent", async () => {
    const el = await mount("picoclaw");
    await pick(el, "tools.web.brave.enabled");
    expect(futureValues(el)).toEqual(["none", "subscription", "template"]);
    expect(el.textContent).not.toContain(t.futureTemplateAbsent);
    expect(el.textContent).not.toContain(t.generatedDoc);
  });
});

describe("BulkConfigPanel — one read per key", () => {
  // The cost of reading on selection, paid once. Browsing back to a key already seen is
  // what would otherwise turn a list of sixteen into sixteen more round trips.
  it("does not read a key twice", async () => {
    const el = await mount("picoclaw");
    await pick(el, "tools.web.brave.enabled");
    expect(inspected).toHaveBeenCalledTimes(1);
    await pick(el, "model_list");
    await pick(el, "tools.web.brave.enabled");
    expect(inspected).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain(t.distribution);
  });

  // The managed key on the way through: it is selectable, and selecting it asks nobody.
  it("reads nothing for a managed key", async () => {
    const el = await mount("picoclaw");
    await pick(el, "model_list");
    expect(inspected).not.toHaveBeenCalled();
  });

  // The explicit re-read exists for exactly the two cases the cache cannot serve — the
  // inspection is spent, or the admin believes it is stale — so it must go to the proxy
  // even when an entry is sitting there.
  it("asks again when the admin asks again", async () => {
    const el = await mount("picoclaw");
    await pick(el, "tools.web.brave.enabled");
    const button = Array.from(el.querySelectorAll("button")).find(
      (b) => b.textContent === t.reinspect,
    )!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(inspected).toHaveBeenCalledTimes(2);
  });

  // The mistake this screen must not make: a value typed against one key sitting in the
  // form under another.
  it("drops the typed value when the selection moves", async () => {
    const el = await mount("picoclaw");
    await pick(el, "tools.web.brave.enabled");
    const value = el.querySelector<HTMLTextAreaElement>("#bc-value")!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(value, "true");
      value.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(el.querySelector<HTMLTextAreaElement>("#bc-value")!.value).toBe("true");

    // To another key that also has a form, so an empty field is the value being
    // dropped rather than the form being gone.
    await type(el.querySelector<HTMLInputElement>("#bc-key")!, TYPED);
    await pick(el, t.keyUseTyped.replace("{k}", TYPED));
    expect(el.querySelector<HTMLTextAreaElement>("#bc-value")!.value).toBe("");
  });

  // Leaving a key while its read is still IN FLIGHT used to strand the panel.
  //
  // The abandoned run is cancelled, so it skips its own cleanup — correct, since its
  // answer must not land on a key that is no longer selected. The run that replaced it
  // is served from the cache and issues no request, so nothing cleared the flag either.
  // The header then said "Reading…" forever, over a key whose values were right there,
  // and the re-read button that could have fixed it is disabled by that same flag.
  //
  // Every step is load-bearing: the second read has to be genuinely pending (resolved,
  // its own cleanup clears the flag) and the third pick has to hit the cache (a miss
  // issues a request, which clears it on the way through).
  it("stops reading when the selection moves off a key mid-read", async () => {
    const el = await mount("picoclaw");
    const filter = el.querySelector<HTMLInputElement>("#bc-key")!;

    await pick(el, "tools.web.brave.enabled");

    let release!: () => void;
    held = { promise: new Promise<void>((r) => (release = r)), release: () => release() };
    await type(filter, TYPED);
    await pick(el, t.keyUseTyped.replace("{k}", TYPED));
    expect(el.textContent).toContain(t.inspecting);

    await type(filter, "");
    await pick(el, "tools.web.brave.enabled");

    const inFlight = held;
    held = null;
    await act(async () => inFlight.release());

    expect(el.textContent).not.toContain(t.inspecting);
    expect(el.textContent).toContain(t.distribution);
  });
});
