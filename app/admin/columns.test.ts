import { describe, it, expect } from "vitest";
import type { AdminScope, AgentRef, ScopeRef } from "@/lib/admin";
import { LEGACY_AGENT } from "./agent-scope";
import { buildColumns, isAsking, splitColumns, type Column, type ColumnsInput } from "./columns";

const AGENTS: AgentRef[] = [
  { key: "alpha", harness: "picoclaw" },
  { key: "hermes", harness: "some-other-harness" },
];

const TENANT: AdminScope = { kind: "tenant", tenantId: "t1", tenantName: "Innovation" };
const SUB_A: AdminScope = {
  kind: "subscription",
  tenantId: "t1",
  subsAccId: "a1",
  tenantName: "Innovation",
  accName: "Marketing Squad",
};
const SUB_B: AdminScope = { kind: "subscription", tenantId: "t1", subsAccId: "a2" };
const OTHER: AdminScope = { kind: "subscription", tenantId: "t2", subsAccId: "b1" };

const SCOPE_A: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "a1" };

function build(over: Partial<ColumnsInput> = {}): Column[] {
  return buildColumns({
    authority: { hasScopes: true, canEditBranding: true },
    agents: AGENTS,
    scopes: [TENANT, SUB_A, SUB_B, OTHER],
    root: "workspaces",
    agent: null,
    tenantId: null,
    scope: null,
    section: null,
    ...over,
  });
}

const keys = (cols: Column[]) => cols.map((c) => c.key);
const col = (cols: Column[], key: string) => cols.find((c) => c.key === key)!;

describe("buildColumns — which columns exist", () => {
  it("opens one column per answered question, and no further", () => {
    expect(keys(build())).toEqual(["root", "agents"]);
    expect(keys(build({ agent: "alpha" }))).toEqual(["root", "agents", "tenants"]);
    expect(keys(build({ agent: "alpha", tenantId: "t1" }))).toEqual([
      "root",
      "agents",
      "tenants",
      "subscriptions",
    ]);
    expect(keys(build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A }))).toEqual([
      "root",
      "agents",
      "tenants",
      "subscriptions",
      "sections",
    ]);
  });

  // Branding is instance-wide: there is no scope to choose, so there is nothing to the
  // right of it. This is the shape the user corrected the design to.
  it("opens nothing beyond the root for branding", () => {
    expect(keys(build({ root: "branding" }))).toEqual(["root"]);
  });

  it("draws nothing at all for a caller with no authority", () => {
    expect(
      build({ authority: { hasScopes: false, canEditBranding: false } }),
    ).toEqual([]);
  });
});

describe("buildColumns — the root column", () => {
  it("puts branding first, as a leaf, and agents as a branch", () => {
    const rows = col(build(), "root").rows;
    expect(rows.map((r) => r.textKey)).toEqual(["branding", "agents"]);
    expect(rows[0].branch).toBe(false);
    expect(rows[1].branch).toBe(true);
  });

  it("offers only what the caller can use", () => {
    expect(
      col(build({ authority: { hasScopes: true, canEditBranding: false } }), "root").rows.map(
        (r) => r.textKey,
      ),
    ).toEqual(["agents"]);
    // The branding-only caller, inherited from the deleted nav-rail test.
    expect(
      col(
        build({ authority: { hasScopes: false, canEditBranding: true }, root: "branding" }),
        "root",
      ).rows.map((r) => r.textKey),
    ).toEqual(["branding"]);
  });
});

