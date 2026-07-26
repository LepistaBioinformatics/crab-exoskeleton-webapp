import { describe, it, expect } from "vitest";
import { resolveDefaultScope } from "./model-defaults-panel";
import type { ScopeRef } from "@/lib/admin";

const tenantScope: ScopeRef = { kind: "tenant", tenantId: "t1" };
const subsScope: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "s1" };

describe("resolveDefaultScope", () => {
  it("resolves global regardless of the current scope", () => {
    expect(resolveDefaultScope("global", tenantScope)).toEqual({ kind: "global" });
    expect(resolveDefaultScope("global", subsScope)).toEqual({ kind: "global" });
  });

  it("resolves agent regardless of the current scope", () => {
    expect(resolveDefaultScope("agent", tenantScope)).toEqual({ kind: "agent" });
    expect(resolveDefaultScope("agent", subsScope)).toEqual({ kind: "agent" });
  });

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
