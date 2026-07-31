import { describe, it, expect, vi, afterEach } from "vitest";
import { applyConfigKey, inspectConfigKey, listConfigKeys } from "./scopeConfig";
import type { ScopeRef } from "@/lib/admin";

const scope: ScopeRef = { kind: "subscription", tenantId: "t-1", subsAccId: "s-1" };

// Stubs fetch and records what each fetcher put on the wire, which is half of
// what these tests are about: the query string and the request body are the
// contract with the BFF, and a fetcher that parses correctly while addressing the
// wrong URL is still broken.
type Call = { url: string; init?: RequestInit };

function stubFetch(body: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      // A raw string is sent as-is, so a non-JSON 200 can be exercised too.
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      return new Response(payload, { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

function query(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

function sentBody(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// A malformed or partial response must degrade to an empty view rather than
// throwing: an admin screen that cannot render its own error state is worse than
// one showing no keys. Same reasoning as parseSecretNames in lib/secrets.ts.
describe("defensive parsing", () => {
  it("coerces an empty catalog response to an empty key list", async () => {
    stubFetch({});
    expect(await listConfigKeys(scope, "alpha")).toEqual({
      template: "",
      keys: [],
      templateRevision: "",
    });
  });

  it("coerces a null catalog response", async () => {
    stubFetch(null);
    expect((await listConfigKeys(scope, "alpha")).keys).toEqual([]);
  });

  it("coerces a catalog whose keys field is not an array", async () => {
    stubFetch({ keys: 3, template: "alpha-tpl" });
    const cat = await listConfigKeys(scope, "alpha");
    expect(cat.keys).toEqual([]);
    expect(cat.template).toBe("alpha-tpl");
  });

  it("drops catalog entries that carry no key rather than offering a nameless one", async () => {
    stubFetch({ keys: [3, null, { key: "tools.web.max_results", value: 5, managed: false }] });
    const cat = await listConfigKeys(scope, "alpha");
    expect(cat.keys).toHaveLength(1);
    expect(cat.keys[0].key).toBe("tools.web.max_results");
  });

  it("coerces an empty inspect response to a zero histogram", async () => {
    stubFetch({});
    expect(await inspectConfigKey(scope, "alpha", "version")).toEqual({
      key: "",
      agent: "",
      total: 0,
      buckets: [],
    });
  });

  it("coerces a null inspect response", async () => {
    stubFetch(null);
    expect(await inspectConfigKey(scope, "alpha", "version")).toEqual({
      key: "",
      agent: "",
      total: 0,
      buckets: [],
    });
  });

  it("coerces an inspect response whose buckets field is not an array", async () => {
    stubFetch({ buckets: "nope", key: "version", agent: "alpha", total: 4 });
    const insp = await inspectConfigKey(scope, "alpha", "version");
    expect(insp.buckets).toEqual([]);
    expect(insp.total).toBe(4);
  });

  it("coerces an apply response with no outcomes and no summary", async () => {
    stubFetch({});
    expect(await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions: {} })).toEqual(
      { key: "", outcomes: [], summary: {} },
    );
  });

  it("survives a 200 that is not JSON at all", async () => {
    stubFetch("<html>oops</html>");
    expect((await inspectConfigKey(scope, "alpha", "version")).buckets).toEqual([]);
  });

  // An unrecognised state must not be presented as one of the three that claim
  // something about the document. "unreadable" is the only safe landing spot.
  it("reduces an unknown bucket state to unreadable", async () => {
    stubFetch({ buckets: [{ state: "brand_new", count: 1, instances: [] }] });
    expect((await inspectConfigKey(scope, "alpha", "version")).buckets[0].state).toBe("unreadable");
  });

  it("reduces an unknown outcome to error", async () => {
    stubFetch({ outcomes: [{ userAccId: "u1", outcome: "teleported" }] });
    const res = await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions: {} });
    expect(res.outcomes[0].outcome).toBe("error");
  });
});

describe("inspectConfigKey", () => {
  it("round-trips buckets, counts, revisions and emails", async () => {
    stubFetch({
      key: "tools.web.max_results",
      agent: "alpha",
      total: 3,
      buckets: [
        {
          state: "value",
          value: 5,
          count: 2,
          instances: [
            { userAccId: "u1", email: "one@example.com", revision: "sha256:aaa" },
            { userAccId: "u2", revision: "sha256:bbb" },
          ],
        },
        {
          state: "unreadable",
          count: 1,
          instances: [{ userAccId: "u3", revision: "", detail: "not provisioned" }],
        },
      ],
    });
    const insp = await inspectConfigKey(scope, "alpha", "tools.web.max_results");
    expect(insp.key).toBe("tools.web.max_results");
    expect(insp.agent).toBe("alpha");
    expect(insp.total).toBe(3);
    expect(insp.buckets.map((b) => b.state)).toEqual(["value", "unreadable"]);
    expect(insp.buckets[0].value).toBe(5);
    expect(insp.buckets[0].count).toBe(2);
    expect(insp.buckets[0].instances[0]).toEqual({
      userAccId: "u1",
      email: "one@example.com",
      revision: "sha256:aaa",
    });
    // The revision is what a later apply gates on: an instance whose revision was
    // dropped here is one the panel would have to write blind.
    expect(insp.buckets[0].instances[1].revision).toBe("sha256:bbb");
    expect(insp.buckets[1].instances[0].detail).toBe("not provisioned");
  });

  it("keeps an object value verbatim rather than flattening it", async () => {
    stubFetch({
      buckets: [{ state: "value", value: { a: [1, 2], b: null }, count: 1, instances: [] }],
    });
    const insp = await inspectConfigKey(scope, "alpha", "tools");
    expect(insp.buckets[0].value).toEqual({ a: [1, 2], b: null });
  });

  // THE distinction the whole feature rests on. A bucket holding JSON null holds a
  // VALUE (the proxy groups it under state "value"); a bucket with no `value` key
  // holds nothing. Collapsing the two would make "absent" and "set to null" the
  // same request, and the panel would offer to "fix" instances that are already
  // correct. Asserted with `in` rather than toBeUndefined/toEqual because both of
  // those pass for a present-but-undefined key.
  it("preserves a null value and keeps it distinct from an absent one", async () => {
    stubFetch({
      total: 2,
      buckets: [
        { state: "value", value: null, count: 1, instances: [{ userAccId: "u1", revision: "r1" }] },
        { state: "absent", count: 1, instances: [{ userAccId: "u2", revision: "r2" }] },
      ],
    });
    const [nulled, missing] = (await inspectConfigKey(scope, "alpha", "model")).buckets;
    expect("value" in nulled).toBe(true);
    expect(nulled.value).toBeNull();
    expect("value" in missing).toBe(false);
  });
});

describe("query strings", () => {
  it("sends the scope and agent on the keys request", async () => {
    const calls = stubFetch({});
    await listConfigKeys(scope, "alpha");
    expect(calls[0].url.startsWith("/api/admin/scope-config/keys?")).toBe(true);
    const q = query(calls[0].url);
    expect(q.get("tenant_id")).toBe("t-1");
    expect(q.get("subs_acc_id")).toBe("s-1");
    expect(q.get("agent")).toBe("alpha");
    // There is no `scope` parameter on this feature: the proxy has no tenant form
    // of the request, which is what caps it at one subscription.
    expect(q.has("scope")).toBe(false);
  });

  it("sends the scope, agent and key on the inspect request", async () => {
    const calls = stubFetch({});
    await inspectConfigKey(scope, "alpha", "tools.web.max_results");
    expect(calls[0].url.startsWith("/api/admin/scope-config/inspect?")).toBe(true);
    const q = query(calls[0].url);
    expect(q.get("tenant_id")).toBe("t-1");
    expect(q.get("subs_acc_id")).toBe("s-1");
    expect(q.get("agent")).toBe("alpha");
    expect(q.get("key")).toBe("tools.web.max_results");
  });

  // The dot is the path separator, so encoding it would address a different key
  // than the admin picked -- and it must arrive literal in the URL.
  it("leaves the dotted separators unmangled in the emitted URL", async () => {
    const calls = stubFetch({});
    await inspectConfigKey(scope, "alpha", "tools.web.max_results");
    expect(calls[0].url).toContain("key=tools.web.max_results");
    expect(calls[0].url).not.toContain("%2E");
  });

  // The case a naive `?key=${key}` template literal would fail: an unescaped `&`
  // would split the key into a second parameter and lose everything after it.
  it("percent-encodes a key character that would otherwise split the query", async () => {
    const calls = stubFetch({});
    await inspectConfigKey(scope, "alpha", "a&b=c");
    expect(query(calls[0].url).get("key")).toBe("a&b=c");
    expect(calls[0].url).toContain("%26");
  });
});

describe("applyConfigKey", () => {
  const revisions = { u1: "sha256:aaa", u2: "sha256:bbb" };

  it("PUTs the key, value and revisions in the body and the scope on the query", async () => {
    const calls = stubFetch({ key: "version", outcomes: [], summary: {} });
    await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions });
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].url.startsWith("/api/admin/scope-config?")).toBe(true);
    const q = query(calls[0].url);
    expect(q.get("tenant_id")).toBe("t-1");
    expect(q.get("subs_acc_id")).toBe("s-1");
    expect(q.get("agent")).toBe("alpha");
    const body = sentBody(calls[0]);
    expect(body.key).toBe("version");
    expect(body.value).toBe(3);
    expect(body.revisions).toEqual(revisions);
    // The agent rides on the query string, like the rest of the admin mutations.
    expect("agent" in body).toBe(false);
  });

  // The policy is a query concern for every other admin mutation (withPolicy), and
  // the proxy parses it off the URL before it touches the body.
  it("puts the restart policy on the query string, not in the body", async () => {
    const calls = stubFetch({});
    await applyConfigKey(
      scope,
      "alpha",
      { key: "version", value: 3, revisions },
      { mode: "notice", note: "rolling out tonight" },
    );
    const q = query(calls[0].url);
    expect(q.get("restart")).toBe("notice");
    expect(q.get("restart_note")).toBe("rolling out tonight");
    const body = sentBody(calls[0]);
    expect("restart" in body).toBe(false);
    expect("restart_note" in body).toBe(false);
  });

  it("emits restart_at for a scheduled bounce", async () => {
    const calls = stubFetch({});
    await applyConfigKey(
      scope,
      "alpha",
      { key: "version", value: 3, revisions },
      { mode: "schedule", at: "2030-01-02T03:04" },
    );
    expect(query(calls[0].url).get("restart_at")).toBe(new Date("2030-01-02T03:04").toISOString());
  });

  // This endpoint is the one place where OMITTING the parameter does not mean
  // "now". The proxy's bulk handler substitutes `notice` for an absent mode
  // (DEC-9), because "now" here bounces every changed member of the subscription
  // at once. policyParams omits the parameter for mode "now" — correct everywhere
  // else — so relying on it here would send the admin's "now" as a notice.
  it("sends restart=now EXPLICITLY, because absent means notice on this endpoint", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions }, { mode: "now" });
    expect(query(calls[0].url).get("restart")).toBe("now");
  });

  // ...and the default policy IS mode "now", so it must land the same way rather
  // than silently degrading to a notice.
  it("sends restart=now for the default policy too", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions });
    expect(query(calls[0].url).get("restart")).toBe("now");
  });

  // A template write reaches every agent declaring that template, including other
  // subscriptions' future members -- so it must be opt-in on the wire and not
  // merely falsy. The proxy only reads templateRevision when alsoTemplate is set.
  it("omits alsoTemplate from the body when it is false or unset", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions });
    expect("alsoTemplate" in sentBody(calls[0])).toBe(false);

    await applyConfigKey(scope, "alpha", {
      key: "version",
      value: 3,
      revisions,
      alsoTemplate: false,
      templateRevision: "sha256:tpl",
    });
    const body = sentBody(calls[1]);
    expect("alsoTemplate" in body).toBe(false);
    expect("templateRevision" in body).toBe(false);
  });

  it("sends alsoTemplate with its revision when the admin asked for it", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", {
      key: "version",
      value: 3,
      revisions,
      alsoTemplate: true,
      templateRevision: "sha256:tpl",
    });
    const body = sentBody(calls[0]);
    expect(body.alsoTemplate).toBe(true);
    expect(body.templateRevision).toBe("sha256:tpl");
  });

  // A config value is arbitrary JSON, and this layer must not coerce it: 1 and "1"
  // land in config.json as a number and a string, which picoclaw reads differently.
  it("sends a number as JSON 1 and a boolean as JSON true, never as strings", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", { key: "heartbeat.interval", value: 1, revisions });
    expect(String(calls[0].init?.body)).toContain('"value":1');
    expect(sentBody(calls[0]).value).toBe(1);

    await applyConfigKey(scope, "alpha", { key: "tools.web.enabled", value: true, revisions });
    expect(String(calls[1].init?.body)).toContain('"value":true');
    expect(sentBody(calls[1]).value).toBe(true);
  });

  it("sends a null value as JSON null rather than dropping it", async () => {
    const calls = stubFetch({});
    await applyConfigKey(scope, "alpha", { key: "model", value: null, revisions });
    expect(String(calls[0].init?.body)).toContain('"value":null');
  });

  it("round-trips the per-instance outcomes, the summary and the template result", async () => {
    stubFetch({
      key: "version",
      outcomes: [
        {
          userAccId: "u1",
          email: "one@example.com",
          outcome: "applied",
          migration: "20260731-version",
          reapplied: { ok: true },
        },
        { userAccId: "u2", outcome: "stale", detail: "revision moved" },
        { userAccId: "u3", outcome: "error", recordError: "disk full" },
      ],
      summary: { applied: 1, stale: 1, error: 1 },
      template: { ok: false, detail: "stale template revision" },
    });
    const res = await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions });
    expect(res.key).toBe("version");
    expect(res.outcomes.map((o) => o.outcome)).toEqual(["applied", "stale", "error"]);
    expect(res.outcomes[0].email).toBe("one@example.com");
    expect(res.outcomes[0].migration).toBe("20260731-version");
    expect(res.outcomes[0].reapplied).toEqual({ ok: true });
    expect(res.outcomes[1].detail).toBe("revision moved");
    expect(res.outcomes[2].recordError).toBe("disk full");
    expect(res.summary).toEqual({ applied: 1, stale: 1, error: 1 });
    expect(res.template).toEqual({ ok: false, detail: "stale template revision" });
  });

  // "the reapply ran and succeeded" has to stay distinguishable from "nothing was
  // written, so no reapply happened" -- which is why the proxy makes it a pointer.
  it("leaves reapplied absent when no write happened", async () => {
    stubFetch({ outcomes: [{ userAccId: "u1", outcome: "unchanged" }], summary: { unchanged: 1 } });
    const res = await applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions });
    expect("reapplied" in res.outcomes[0]).toBe(false);
  });
});

