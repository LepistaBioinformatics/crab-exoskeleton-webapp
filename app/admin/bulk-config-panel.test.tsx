// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// jsdom, because the catalog arrives from an effect and the suite's default
// `environment: "node"` never fires one. What this covers is the pair of decisions the
// panel makes from the catalog it gets back: which suggestions it labels and how, and
// whether the template option exists at all.
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

vi.mock("@/lib/scopeConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scopeConfig")>("@/lib/scopeConfig");
  return {
    ...actual,
    listConfigKeys: async () => catalogs[served],
    // One member holding one value, which is the least that makes the panel show its
    // value field and the "members created later" fieldset under it.
    inspectConfigKey: async () => ({
      key: "tools.web.brave.enabled",
      agent: "alpha",
      total: 1,
      buckets: [
        {
          state: "present" as const,
          value: false,
          instances: [{ userAccId: "u1", email: "person@example.com", revision: "sha256:i" }],
        },
      ],
    }),
  };
});

import BulkConfigPanel from "./bulk-config-panel";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.bulkConfig;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
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

// The "members created later" fieldset only exists once a key has been read, so every
// assertion about the template option has to go through an inspect first.
async function inspect(el: HTMLElement) {
  await type(el.querySelector<HTMLInputElement>("#bc-key")!, "tools.web.brave.enabled");
  const button = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === t.inspect)!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function futureValues(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll<HTMLInputElement>('input[name="bc-future"]')).map(
    (i) => i.value,
  );
}

function optionFor(el: HTMLElement, key: string): HTMLOptionElement {
  return Array.from(el.querySelectorAll("option")).find((o) => o.value === key)!;
}

describe("BulkConfigPanel — the catalog's harness", () => {
  // The bug: a ganglion agent was offered picoclaw's template keys, with nothing on
  // screen saying which document they came from. The key alone cannot say — model_list
  // exists in both.
  it("labels every suggestion with the harness it came from", async () => {
    const el = await mount("ganglion");
    const wanted = t.keyHarness.replace("{h}", "ganglion");
    for (const option of Array.from(el.querySelectorAll("option"))) {
      expect(option.getAttribute("label")).toContain(wanted);
    }
    // The ATTRIBUTE, not the property. An <option> with no label attribute reports its
    // text content from `.label`, and a datalist option has no text — so asserting the
    // property would pass on a label that never reached the dropdown at all.
    //
    // The managed note is still said, and said AS WELL AS the harness rather than
    // instead of it: a managed key is listed rather than hidden precisely so the admin
    // stops hunting for it.
    expect(optionFor(el, "model_list").getAttribute("label")).toContain(t.managedSuffix);
  });

  it("labels a picoclaw catalog as picoclaw", async () => {
    const el = await mount("picoclaw");
    const label = optionFor(el, "model_list").getAttribute("label");
    expect(label).toContain(t.keyHarness.replace("{h}", "picoclaw"));
  });

  // There is no template for the write to land in, so the option is not offered at all.
  // A disabled radio would still advertise an action the proxy could only refuse, and
  // the admin would read a stale-revision error for a write that was never made.
  it("offers no template write when the catalog has no template", async () => {
    const el = await mount("ganglion");
    await inspect(el);
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
    await inspect(el);
    expect(futureValues(el)).toEqual(["none", "subscription", "template"]);
    expect(el.textContent).not.toContain(t.futureTemplateAbsent);
    expect(el.textContent).not.toContain(t.generatedDoc);
  });
});
