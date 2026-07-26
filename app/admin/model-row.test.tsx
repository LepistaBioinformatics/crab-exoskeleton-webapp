import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ModelRow } from "./model-row";
import type { InventoryModel } from "@/lib/models";

function model(over: Partial<InventoryModel> = {}): InventoryModel {
  return {
    model_name: "gpt-5.4",
    provider: "openai",
    model: "gpt-5.4",
    api_base: "https://api.openai.com/v1",
    status: "active",
    fallbacks: [],
    position: 1,
    has_key: true,
    in_use_count: 0,
    version: 1,
    created_at: "2026-07-25T12:00:00Z",
    updated_at: "2026-07-25T12:00:00Z",
    ...over,
  };
}

const noop = () => {};
const handlers = { onEdit: noop, onDuplicate: noop, onToggle: noop, onDeprecate: noop, onDelete: noop };

describe("ModelRow", () => {
  it("shows the name, provider, api_base and a key badge", () => {
    const html = renderToStaticMarkup(<ModelRow model={model()} busy={false} {...handlers} />);
    expect(html).toContain("gpt-5.4");
    expect(html).toContain("openai");
    expect(html).toContain("https://api.openai.com/v1");
    expect(html).toContain("key");
  });

  it("shows the declared fallback chain, because the chain decides which keys land in a workspace", () => {
    const html = renderToStaticMarkup(
      <ModelRow model={model({ fallbacks: ["backup", "last-resort"] })} busy={false} {...handlers} />,
    );
    expect(html).toContain("backup");
    expect(html).toContain("last-resort");
  });

  it("disables delete and disable while the model is in use, and says why", () => {
    const html = renderToStaticMarkup(
      <ModelRow model={model({ in_use_count: 3 })} busy={false} {...handlers} />,
    );
    // Two disabled buttons (delete + disable) and a reason the admin can act on.
    expect(html).toContain("disabled");
    expect(html).toContain("in use by 3");
  });

  it("enables delete when nothing uses the model", () => {
    const html = renderToStaticMarkup(<ModelRow model={model({ in_use_count: 0 })} busy={false} {...handlers} />);
    expect(html).not.toContain("in use by");
  });

  it("badges a deprecated model with its replacement", () => {
    const html = renderToStaticMarkup(
      <ModelRow model={model({ status: "deprecated", replaced_by: "gpt-6" })} busy={false} {...handlers} />,
    );
    expect(html).toContain("replaced by gpt-6");
  });

  it("badges an imported orphan so the admin reviews it", () => {
    const html = renderToStaticMarkup(
      <ModelRow model={model({ imported_orphan: true })} busy={false} {...handlers} />,
    );
    expect(html).toContain("imported");
  });

  it("renders as an <li> so the caller's <ul> stays valid markup", () => {
    const html = renderToStaticMarkup(<ModelRow model={model()} busy={false} {...handlers} />);
    expect(html.startsWith("<li")).toBe(true);
  });

  it("shows reorder arrows only when a move handler is supplied", () => {
    const without = renderToStaticMarkup(<ModelRow model={model()} busy={false} {...handlers} />);
    expect(without).not.toContain("Move gpt-5.4 up");

    const withMove = renderToStaticMarkup(
      <ModelRow model={model()} busy={false} {...handlers} onMoveUp={noop} onMoveDown={noop} />,
    );
    expect(withMove).toContain("Move gpt-5.4 up");
    expect(withMove).toContain("Move gpt-5.4 down");
  });

  it("disables the up arrow at the top of the list", () => {
    // onMoveUp absent means "already first" — the arrow renders but cannot fire, so
    // the row does not need to know its own index.
    const html = renderToStaticMarkup(
      <ModelRow model={model()} busy={false} {...handlers} onMoveDown={noop} />,
    );
    expect(html).toContain("Move gpt-5.4 up");
    expect(html).toMatch(/aria-label="Move gpt-5\.4 up"[^>]*disabled/);
  });
});
