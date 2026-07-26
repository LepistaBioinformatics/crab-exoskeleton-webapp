import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { FallbackEditor, fallbackCandidates } from "./fallback-editor";
import type { InventoryModel } from "@/lib/models";

function model(name: string, over: Partial<InventoryModel> = {}): InventoryModel {
  return {
    model_name: name,
    provider: "openai",
    model: name,
    api_base: "https://x/v1",
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

describe("fallbackCandidates", () => {
  it("excludes the model itself", () => {
    const all = [model("a"), model("b")];
    expect(fallbackCandidates(all, "a").map((m) => m.model_name)).toEqual(["b"]);
  });

  it("excludes non-active models, which the resolver would skip anyway", () => {
    const all = [model("a"), model("off", { status: "disabled" }), model("old", { status: "deprecated" })];
    expect(fallbackCandidates(all, "a").map((m) => m.model_name)).toEqual([]);
  });
});

describe("FallbackEditor", () => {
  it("lists the current chain in order", () => {
    const html = renderToStaticMarkup(
      <FallbackEditor
        model={model("main", { fallbacks: ["first", "second"] })}
        all={[model("main"), model("first"), model("second")]}
        busy={false}
        onSave={() => {}}
      />,
    );
    const firstAt = html.indexOf("first");
    const secondAt = html.indexOf("second");
    expect(firstAt).toBeGreaterThan(-1);
    expect(secondAt).toBeGreaterThan(firstAt);
  });

  it("states that this list is what becomes model_fallbacks", () => {
    const html = renderToStaticMarkup(
      <FallbackEditor model={model("main")} all={[model("main")]} busy={false} onSave={() => {}} />,
    );
    expect(html).toContain("model_fallbacks");
  });
});
