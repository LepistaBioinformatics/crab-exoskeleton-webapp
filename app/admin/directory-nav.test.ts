import { describe, it, expect } from "vitest";
import {
  directoryPanel,
  resolveArea,
  resolveDirSection,
  resolveDirTenant,
} from "./directory-nav";

const TENANTS = [
  { id: "t-1", name: "Acme" },
  { id: "t-2", name: "Globex" },
];

describe("resolveArea", () => {
  it("accepts the two areas", () => {
    expect(resolveArea("tenants")).toBe("tenants");
    expect(resolveArea("roles")).toBe("roles");
  });

  // Null, not a default: a default would answer a question the column is still
  // asking, which is how the workspaces side once opened panels nobody chose.
  it("is null for anything else", () => {
    expect(resolveArea("garbage")).toBeNull();
    expect(resolveArea(null)).toBeNull();
    expect(resolveArea("")).toBeNull();
  });
});

describe("resolveDirTenant", () => {
  it("accepts a tenant that is actually there", () => {
    expect(resolveDirTenant("t-2", TENANTS)).toBe("t-2");
  });

  // The query string is user-editable and outlives a deleted tenant. A value that
  // parses fine can still name nothing, and the column has to keep asking rather
  // than open a panel headed by a tenant that is gone.
  it("refuses one the list does not contain", () => {
    expect(resolveDirTenant("t-9", TENANTS)).toBeNull();
    expect(resolveDirTenant("t-1", [])).toBeNull();
    expect(resolveDirTenant(null, TENANTS)).toBeNull();
  });
});

describe("resolveDirSection", () => {
  it("accepts the sections", () => {
    expect(resolveDirSection("overview")).toBe("overview");
    expect(resolveDirSection("accounts")).toBe("accounts");
  });

  it("is null for anything else", () => {
    expect(resolveDirSection("members")).toBeNull();
    expect(resolveDirSection(undefined)).toBeNull();
  });
});

describe("directoryPanel", () => {
  // Guest roles are global in mycelium -- the list method takes no tenant -- so
  // picking the area is the whole path.
  it("shows roles with no tenant at all", () => {
    expect(directoryPanel("roles", null, null)).toBe("roles");
  });

  // THE CASE THAT MAKES A FIRST INSTALL POSSIBLE. With no tenant selected the
  // panel still shows, carrying the create form -- otherwise the one screen that
  // lists tenants would have no way to add one.
  it("shows the create form for the tenants area with nothing selected", () => {
    expect(directoryPanel("tenants", null, null)).toBe("create");
  });

  it("shows the section a chosen tenant asks for", () => {
    expect(directoryPanel("tenants", "t-1", "overview")).toBe("tenant");
    expect(directoryPanel("tenants", "t-1", "accounts")).toBe("accounts");
  });

  // A tenant with no section is the sections column still asking, not a panel.
  it("shows nothing while the sections column is still asking", () => {
    expect(directoryPanel("tenants", "t-1", null)).toBeNull();
  });

  it("shows nothing before an area is chosen", () => {
    expect(directoryPanel(null, "t-1", "overview")).toBeNull();
  });
});
