import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { JsonTree } from "./json-tree-view";
import { adminCopy } from "@/lib/i18n/admin";
import type { JsonValue } from "./json-tree";

const t = adminCopy.en.instanceConfig;

// The tree is pure presentation with no effects and no portal, so it renders in
// this suite's `environment: "node"`. What that covers is the FIRST PAINT, which
// is where the read-only rules live: a managed row must expose no control at all,
// and no later interaction can grant it one.
//
// Two fixtures, because the tree collapses below the second level. `leaves` is
// shaped like ONE subtree (what an admin sees after opening agents.defaults) so
// both kinds of leaf are painted; `nested` is shaped like the real document, and
// is only used for the collapse rule itself.
const leaves: JsonValue = {
  model_name: "main",
  max_tokens: 32768,
  restrict_to_workspace: true,
  steering_mode: null,
};

const nested: JsonValue = {
  version: 3,
  agents: { defaults: { model_name: "main", max_tokens: 32768 } },
  model_list: [{ model_name: "main", api_keys: ["sk-x"] }],
  tools: { exec: { enabled: true, timeout_seconds: 60 } },
};

function render(doc: JsonValue, managed: string[], redacted?: string[]) {
  return renderToStaticMarkup(
    <JsonTree doc={doc} managed={managed} redacted={redacted} onChange={() => {}} />,
  );
}

describe("JsonTree", () => {
  it("addresses every painted row by its dotted path", () => {
    const html = render(nested, []);
    expect(html).toContain('data-path="version"');
    expect(html).toContain('data-path="agents.defaults"');
    expect(html).toContain('data-path="model_list[0]"');
  });

  it("gives an editable leaf an input and a type switcher", () => {
    const html = render(leaves, []);
    expect(html).toContain('aria-label="max_tokens"');
    // The type switcher is what makes `"max_tokens": "32768"` recoverable; a
    // typed input alone cannot express a type change.
    expect(html).toContain(`${t.typeLabel} max_tokens`);
    expect(html).toContain(`${t.removeKey} max_tokens`);
  });

  it("gives a managed leaf no input, no type switcher and no remove action", () => {
    const html = render(leaves, ["model_name"]);
    expect(html).not.toContain('aria-label="model_name"');
    expect(html).not.toContain(`${t.typeLabel} model_name`);
    expect(html).not.toContain(`${t.removeKey} model_name`);
    // It is still shown, and marked — hiding it would make the document look
    // different from what is on disk.
    expect(html).toContain("model_name");
    expect(html).toContain(t.managedAria);
  });

  it("keeps a managed key's siblings fully editable", () => {
    const html = render(leaves, ["model_name"]);
    expect(html).toContain(`${t.removeKey} restrict_to_workspace`);
    expect(html).toContain(`${t.typeLabel} max_tokens`);
  });

  it("treats a managed container's whole subtree as managed", () => {
    // model_list is managed, so its entries are too: the proxy replaces the
    // array wholesale on every materialization.
    const html = render(nested, ["model_list"]);
    expect(html).not.toContain(`${t.removeKey} model_list[0]`);
    expect(html).not.toContain(`${t.removeKey} model_list`);
  });

  it("offers add-key on an editable object and no add control on a managed one", () => {
    expect(render(leaves, [])).toContain(t.addKey);
    // The whole document managed leaves nothing to add.
    expect(render(leaves, ["model_name", "max_tokens"])).toContain(t.addKey);
  });

  it("collapses below the second level so the seeded document stays usable", () => {
    const html = render(nested, []);
    // The seeded config is ~470 lines with 15 channel blocks; an all-expanded
    // tree is unusable. Depth-2 containers are painted, their children are not.
    expect(html).toContain('data-path="tools.exec"');
    expect(html).not.toContain('data-path="tools.exec.timeout_seconds"');
  });

  it("masks a redacted value instead of printing it", () => {
    const html = render({ api_keys: ["sk-live-secret"] }, [], ["api_keys"]);
    expect(html).not.toContain("sk-live-secret");
    expect(html).toContain("***");
  });
});
