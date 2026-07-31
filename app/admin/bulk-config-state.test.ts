import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  isManagedKey,
  prettyJson,
  displayBuckets,
  groupOutcomes,
  inspectionKey,
  parseValueInput,
  previewCounts,
  revisionsFor,
} from "./bulk-config-state";
import { CONFIG_OUTCOMES } from "@/lib/scopeConfig";
import type {
  ConfigKeyBucket,
  ConfigKeyInstance,
  InstanceOutcome,
  Outcome,
  ScopeConfigInspection,
  ScopeConfigResult,
} from "@/lib/scopeConfig";
import type { ScopeRef } from "@/lib/admin";

const scope: ScopeRef = { kind: "subscription", tenantId: "t-1", subsAccId: "s-1" };

function inst(id: string): ConfigKeyInstance {
  return { userAccId: id, revision: `sha256:${id}` };
}

// The proxy's histogram: instances holding the same value collapse into ONE
// bucket, so a bucket's count is not 1. The order below is deliberately not
// sorted by state, by count, or by value -- displayBuckets must preserve it, and
// a fixture already in sorted order would let a stray .sort() pass.
//
// Against newValue { a: 1, b: 2 }: 2 differing value buckets (4 instances), 1
// matching value bucket with its keys REORDERED (1 instance), 1 absent bucket
// (2 instances), 1 unreadable (1), 1 path_conflict (1). total = 9.
const MIXED: ScopeConfigInspection = {
  key: "agents.defaults.max_tokens",
  agent: "alpha",
  total: 9,
  buckets: [
    { state: "unreadable", count: 1, instances: [inst("u-unreadable")] },
    { state: "value", value: "z", count: 3, instances: [inst("u-1"), inst("u-2"), inst("u-3")] },
    { state: "absent", count: 2, instances: [inst("u-absent-1"), inst("u-absent-2")] },
    { state: "value", value: { b: 2, a: 1 }, count: 1, instances: [inst("u-match")] },
    { state: "path_conflict", count: 1, instances: [inst("u-conflict")] },
    { state: "value", value: 7, count: 1, instances: [inst("u-5")] },
  ],
};

const NEW_VALUE = { a: 1, b: 2 };

const EMPTY: ScopeConfigInspection = { key: "k", agent: "alpha", total: 0, buckets: [] };

function outcome(userAccId: string, kind: Outcome): InstanceOutcome {
  return { userAccId, outcome: kind };
}

function result(outcomes: InstanceOutcome[]): ScopeConfigResult {
  return { key: "agents.defaults.max_tokens", outcomes, summary: {} };
}

