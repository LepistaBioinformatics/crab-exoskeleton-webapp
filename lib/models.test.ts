import { describe, it, expect } from "vitest";
import {
  splitInventory,
  assignmentIndex,
  assignmentKey,
  pinnedModel,
  defaultOptions,
  reorderPayload,
  draftFromCatalog,
  draftFromDuplicate,
  inactiveReason,
  modelsApiError,
  describeError,
  serializeDraft,
  emptyDraft,
} from "./models";
import type { InventoryModel, ModelAssignment } from "./models";

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

describe("reorderPayload", () => {
  const active = [
    model({ model_name: "first", position: 1 }),
    model({ model_name: "second", position: 2 }),
    model({ model_name: "third", position: 3 }),
  ];
  const inactive = [
    model({ model_name: "retired", status: "disabled", position: 4 }),
    model({ model_name: "gone", status: "deprecated", replaced_by: "first", position: 5 }),
  ];

  it("moves one active entry and appends the active group's new order", () => {
    const order = reorderPayload(active, inactive, 0, 1);
    expect(order?.slice(0, 3)).toEqual(["second", "first", "third"]);
  });

  it("returns null for a move above the top or below the bottom", () => {
    expect(reorderPayload(active, inactive, 0, -1)).toBeNull();
    expect(reorderPayload(active, inactive, active.length - 1, 1)).toBeNull();
  });

  // The invariant the constraints file names explicitly: the server renumbers
  // 1..N over exactly what it receives, so an active-only payload would leave
  // inactive models holding stale positions that collide with active ones, and
  // a reactivated model would not land back in its place. This test fails if
  // `...inactive` is ever dropped from the implementation.
  it("contains every model from both groups, not just the active one being reordered", () => {
    const order = reorderPayload(active, inactive, 0, 1);
    expect(order).not.toBeNull();
    expect(new Set(order)).toEqual(new Set(["first", "second", "third", "retired", "gone"]));
    expect(order).toHaveLength(active.length + inactive.length);
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

describe("describeError", () => {
  it("carries the message and referrers off a thrown ModelsError", () => {
    // Mirrors what request() actually throws: Object.assign(new Error(...), modelsApiError(res)).
    const err = Object.assign(new Error("in use"), {
      versionConflict: false,
      referrers: [{ kind: "fallback", id: "main" }],
    });
    const d = describeError(err);
    expect(d.message).toBe("in use");
    expect(d.referrers).toEqual([{ kind: "fallback", id: "main" }]);
  });

  it("carries the reload wording for a version conflict, with no referrers", () => {
    const err = Object.assign(new Error("Another admin changed this model — reload before saving."), {
      versionConflict: true,
      referrers: [],
    });
    const d = describeError(err);
    expect(d.message).toBe("Another admin changed this model — reload before saving.");
    expect(d.referrers).toEqual([]);
  });

  it("falls back to a generic message and no referrers for a non-Error throw", () => {
    const d = describeError("boom");
    expect(d.message).toBe("Something went wrong.");
    expect(d.referrers).toEqual([]);
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

describe("pinnedModel", () => {
  const explicit: ModelAssignment = {
    agent: "alpha",
    user_acc_id: "u1",
    model_name: "pinned",
    source: "explicit",
  };

  it("reports the model an admin explicitly pinned", () => {
    expect(pinnedModel(explicit)).toBe("pinned");
  });

  // An inherited record is NOT a pin: it only says what was materialized, and the
  // next scope-default change moves it. Rendering it as a pin would tell an admin
  // that a user is protected from a scope change when they are not.
  it("reports no pin for an inherited record", () => {
    expect(pinnedModel({ ...explicit, source: "inherited" })).toBeNull();
  });

  it("reports no pin when the workspace has no record at all", () => {
    expect(pinnedModel(undefined)).toBeNull();
  });
});

describe("assignmentIndex", () => {
  // A user with a workspace under two agents has one record per agent, and
  // listSubscriptionUsers reports them the same way — so the key must carry the
  // agent or one agent's pin would render on the other agent's row.
  it("keys by agent and user so one user under two agents does not collide", () => {
    const idx = assignmentIndex([
      { agent: "alpha", user_acc_id: "u1", model_name: "a", source: "explicit" },
      { agent: "beta", user_acc_id: "u1", model_name: "b", source: "inherited" },
    ]);
    expect(idx[assignmentKey("alpha", "u1")].model_name).toBe("a");
    expect(idx[assignmentKey("beta", "u1")].model_name).toBe("b");
  });
});

describe("defaultOptions", () => {
  const models = [
    model({ model_name: "live", status: "active" }),
    model({ model_name: "retired", status: "deprecated", replaced_by: "live" }),
  ];

  it("offers the active models", () => {
    expect(defaultOptions(models, null)).toEqual([{ name: "live", inactive: false }]);
  });

  // Filtering the options to active models made a deprecated CURRENT default match
  // no option, so the select fell back to its placeholder and read "no default set"
  // while one was set — the admin could not even see what to replace.
  it("includes a current default that is no longer active, flagged", () => {
    expect(defaultOptions(models, "retired")).toEqual([
      { name: "retired", inactive: true },
      { name: "live", inactive: false },
    ]);
  });

  it("does not duplicate a current default that is still active", () => {
    expect(defaultOptions(models, "live")).toEqual([{ name: "live", inactive: false }]);
  });
});