describe("buildColumns — the agents column", () => {
  it("lists every agent as a branch", () => {
    const rows = col(build(), "agents").rows;
    expect(rows.slice(0, 2).map((r) => r.text)).toEqual(["alpha", "hermes"]);
    expect(rows.slice(0, 2).every((r) => r.branch)).toBe(true);
  });

  // The store is an address, not an agent. It must never read as one more thing to choose.
  it("keeps the legacy store subordinate and never prints its sentinel", () => {
    const legacy = col(build(), "agents").rows.at(-1)!;
    expect(legacy.tone).toBe("legacy");
    expect(legacy.textKey).toBe("legacy");
    expect(legacy.text).toBeUndefined();
    expect(legacy.id).toContain(LEGACY_AGENT);
  });

  // "Fetched and empty" is a real answer and is stated; the legacy entry still reaches
  // whatever was already stored, so the column is not a dead end.
  it("states an empty agent list while still offering the legacy entry", () => {
    const c = col(build({ agents: [] }), "agents");
    expect(c.empty).toBe("noAgents");
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].tone).toBe("legacy");
  });
});

describe("buildColumns — tenants and subscriptions", () => {
  it("collapses the flat scope list into one row per tenant", () => {
    expect(col(build({ agent: "alpha" }), "tenants").rows.map((r) => r.text)).toEqual([
      "Innovation",
      "t2",
    ]);
  });

  // Choosing "the tenant itself" is a choice among that tenant's targets, which is what
  // this column lists.
  it("leads the subscriptions column with the tenant-wide target", () => {
    const rows = col(build({ agent: "alpha", tenantId: "t1" }), "subscriptions").rows;
    expect(rows[0].textKey).toBe("tenantWide");
    expect(rows.slice(1).map((r) => r.text)).toEqual(["Marketing Squad", "a2"]);
  });

  // A subscriptions manager reaches the tenant as a grouping, never as something they may
  // write to.
  it("withholds the tenant-wide target from a caller without the tenant scope", () => {
    const rows = col(
      build({ agent: "alpha", tenantId: "t1", scopes: [SUB_A] }),
      "subscriptions",
    ).rows;
    expect(rows.map((r) => r.textKey)).not.toContain("tenantWide");
  });

  it("states a tenant with no subscriptions", () => {
    expect(col(build({ agent: "alpha", tenantId: "t1", scopes: [TENANT] }), "subscriptions").empty)
      .toBe("noSubscriptions");
  });

  it("shows only the selected tenant's subscriptions", () => {
    expect(
      col(build({ agent: "alpha", tenantId: "t2" }), "subscriptions").rows.map((r) => r.text),
    ).toEqual(["b1"]);
  });
});

describe("buildColumns — the sections column", () => {
  it("offers every section of a picoclaw agent, all leaves", () => {
    const rows = col(build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A }), "sections").rows;
    expect(rows.map((r) => r.textKey)).toEqual([
      "files",
      "secrets",
      "skills",
      "persona",
      "model",
      "config",
      "members",
    ]);
    expect(rows.every((r) => !r.branch)).toBe(true);
  });

  it("withholds the picoclaw-only sections from another harness", () => {
    const rows = col(build({ agent: "hermes", tenantId: "t1", scope: SCOPE_A }), "sections").rows;
    expect(rows.map((r) => r.textKey)).toEqual(["files", "secrets", "skills", "members"]);
  });

  // No guest role is ever named for the all-agents store, so a roster there would be a
  // list nobody could add to.
  it("gives the legacy store the content sections alone", () => {
    const rows = col(
      build({ agent: LEGACY_AGENT, tenantId: "t1", scope: SCOPE_A }),
      "sections",
    ).rows;
    expect(rows.map((r) => r.textKey)).toEqual(["files", "secrets", "skills"]);
  });
});

describe("buildColumns — selection", () => {
  it("marks exactly one row per answered column", () => {
    const cols = build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A, section: "secrets" });
    for (const key of ["root", "agents", "tenants", "subscriptions", "sections"]) {
      expect(col(cols, key).rows.filter((r) => r.selected)).toHaveLength(1);
    }
  });

  it("marks the tenant-wide row when the scope is the tenant", () => {
    const rows = col(
      build({ agent: "alpha", tenantId: "t1", scope: { kind: "tenant", tenantId: "t1" } }),
      "subscriptions",
    ).rows;
    expect(rows[0].selected).toBe(true);
    expect(rows.slice(1).some((r) => r.selected)).toBe(false);
  });
});