describe("parseValueInput", () => {
  // Every accepted form is JSON.parse's, verbatim. The admin is typing a config
  // VALUE, and `true` has to mean the boolean -- so the text is parsed as JSON
  // rather than sniffed.
  it("accepts every JSON scalar, array and object form", () => {
    expect(parseValueInput("true")).toEqual({ ok: true, value: true });
    expect(parseValueInput("false")).toEqual({ ok: true, value: false });
    expect(parseValueInput("42")).toEqual({ ok: true, value: 42 });
    expect(parseValueInput("-1.5")).toEqual({ ok: true, value: -1.5 });
    expect(parseValueInput('"text"')).toEqual({ ok: true, value: "text" });
    expect(parseValueInput("[1,2]")).toEqual({ ok: true, value: [1, 2] });
    expect(parseValueInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("accepts a value padded with whitespace", () => {
    expect(parseValueInput("  true  ")).toEqual({ ok: true, value: true });
  });

  it("parses null as the VALUE null, which is not an error and not absent", () => {
    // A JSON null is a legal config value the proxy buckets under state "value".
    // Rejecting it, or folding it into "no value", would make "set this key to
    // null" impossible to express.
    expect(parseValueInput("null")).toEqual({ ok: true, value: null });
  });

  it("rejects empty and whitespace-only input -- a value is required", () => {
    expect(parseValueInput("")).toEqual({ ok: false, error: "required" });
    expect(parseValueInput("   \n\t ")).toEqual({ ok: false, error: "required" });
  });

  it("rejects a bare word rather than reading it as a string", () => {
    // The one that matters: an admin typing `true` means the boolean, so an admin
    // typing `hello` must be told to quote it. Accepting bare words would make
    // those two inputs inconsistent and silently produce a string.
    expect(parseValueInput("hello")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseValueInput("NaN")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseValueInput("Infinity")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseValueInput("undefined")).toEqual({ ok: false, error: "invalidJson" });
  });

  it("rejects near-JSON an admin might type", () => {
    expect(parseValueInput("{a:1}")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseValueInput("'quoted'")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseValueInput("[1,2")).toEqual({ ok: false, error: "invalidJson" });
  });
});

describe("isManagedKey", () => {
  const catalog = {
    template: "alpha-tpl",
    templateRevision: "sha256:a",
    keys: [
      { key: "model_list", value: [], managed: true },
      { key: "tools.web.brave.enabled", value: false, managed: false },
    ],
  };

  it("flags a key the template marks as proxy-owned", () => {
    // The old <select> disabled these options. A datalist cannot, so the guard has
    // to live here or replacing the control would silently drop it and the admin
    // would only learn from a 400.
    expect(isManagedKey(catalog, "model_list")).toBe(true);
  });

  it("does not flag a free key", () => {
    expect(isManagedKey(catalog, "tools.web.brave.enabled")).toBe(false);
  });

  it("does not flag a key the catalog has never heard of", () => {
    // A hand-typed path the template lacks is legitimate, and the PROXY is the
    // authority on managed paths -- it refuses three relations the catalog cannot
    // enumerate. Guessing here would block valid keys.
    expect(isManagedKey(catalog, "tools.web.some_future_provider.enabled")).toBe(false);
  });

  it("does not flag anything before the catalog loads", () => {
    expect(isManagedKey(null, "model_list")).toBe(false);
  });

  it("ignores surrounding whitespace, as the key field does", () => {
    expect(isManagedKey(catalog, "  model_list  ")).toBe(true);
  });
});

describe("prettyJson", () => {
  it("indents an object over multiple lines", () => {
    // The comparison form is one line, which is unreadable for anything but a
    // scalar: an admin looking at "what each member has now" has to be able to
    // read the value, not scroll it sideways.
    expect(prettyJson({ b: 2, a: 1 })).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("sorts keys exactly as canonicalJson does", () => {
    // Two views of one value. If they disagreed on key order, the value shown in a
    // bucket would not be the value the bucket was keyed by.
    const value = { z: 1, a: { y: 2, b: 3 } };
    expect(prettyJson(value).replace(/\s+/g, "")).toBe(canonicalJson(value).replace(/\s+/g, ""));
  });

  it("leaves a scalar on one line", () => {
    expect(prettyJson(true)).toBe("true");
    expect(prettyJson(null)).toBe("null");
    expect(prettyJson("text")).toBe('"text"');
    expect(prettyJson(32768)).toBe("32768");
  });

  it("indents nested arrays without reordering them", () => {
    expect(prettyJson([2, 1])).toBe("[\n  2,\n  1\n]");
  });

  it("renders an empty object and an empty array without a blank body", () => {
    // The shipped template carries several of these ("isolation": {}), so they
    // reach a bucket in practice.
    expect(prettyJson({})).toBe("{}");
    expect(prettyJson([])).toBe("[]");
  });
});

describe("canonicalJson", () => {
  it("sorts object keys so a reordered object compares equal", () => {
    // JSON.stringify preserves insertion order, so {a,b} and {b,a} stringify
    // differently. Two instances holding the same object must not be reported as
    // differing because the proxy read their keys in another order.
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("sorts keys at every depth", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 } })).toBe(canonicalJson({ x: { c: 2, d: 1 } }));
  });

  it("preserves array order -- position is meaning in an array", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("keeps null distinct from a string and from a number", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(null)).not.toBe(canonicalJson("null"));
    expect(canonicalJson(1)).not.toBe(canonicalJson("1"));
  });
});

describe("previewCounts", () => {
  it("counts instances by what the apply will do to them", () => {
    expect(previewCounts(MIXED, NEW_VALUE)).toEqual({
      // "z" (3) + 7 (1) + the absent bucket, where the key gets created (2).
      willChange: 6,
      // The reordered {b,a} object -- equal after canonical comparison.
      alreadyMatch: 1,
      // path_conflict (1) + unreadable (1): the apply will not touch these.
      excluded: 2,
    });
  });

  it("accounts for every instance -- the three counts sum to total", () => {
    const c = previewCounts(MIXED, NEW_VALUE);
    expect(c.willChange + c.alreadyMatch + c.excluded).toBe(MIXED.total);
    // And the fixture is a real histogram, not one instance per bucket: a sum
    // that only holds when every count is 1 proves nothing about the counting.
    expect(MIXED.buckets.some((b) => b.count > 1)).toBe(true);
  });

  it("counts an absent bucket as a change -- the key gets created", () => {
    const only: ScopeConfigInspection = {
      ...EMPTY,
      total: 2,
      buckets: [{ state: "absent", count: 2, instances: [inst("a"), inst("b")] }],
    };
    expect(previewCounts(only, NEW_VALUE)).toEqual({
      willChange: 2,
      alreadyMatch: 0,
      excluded: 0,
    });
  });

  it("treats a null-valued bucket as matching a submitted null", () => {
    const nulls: ScopeConfigInspection = {
      ...EMPTY,
      total: 1,
      buckets: [{ state: "value", value: null, count: 1, instances: [inst("a")] }],
    };
    expect(previewCounts(nulls, null).alreadyMatch).toBe(1);
    // ...and not a submitted string "null", nor the absent case.
    expect(previewCounts(nulls, "null").willChange).toBe(1);
  });

  it("returns zeroes for an empty inspection without throwing", () => {
    expect(previewCounts(EMPTY, NEW_VALUE)).toEqual({
      willChange: 0,
      alreadyMatch: 0,
      excluded: 0,
    });
  });
});

describe("revisionsFor", () => {
  it("maps every writable instance to the revision the admin inspected", () => {
    expect(revisionsFor(MIXED)).toEqual({
      "u-1": "sha256:u-1",
      "u-2": "sha256:u-2",
      "u-3": "sha256:u-3",
      "u-match": "sha256:u-match",
      "u-5": "sha256:u-5",
      "u-absent-1": "sha256:u-absent-1",
      "u-absent-2": "sha256:u-absent-2",
    });
  });

  it("omits unreadable and path_conflict instances", () => {
    const map = revisionsFor(MIXED);
    expect(map["u-unreadable"]).toBeUndefined();
    expect(map["u-conflict"]).toBeUndefined();
  });

  it("agrees with previewCounts on exactly which instances are in play", () => {
    // This is the invariant that keeps the preview honest. previewCounts calls a
    // path_conflict instance EXCLUDED; sending it anyway would have the result
    // report an attempt the preview said would never happen.
    const map = revisionsFor(MIXED);
    const counts = previewCounts(MIXED, NEW_VALUE);
    expect(Object.keys(map)).toHaveLength(counts.willChange + counts.alreadyMatch);

    const excluded = MIXED.buckets
      .filter((b) => b.state === "unreadable" || b.state === "path_conflict")
      .flatMap((b) => b.instances.map((i) => i.userAccId));
    expect(excluded).toHaveLength(counts.excluded);
    for (const id of excluded) expect(map).not.toHaveProperty(id);
  });

  it("returns an empty map for an empty inspection without throwing", () => {
    expect(revisionsFor(EMPTY)).toEqual({});
  });
});

describe("displayBuckets", () => {
  it("preserves the proxy's order rather than re-sorting", () => {
    expect(displayBuckets(MIXED).map((b) => b.state)).toEqual([
      "unreadable",
      "value",
      "absent",
      "value",
      "path_conflict",
      "value",
    ]);
    expect(displayBuckets(MIXED)).toEqual(MIXED.buckets);
  });

  it("is deterministic -- two identical inputs give identical output", () => {
    const copy: ScopeConfigInspection = {
      ...MIXED,
      buckets: MIXED.buckets.map((b) => ({ ...b })) as ConfigKeyBucket[],
    };
    expect(displayBuckets(MIXED)).toEqual(displayBuckets(copy));
  });

  it("returns nothing for an empty inspection", () => {
    expect(displayBuckets(EMPTY)).toEqual([]);
  });
});

describe("groupOutcomes", () => {
  it("groups instances by outcome in CONFIG_OUTCOMES declaration order", () => {
    // The declaration order is the render order, so the same batch never renders
    // its sections in a different sequence between two applies.
    const grouped = groupOutcomes(
      result([
        outcome("e", "error"),
        outcome("a", "applied"),
        outcome("u", "unchanged"),
        outcome("b", "applied"),
      ]),
    );
    expect(grouped.groups.map((g) => g.kind)).toEqual(["applied", "unchanged", "error"]);
    expect(grouped.groups[0].instances.map((i) => i.userAccId)).toEqual(["a", "b"]);
  });

  it("omits outcome kinds nothing landed on", () => {
    const grouped = groupOutcomes(result([outcome("a", "applied")]));
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups.map((g) => g.kind)).not.toContain("stale");
  });

  it("orders groups the same way for any input order", () => {
    const forward = groupOutcomes(result([outcome("a", "applied"), outcome("e", "error")]));
    const reversed = groupOutcomes(result([outcome("e", "error"), outcome("a", "applied")]));
    expect(forward.groups.map((g) => g.kind)).toEqual(reversed.groups.map((g) => g.kind));
  });

  it("flags stale only when a stale outcome is present", () => {
    // hasStale drives a re-inspect prompt instead of a retry: the revisions the
    // admin held are out of date, and re-sending them would overwrite whatever
    // the proxy's own materialization just wrote.
    expect(groupOutcomes(result([outcome("a", "applied")])).hasStale).toBe(false);
    expect(groupOutcomes(result([outcome("s", "stale")])).hasStale).toBe(true);
    expect(
      groupOutcomes(result([outcome("a", "applied"), outcome("s", "stale")])).hasStale,
    ).toBe(true);
  });

  it("keeps every outcome -- no instance is dropped", () => {
    const outcomes = CONFIG_OUTCOMES.map((kind, i) => outcome(`u-${i}`, kind));
    const grouped = groupOutcomes(result(outcomes));
    expect(grouped.groups.flatMap((g) => g.instances)).toHaveLength(outcomes.length);
    expect(grouped.groups.map((g) => g.kind)).toEqual([...CONFIG_OUTCOMES]);
  });

  it("handles a result with no outcomes", () => {
    expect(groupOutcomes(result([]))).toEqual({ groups: [], hasStale: false });
  });
});

