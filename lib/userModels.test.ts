import { describe, it, expect } from "vitest";
import {
  applyProvider,
  canTest,
  draftFingerprint,
  draftFromUserModel,
  effectiveSource,
  emptyUserDraft,
  parseExtraBody,
  providerModels,
  registerableProviders,
  saveGate,
  slugFromLabel,
  type ProviderOption,
  type UserModel,
  type UserModelDraft,
  type UserModelsState,
} from "./userModels";

function draft(over: Partial<UserModelDraft> = {}): UserModelDraft {
  return {
    ...emptyUserDraft(),
    label: "Mine",
    provider: "openai",
    model: "gpt-5.4",
    api_base: "https://api.openai.com/v1",
    api_key: "sk-live-1",
    ...over,
  };
}

function model(over: Partial<UserModel> = {}): UserModel {
  return {
    owner_acc_id: "u1",
    slug: "mine",
    label: "Mine",
    provider: "openai",
    model: "gpt-5.4",
    api_base: "https://api.openai.com/v1",
    enabled: true,
    has_key: true,
    version: 1,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

describe("the test gate", () => {
  it("refuses to save a draft nothing has probed", () => {
    expect(saveGate(draft(), null)).toBe("untested");
  });

  it("arms save once a probe covers this exact draft", () => {
    const d = draft();
    expect(saveGate(d, { fingerprint: draftFingerprint(d), ok: true })).toBe("tested-ok");
  });

  it("re-arms when ANY field the probe sends changes", () => {
    const d = draft();
    const tested = { fingerprint: draftFingerprint(d), ok: true };
    // Each of these changes the request, so the old verdict describes something
    // nobody ever sent.
    for (const changed of [
      { provider: "groq" },
      { model: "gpt-5.4-mini" },
      { api_base: "https://api.example.com/v1" },
      // Same LENGTH as the original on purpose: provider keys are usually
      // fixed-length, so "fix the typo in my key" changes no character count.
      { api_key: "sk-live-2" },
      { extra_body: '{"reasoning":{"effort":"high"}}' },
    ]) {
      expect(saveGate(draft(changed), tested)).toBe("untested");
    }
  });

  it("does not re-arm for a rename — the label is not sent", () => {
    const d = draft();
    const tested = { fingerprint: draftFingerprint(d), ok: true };
    expect(saveGate(draft({ label: "Renamed" }), tested)).toBe("tested-ok");
  });

  it("lets a failed probe through as a deliberate second click, not as untested", () => {
    const d = draft();
    expect(saveGate(d, { fingerprint: draftFingerprint(d), ok: false })).toBe("tested-failed");
  });

  it("catches a same-length key swap, which a length-based fingerprint would not", () => {
    const d = draft({ api_key: "sk-live-1" });
    const tested = { fingerprint: draftFingerprint(d), ok: true };
    expect(saveGate(draft({ api_key: "sk-live-9" }), tested)).toBe("untested");
  });

  it("ignores a trailing slash on the endpoint, which changes no request", () => {
    expect(draftFingerprint(draft({ api_base: "https://api.openai.com/v1/" }))).toBe(
      draftFingerprint(draft({ api_base: "https://api.openai.com/v1" })),
    );
  });
});

describe("canTest", () => {
  it("needs a key for a new model but not for an edit", () => {
    const bare = draft({ api_key: "" });
    expect(canTest(bare, false)).toBe(false);
    // Editing may reuse the stored key, which the member cannot read back.
    expect(canTest(bare, true)).toBe(true);
  });

  it("stays off until the endpoint fields are filled", () => {
    expect(canTest(draft({ api_base: "" }), true)).toBe(false);
    expect(canTest(draft({ provider: "" }), true)).toBe(false);
    expect(canTest(draft({ model: "" }), true)).toBe(false);
  });
});

describe("effectiveSource", () => {
  const base: UserModelsState = {
    models: [model()],
    selected: "",
    allowed: true,
    blockedBy: "",
    organisationModel: "org-gpt",
    customEndpointAllowed: false,
    providers: [{ provider: "openai", api_base: "https://api.openai.com/v1" }],
  };

  it("reports the organisation's model when nothing is selected", () => {
    expect(effectiveSource(base)).toEqual({ kind: "organisation", model: "org-gpt" });
  });

  it("reports the member's own when it is selected and usable", () => {
    const s = effectiveSource({ ...base, selected: "mine" });
    expect(s.kind).toBe("own");
  });

  // The state the whole design exists to make visible: a selection that is
  // stored but not in effect. Reporting it as "own" would show a switch that
  // silently does nothing.
  it("distinguishes a selection blocked by a scope lock", () => {
    const s = effectiveSource({ ...base, selected: "mine", allowed: false, blockedBy: "tenant" });
    expect(s).toMatchObject({ kind: "own-blocked", blockedBy: "tenant", organisation: "org-gpt" });
  });

  it("distinguishes a selection whose model an administrator disabled", () => {
    const s = effectiveSource({
      ...base,
      models: [model({ enabled: false })],
      selected: "mine",
    });
    expect(s).toMatchObject({ kind: "own-blocked", blockedBy: "disabled" });
  });

  it("treats a selection naming a model that is gone as blocked, not as own", () => {
    const s = effectiveSource({ ...base, models: [], selected: "vanished" });
    expect(s.kind).toBe("own-blocked");
  });
});

describe("applyProvider", () => {
  const providers: ProviderOption[] = [
    { provider: "openai", api_base: "https://api.openai.com/v1", models: ["gpt-5.4"] },
    { provider: "nvidia", api_base: "https://integrate.api.nvidia.com/v1", models: ["nemotron"] },
    { provider: "litellm" },
  ];

  it("carries the provider's endpoint into an empty field", () => {
    const d = applyProvider(draft({ provider: "", api_base: "" }), providers, "nvidia");
    // The whole point: a member cannot be expected to know this address, and a
    // base missing its version path 404s against a real host.
    expect(d.api_base).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("replaces the previous provider's suggestion when switching", () => {
    const d = applyProvider(draft({ provider: "openai", api_base: "https://api.openai.com/v1" }), providers, "nvidia");
    expect(d.api_base).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("never overwrites an address the member typed themselves", () => {
    // A self-hosted gateway or a corporate proxy. Replacing it on a provider
    // change would be the same class of bug as a stale test verdict.
    const own = "https://llm.internal.example.com/v1";
    const d = applyProvider(draft({ provider: "openai", api_base: own }), providers, "nvidia");
    expect(d.api_base).toBe(own);
  });

  it("leaves the field alone for a provider the catalog does not know", () => {
    const d = applyProvider(draft({ provider: "", api_base: "" }), providers, "litellm");
    expect(d.api_base).toBe("");
  });

  it("re-arms the test gate, because the endpoint changed", () => {
    const before = draft({ provider: "openai", api_base: "https://api.openai.com/v1" });
    const tested = { fingerprint: draftFingerprint(before), ok: true };
    expect(saveGate(applyProvider(before, providers, "nvidia"), tested)).toBe("untested");
  });
});

describe("providerModels", () => {
  it("offers the catalog's models, and nothing for an unknown provider", () => {
    const providers: ProviderOption[] = [{ provider: "nvidia", models: ["nemotron"] }];
    expect(providerModels(providers, "nvidia")).toEqual(["nemotron"]);
    expect(providerModels(providers, "groq")).toEqual([]);
  });
});

describe("registerableProviders", () => {
  const providers: ProviderOption[] = [
    { provider: "openai", api_base: "https://api.openai.com/v1" },
    // No endpoint in the catalog: usable only by someone allowed to type one.
    { provider: "litellm" },
  ];

  it("hides a provider it cannot fill an endpoint for, when typing one is refused", () => {
    // Offering it would be a choice that can only end in a refusal on submit.
    expect(registerableProviders(providers, false).map((p) => p.provider)).toEqual(["openai"]);
  });

  it("offers everything once an administrator allows custom endpoints", () => {
    expect(registerableProviders(providers, true)).toHaveLength(2);
  });
});

describe("parseExtraBody", () => {
  it("accepts an empty field", () => {
    expect(parseExtraBody("  ")).toEqual({});
  });

  it("accepts an object", () => {
    expect(parseExtraBody('{"a":1}')).toEqual({ value: { a: 1 } });
  });

  it("rejects what would not merge into a request body", () => {
    expect(parseExtraBody("[1,2]").error).toBe("extra_body_not_object");
    expect(parseExtraBody("null").error).toBe("extra_body_not_object");
    expect(parseExtraBody("{oops").error).toBe("extra_body_invalid");
  });
});

describe("slugFromLabel", () => {
  it("produces the charset the store key allows", () => {
    expect(slugFromLabel("Minha chave da OpenAI")).toBe("minha-chave-da-openai");
    expect(slugFromLabel("Açaí — GPT/5.4")).toBe("acai-gpt-5-4");
  });

  it("never ends in a separator, whatever the label ends in", () => {
    expect(slugFromLabel("trailing !!!")).toBe("trailing");
    expect(slugFromLabel("x".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe("draftFromUserModel", () => {
  it("never carries a key back into the form", () => {
    expect(draftFromUserModel(model()).api_key).toBe("");
  });

  it("round-trips extra_body as editable JSON", () => {
    const d = draftFromUserModel(model({ extra_body: { reasoning: { effort: "high" } } }));
    expect(parseExtraBody(d.extra_body)).toEqual({ value: { reasoning: { effort: "high" } } });
  });
});
