import { describe, it, expect } from "vitest";
import {
  splitInventory,
  draftFromCatalog,
  draftFromDuplicate,
  inactiveReason,
  modelsApiError,
  serializeDraft,
  emptyDraft,
} from "./models";
import type { InventoryModel } from "./models";

function model(over: Partial<InventoryModel> = {}): InventoryModel {
  return {
    model_name: "m",
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

describe("splitInventory", () => {
  it("separates active from disabled and deprecated", () => {
    const { active, inactive } = splitInventory([
      model({ model_name: "a", status: "active", position: 2 }),
      model({ model_name: "b", status: "disabled", position: 1 }),
      model({ model_name: "c", status: "deprecated", replaced_by: "a", position: 3 }),
    ]);
    expect(active.map((m) => m.model_name)).toEqual(["a"]);
    expect(inactive.map((m) => m.model_name)).toEqual(["b", "c"]);
  });

  it("orders the active group by position", () => {
    const { active } = splitInventory([
      model({ model_name: "second", position: 2 }),
      model({ model_name: "first", position: 1 }),
    ]);
    expect(active.map((m) => m.model_name)).toEqual(["first", "second"]);
  });

  it("returns empty groups for an empty inventory rather than throwing", () => {
    expect(splitInventory([])).toEqual({ active: [], inactive: [] });
  });
});

describe("inactiveReason", () => {
  it("names the replacement for a deprecated model", () => {
    expect(inactiveReason(model({ status: "deprecated", replaced_by: "successor" }))).toBe(
      "deprecated → replaced by successor",
    );
  });

  it("labels a disabled model", () => {
    expect(inactiveReason(model({ status: "disabled" }))).toBe("disabled");
  });

  it("says nothing for an active model", () => {
    expect(inactiveReason(model())).toBe("");
  });
});

describe("draftFromCatalog", () => {
  it("prefills provider, model and api_base and leaves the name and key blank", () => {
    const draft = draftFromCatalog({
      provider: "zhipu",
      model: "glm-4.7",
      api_base: "https://open.bigmodel.cn/api/paas/v4",
    });
    expect(draft.provider).toBe("zhipu");
    expect(draft.model).toBe("glm-4.7");
    expect(draft.api_base).toBe("https://open.bigmodel.cn/api/paas/v4");
    // The catalog deliberately suggests no model_name: it must be unique in the
    // inventory, so a suggested one would invite a duplicate.
    expect(draft.model_name).toBe("");
    expect(draft.api_key).toBe("");
  });

  it("carries auth_method for a catalog entry that has no api_base", () => {
    const draft = draftFromCatalog({ provider: "antigravity", model: "gemini-3-flash", auth_method: "oauth" });
    expect(draft.auth_method).toBe("oauth");
    expect(draft.api_base).toBe("");
  });

  // MiniMax-M2.5 in the embedded catalog carries extra_body: { reasoning_split: true }.
  // Dropping it here means a model registered from the catalog never gets it in the
  // first place, and PUT full-replaces the field on every later edit.
  it("preserves extra_body from the catalog entry", () => {
    const draft = draftFromCatalog({
      provider: "minimax",
      model: "MiniMax-M2.5",
      extra_body: { reasoning_split: true },
    });
    expect(draft.extra_body).toEqual({ reasoning_split: true });
  });
});

describe("draftFromDuplicate", () => {
  it("copies every field except the name and the key", () => {
    const draft = draftFromDuplicate(
      model({
        model_name: "original",
        api_base: "https://x/v1",
        fallbacks: ["fb"],
        auth_method: "oauth",
        extra_body: { reasoning_split: true },
      }),
    );
    expect(draft.provider).toBe("openai");
    expect(draft.api_base).toBe("https://x/v1");
    expect(draft.auth_method).toBe("oauth");
    expect(draft.fallbacks).toEqual(["fb"]);
    // extra_body is a readable field like any other: PUT full-replaces it, so a
    // draft that dropped it here would silently null it out on the next save.
    expect(draft.extra_body).toEqual({ reasoning_split: true });
    // The name must be unique, and the key is never returned by the API — so both
    // are blank and the admin has to supply them.
    expect(draft.model_name).toBe("");
    expect(draft.api_key).toBe("");
  });
});

describe("modelsApiError", () => {
  it("flags a version conflict so the UI can say reload", async () => {
    const res = new Response(JSON.stringify({ error: "stale", version_conflict: true }), { status: 409 });
    const err = await modelsApiError(res);
    expect(err.versionConflict).toBe(true);
  });

  it("surfaces the referrers of an in-use rejection", async () => {
    const res = new Response(
      JSON.stringify({ error: "in use", referrers: [{ kind: "fallback", id: "main" }] }),
      { status: 409 },
    );
    const err = await modelsApiError(res);
    expect(err.versionConflict).toBe(false);
    expect(err.referrers).toEqual([{ kind: "fallback", id: "main" }]);
  });

  it("maps the stack-wide error shapes", async () => {
    const conn = await modelsApiError(new Response(JSON.stringify({ error: "connectivity" }), { status: 502 }));
    expect(conn.message).toBe("Can't reach the gateway right now.");
    const expired = await modelsApiError(
      new Response(JSON.stringify({ error: "session_expired" }), { status: 401 }),
    );
    expect(expired.message).toBe("Your session expired — sign in again.");
  });

  it("falls back to a generic message on an unparseable body", async () => {
    const err = await modelsApiError(new Response("<html>500</html>", { status: 500 }));
    expect(err.message).toBe("Something went wrong.");
    expect(err.referrers).toEqual([]);
  });
});

describe("serializeDraft", () => {
  it("omits api_key when blank, so an untouched key is never cleared", () => {
    const body = serializeDraft({ ...emptyDraft(), model_name: "m", provider: "openai", model: "gpt-5.4" });
    expect("api_key" in body).toBe(false);
  });

  it("sends api_key when the admin supplied one", () => {
    const body = serializeDraft({ ...emptyDraft(), api_key: "sk-secret" });
    expect(body.api_key).toBe("sk-secret");
  });

  it("still sends every other field, blank or not, since PUT is full-replace", () => {
    const body = serializeDraft({
      model_name: "m",
      provider: "openai",
      model: "gpt-5.4",
      api_base: "",
      auth_method: "",
      api_key: "",
      fallbacks: ["fb"],
    });
    expect(body).toEqual({
      model_name: "m",
      provider: "openai",
      model: "gpt-5.4",
      api_base: "",
      auth_method: "",
      fallbacks: ["fb"],
    });
  });

  // extra_body is readable on InventoryModel and full-replaced on PUT (proxy:
  // admin_models.go does `cur.ExtraBody = req.ExtraBody` unconditionally). A draft
  // that loaded one but omitted it here would silently null it out on save — the
  // same failure mode as the api_key check above, against a different field.
  it("includes extra_body when the draft carries one", () => {
    const body = serializeDraft({ ...emptyDraft(), extra_body: { reasoning_split: true } });
    expect(body.extra_body).toEqual({ reasoning_split: true });
  });

  it("omits extra_body entirely when the draft never had one", () => {
    const body = serializeDraft(emptyDraft());
    expect("extra_body" in body).toBe(false);
  });
});