describe("inspectionKey", () => {
  const key = "agents.defaults.max_tokens";

  it("is stable for the same scope, agent and key", () => {
    expect(inspectionKey(scope, "alpha", key)).toBe(inspectionKey({ ...scope }, "alpha", key));
  });

  it("changes when any one component changes", () => {
    // The panel discards a loaded inspection when this changes. That is what stops
    // a revisions map gathered under one scope/agent/key from being submitted
    // against another -- which would write revisions the admin never inspected.
    const base = inspectionKey(scope, "alpha", key);
    expect(inspectionKey({ ...scope, kind: "tenant" }, "alpha", key)).not.toBe(base);
    expect(inspectionKey({ ...scope, tenantId: "t-2" }, "alpha", key)).not.toBe(base);
    expect(inspectionKey({ ...scope, subsAccId: "s-2" }, "alpha", key)).not.toBe(base);
    expect(inspectionKey(scope, "beta", key)).not.toBe(base);
    expect(inspectionKey(scope, "alpha", "agents.defaults.model_name")).not.toBe(base);
  });

  it("distinguishes a missing subsAccId from an empty one it could run into", () => {
    const tenant: ScopeRef = { kind: "tenant", tenantId: "t-1" };
    expect(inspectionKey(tenant, "alpha", key)).not.toBe(
      inspectionKey({ ...tenant, subsAccId: "s-1" }, "alpha", key),
    );
  });

  it("cannot be spoofed by a component that contains the separator", () => {
    // Concatenating raw fields lets one component's text impersonate a boundary.
    expect(inspectionKey(scope, "alpha", key)).not.toBe(
      inspectionKey({ ...scope, subsAccId: "s-1", tenantId: "t-1" }, "alpha:s-1", key),
    );
  });
});
