import { describe, it, expect } from "vitest";
import type { AdminScope, ScopeRef } from "@/lib/admin";
import {
  brandingOnly,
  encodeScope,
  openTenant,
  railItems,
  resolveScope,
  resolveTenant,
  tenantsOf,
} from "./admin-nav";

const TENANT: AdminScope = { kind: "tenant", tenantId: "t1", tenantName: "Acme" };
const SUB: AdminScope = {
  kind: "subscription",
  tenantId: "t1",
  subsAccId: "a1",
  tenantName: "Acme",
  accName: "Growth",
};
const OTHER_SUB: AdminScope = { kind: "subscription", tenantId: "t2", subsAccId: "a2" };

describe("railItems", () => {
  it("offers only what the caller can use", () => {
    expect(railItems({ hasScopes: true, canEditBranding: true })).toEqual([
      "workspaces",
      "branding",
    ]);
    expect(railItems({ hasScopes: true, canEditBranding: false })).toEqual(["workspaces"]);
    expect(railItems({ hasScopes: false, canEditBranding: true })).toEqual(["branding"]);
  });

  it("is empty for a caller with no authority at all", () => {
    expect(railItems({ hasScopes: false, canEditBranding: false })).toEqual([]);
  });
});

// The URL is the single source of truth for the selection, so the encoding has to
// survive a round trip through a query string that a human may also have typed.
describe("encodeScope / resolveScope", () => {
  it("round-trips a tenant and a subscription", () => {
    for (const scope of [TENANT, SUB]) {
      const ref: ScopeRef =
        scope.kind === "subscription"
          ? { kind: "subscription", tenantId: scope.tenantId, subsAccId: scope.subsAccId }
          : { kind: "tenant", tenantId: scope.tenantId };
      expect(resolveScope(encodeScope(ref), [TENANT, SUB])).toEqual(ref);
    }
  });

  it("gives the two kinds distinct addresses", () => {
    expect(encodeScope({ kind: "tenant", tenantId: "t1" })).toBe("t:t1");
    expect(encodeScope({ kind: "subscription", tenantId: "t1", subsAccId: "a1" })).toBe(
      "s:t1:a1",
    );
  });

  // A subscription with no account id cannot be addressed as one. Encoding it as its
  // tenant is recoverable; `s:t1:` would resolve to nothing and drop the admin back to
  // the scope step with no way to tell why.
  it("falls back to the tenant address for a subscription with no account id", () => {
    expect(encodeScope({ kind: "subscription", tenantId: "t1" })).toBe("t:t1");
  });

  it("resolves to null for absent, empty or unparseable values", () => {
    for (const raw of [null, undefined, "", "garbage", "t1", "s:t1", "__proto__"]) {
      expect(resolveScope(raw, [TENANT, SUB])).toBeNull();
    }
  });

  // Resolution is not parsing. A value can be perfectly well-formed and still name a
  // scope this caller has no authority over -- a revocation between two visits is the
  // ordinary case, not a hostile one.
  it("resolves to null for a well-formed scope the caller does not manage", () => {
    expect(resolveScope(encodeScope(OTHER_SUB as ScopeRef), [TENANT, SUB])).toBeNull();
    expect(resolveScope("s:t1:a1", [TENANT])).toBeNull();
    expect(resolveScope("t:t1", [])).toBeNull();
  });

  it("does not confuse a tenant with its own subscription", () => {
    expect(resolveScope("t:t1", [SUB])).toBeNull();
    expect(resolveScope("s:t1:a1", [TENANT])).toBeNull();
  });
});


// A single-item console is indistinguishable from a broken one unless it says why.
describe("brandingOnly", () => {
  it("is the branding-rights-but-no-scope state", () => {
    expect(brandingOnly({ hasScopes: false, canEditBranding: true })).toBe(true);
  });

  it("is not a caller who has scopes, whatever their branding rights", () => {
    expect(brandingOnly({ hasScopes: true, canEditBranding: true })).toBe(false);
    expect(brandingOnly({ hasScopes: true, canEditBranding: false })).toBe(false);
  });

  // No authority at all is a different screen -- the "no admin access" state, which
  // already explains itself.
  it("is not a caller with no authority at all", () => {
    expect(brandingOnly({ hasScopes: false, canEditBranding: false })).toBe(false);
  });
});

describe("resolveTenant", () => {
  it("accepts a tenant the caller administers", () => {
    expect(resolveTenant("t1", [TENANT, SUB])).toBe("t1");
  });

  it("resolves to null for absent or unknown values", () => {
    for (const raw of [null, undefined, "", "t9", "__proto__"]) {
      expect(resolveTenant(raw, [TENANT, SUB])).toBeNull();
    }
  });

  // A subscription scope is enough to administer WITHIN its tenant, so the tenant column
  // must offer it even when the caller holds no tenant-level scope.
  it("accepts a tenant reached only through a subscription scope", () => {
    expect(resolveTenant("t1", [SUB])).toBe("t1");
  });
});

// Two parameters can both claim to name the open tenant. One owner, stated and tested.
describe("openTenant", () => {
  const scope: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "a1" };

  it("derives the tenant from the scope whenever one is selected", () => {
    expect(openTenant(scope, undefined, [TENANT, SUB])).toBe("t1");
  });

  // Stale or hand-edited. Honouring it would draw a subscriptions column that does not
  // contain the row the scope selected.
  it("ignores a ?tenant= that disagrees with the selected scope", () => {
    expect(openTenant(scope, "t2", [TENANT, SUB, OTHER_SUB])).toBe("t1");
  });

  it("falls back to ?tenant= only when no scope is selected", () => {
    expect(openTenant(null, "t1", [TENANT, SUB])).toBe("t1");
    expect(openTenant(null, "t9", [TENANT, SUB])).toBeNull();
    expect(openTenant(null, null, [TENANT, SUB])).toBeNull();
  });
});

describe("tenantsOf", () => {
  it("collapses the flat scope list to one entry per tenant", () => {
    expect(tenantsOf([TENANT, SUB, OTHER_SUB])).toEqual([
      { id: "t1", name: "Acme" },
      { id: "t2", name: "t2" },
    ]);
  });

  // An id reads worse than a name and far better than a column row saying "undefined".
  it("falls back to the id when no name resolved", () => {
    expect(tenantsOf([OTHER_SUB])).toEqual([{ id: "t2", name: "t2" }]);
  });

  // /scopes returns a stable order; re-sorting here would fight it and make the column
  // jump between reloads.
  it("preserves first-seen order", () => {
    expect(tenantsOf([OTHER_SUB, TENANT]).map((t) => t.id)).toEqual(["t2", "t1"]);
  });
});
