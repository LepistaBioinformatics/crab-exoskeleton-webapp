// NOTE: reconstructed from a partial capture after this file was deleted by an
// out-of-band rollback. The last case was completed by inference — verify this
// matches your original intent (there may have been additional cases below).
import { describe, it, expect } from "vitest";
import { canManageWorkspaceScope } from "./admin";
import type { AdminScope } from "./admin";

const T = "tenant-1";
const S = "sub-1";

describe("canManageWorkspaceScope", () => {
  it("denies when the caller has no scopes", () => {
    expect(canManageWorkspaceScope([], T, S)).toBe(false);
  });

  it("allows when the caller holds the tenant scope (any subscription under it)", () => {
    const scopes: AdminScope[] = [{ kind: "tenant", tenantId: T }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(true);
    expect(canManageWorkspaceScope(scopes, T, "other-sub")).toBe(true);
  });

  it("allows when the caller holds the matching subscription scope", () => {
    const scopes: AdminScope[] = [{ kind: "subscription", tenantId: T, subsAccId: S }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(true);
  });

  it("denies a subscription scope for a different subscription", () => {
    const scopes: AdminScope[] = [{ kind: "subscription", tenantId: T, subsAccId: "sub-2" }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(false);
  });

  it("denies a tenant scope for a different tenant", () => {
    const scopes: AdminScope[] = [{ kind: "tenant", tenantId: "tenant-2" }];
    expect(canManageWorkspaceScope(scopes, T, S)).toBe(false);
  });
});