// Errors ride on the Error message as a CODE, which is the channel every admin
// panel already renders with errorText(dict, e.message).
describe("errors", () => {
  it("throws the proxy's error code", async () => {
    stubFetch({ error: "managed_path" }, 400);
    await expect(listConfigKeys(scope, "alpha")).rejects.toThrow("managed_path");
  });

  it("falls back to the status-derived code when the body carries none", async () => {
    stubFetch({}, 403);
    await expect(inspectConfigKey(scope, "alpha", "version")).rejects.toThrow("forbidden");
  });

  it("throws rather than returning an empty result on a failed apply", async () => {
    stubFetch({ error: "stale_revision" }, 409);
    await expect(
      applyConfigKey(scope, "alpha", { key: "version", value: 3, revisions: {} }),
    ).rejects.toThrow("stale_revision");
  });
});

describe("listConfigKeys", () => {
  it("round-trips the template name, revision and the managed flag", async () => {
    stubFetch({
      // A template NAME, not the agent key: two agents may share one template.
      template: "alpha-tpl",
      templateRevision: "sha256:abc",
      keys: [
        { key: "heartbeat.interval", value: 30, managed: false },
        { key: "model_list", value: [], managed: true },
        { key: "tools.allow_read_paths", value: null, managed: false },
      ],
    });
    const cat = await listConfigKeys(scope, "alpha");
    expect(cat.template).toBe("alpha-tpl");
    expect(cat.templateRevision).toBe("sha256:abc");
    expect(cat.keys.map((k) => k.key)).toEqual([
      "heartbeat.interval",
      "model_list",
      "tools.allow_read_paths",
    ]);
    expect(cat.keys[0].value).toBe(30);
    // Managed keys arrive flagged rather than filtered, so the picker can render
    // them disabled and say why instead of hiding a key that is in the file.
    expect(cat.keys.map((k) => k.managed)).toEqual([false, true, false]);
    expect(cat.keys[2].value).toBeNull();
  });
});