// At most ONE column is drawn; every answered level is a breadcrumb segment instead.
describe("splitColumns", () => {
  it("collapses answered levels into crumbs and leaves the unanswered one open", () => {
    const { crumbs, open } = splitColumns(build({ agent: "alpha" }));
    expect(crumbs.map((c) => c.column.key)).toEqual(["root", "agents"]);
    expect(crumbs.map((c) => c.selected.text ?? c.selected.textKey)).toEqual(["agents", "alpha"]);
    expect(open?.key).toBe("tenants");
  });

  // The property the whole feature rests on: `buildColumns` opens column n only once n−1 is
  // answered, so the unanswered one is always the last and there is never more than one.
  // That is what made the mobile pane model deletable rather than adaptable.
  it("never leaves more than one column open, at any depth", () => {
    const paths: Partial<ColumnsInput>[] = [
      {},
      { agent: "alpha" },
      { agent: "alpha", tenantId: "t1" },
      { agent: "alpha", tenantId: "t1", scope: SCOPE_A },
      { agent: "alpha", tenantId: "t1", scope: SCOPE_A, section: "secrets" },
    ];
    for (const path of paths) {
      const columns = build(path);
      const unanswered = columns.filter((c) => !c.rows.some((r) => r.selected));
      expect(unanswered.length).toBeLessThanOrEqual(1);
      const { crumbs, open } = splitColumns(columns);
      expect(crumbs.length + (open ? 1 : 0)).toBe(columns.length);
    }
  });

  // THE SECTIONS LEVEL NEVER BECOMES A CRUMB. Agent, tenant and subscription are decided
  // once and then worked under; the section is switched all day, and a list you switch
  // between constantly belongs on screen rather than behind a click.
  it("keeps the sections level drawn as a column even once a section is chosen", () => {
    const { crumbs, open } = splitColumns(
      build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A, section: "secrets" }),
    );
    expect(crumbs.map((c) => c.column.key)).toEqual([
      "root",
      "agents",
      "tenants",
      "subscriptions",
    ]);
    expect(open?.key).toBe("sections");
    expect(open?.rows.find((r) => r.selected)?.textKey).toBe("secrets");
  });

  // The trailing hint keys off this: a sections column with a section chosen is not an open
  // question, so the bar must not end with one.
  it("separates a column that is ASKING from one that is showing a choice", () => {
    const asked = splitColumns(build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A }));
    expect(isAsking(asked.open)).toBe(true);
    const answered = splitColumns(
      build({ agent: "alpha", tenantId: "t1", scope: SCOPE_A, section: "secrets" }),
    );
    expect(isAsking(answered.open)).toBe(false);
    expect(isAsking(null)).toBe(false);
  });

  it("gives branding a single crumb and no column", () => {
    const { crumbs, open } = splitColumns(build({ root: "branding" }));
    expect(crumbs.map((c) => c.selected.textKey)).toEqual(["branding"]);
    expect(open).toBeNull();
  });

  it("is empty for a caller with no authority", () => {
    const { crumbs, open } = splitColumns(
      build({ authority: { hasScopes: false, canEditBranding: false } }),
    );
    expect(crumbs).toEqual([]);
    expect(open).toBeNull();
  });

  // The crumb names what was CHOSEN, not the column's heading -- and for the legacy store
  // that is its copy, never the sentinel.
  it("names the legacy store by its label, never by its sentinel", () => {
    const { crumbs } = splitColumns(build({ agent: LEGACY_AGENT }));
    const agentCrumb = crumbs.find((c) => c.column.key === "agents")!;
    expect(agentCrumb.selected.textKey).toBe("legacy");
    expect(agentCrumb.selected.text).toBeUndefined();
  });
});
