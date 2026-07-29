import { describe, it, expect } from "vitest";
import { resolveDefaultScope } from "./model-defaults-panel";
import type { ScopeRef } from "@/lib/admin";

const tenantScope: ScopeRef = { kind: "tenant", tenantId: "t1" };
const subsScope: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "s1" };

// The global and agent cases are gone with the branches that served them. This
// screen writes only the level the scope tree is sitting on, so nothing can select
// either any more — and the type says so, which is why the deleted assertions no
// longer compile rather than merely no longer running.
describe("resolveDefaultScope", () => {
  it("resolves tenant from a tenant scope", () => {
    expect(resolveDefaultScope("tenant", tenantScope)).toEqual({ kind: "tenant", tenantId: "t1" });
  });

  it("resolves subscription from a subscription scope", () => {
    expect(resolveDefaultScope("subscription", subsScope)).toEqual({
      kind: "subscription",
      tenantId: "t1",
      subsAccId: "s1",
    });
  });

  it("returns null for subscription level when the scope is not a subscription", () => {
    expect(resolveDefaultScope("subscription", tenantScope)).toBeNull();
  });

  it("resolves tenant level against a subscription scope using the subscription's tenant, not the subscription itself", () => {
    // This is the combination the resync effect in ModelDefaultsPanel exists to
    // prevent from arising by accident: "tenant" stays satisfiable (and thus
    // silently correct-looking) even while the admin is looking at one
    // subscription under that tenant. The function itself must still resolve it
    // predictably — to the tenant-wide scope, not the subscription's — since the
    // effect is what keeps this combination from being selected unintentionally,
    // not this function.
    expect(resolveDefaultScope("tenant", subsScope)).toEqual({ kind: "tenant", tenantId: "t1" });
  });
});
