import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import Breadcrumb from "./breadcrumb";
import { buildColumns, splitColumns, type ColumnsInput } from "./columns";
import { LEGACY_AGENT } from "./agent-scope";
import type { AdminScope, AgentRef, ScopeRef } from "@/lib/admin";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en;

const AGENTS: AgentRef[] = [{ key: "alpha" }, { key: "beta" }];
const SCOPES: AdminScope[] = [
  { kind: "tenant", tenantId: "t1", tenantName: "Innovation" },
  { kind: "subscription", tenantId: "t1", subsAccId: "a1", accName: "Marketing Squad" },
];
const SCOPE_A: ScopeRef = { kind: "subscription", tenantId: "t1", subsAccId: "a1" };

function render(over: Partial<ColumnsInput> = {}) {
  const columns = buildColumns({
    authority: { hasScopes: true, canEditBranding: true },
    agents: AGENTS,
    scopes: SCOPES,
    root: "workspaces",
    agent: null,
    tenantId: null,
    scope: null,
    section: null,
    ...over,
  });
  const { crumbs, open } = splitColumns(columns);
  const chosen = open?.key === "sections" ? (open.rows.find((r) => r.selected) ?? null) : null;
  return renderToStaticMarkup(
    <Breadcrumb
      crumbs={crumbs}
      open={open}
      mobileTail={chosen && open ? { column: open, selected: chosen } : null}
      onSelect={() => {}}
    />,
  );
}

const FULL = { agent: "alpha", tenantId: "t1", scope: SCOPE_A, section: "secrets" as const };

describe("Breadcrumb", () => {
  // A segment names what was CHOSEN. The column's heading names the question, and the
  // question is answered — that is the whole reason the level left the strip.
  it("names the chosen value at each level, not the column heading", () => {
    const html = render(FULL);
    expect(html).toContain("alpha");
    expect(html).toContain("Innovation");
    expect(html).toContain("Marketing Squad");
  });

  // On a DESKTOP the section stays on screen as a column instead: it is the one level
  // switched repeatedly while working, so folding it into a line of text would put the list
  // used most behind a click.
  //
  // Below `md` that sidebar is hidden — the panel needs the whole screen there — so the
  // section does get a segment, marked `md:hidden`. One derivation, and CSS picks.
  it("carries the section only as a mobile-only tail segment", () => {
    const html = render(FULL);
    // The <li> that holds it, not a fixed window before it: the chevron's inline SVG alone
    // is longer than any slice worth guessing at.
    const tail = html.split("<li").find((chunk) => chunk.includes(t.shell.tabs.secrets));
    expect(tail).toBeDefined();
    expect(tail).toContain("md:hidden");
    // And it is the only place the section appears — no second, desktop-visible copy.
    expect(html.split(t.shell.tabs.secrets)).toHaveLength(3); // label + title attribute
  });

  // A phone fits perhaps two segments. Scrolling is what keeps four from being squeezed
  // into illegibility — and it is safe now only because the menu is portalled out of the
  // bar; in place, this same property clipped it and the dropdown did nothing.
  it("scrolls horizontally rather than squeezing its segments", () => {
    const html = render(FULL);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("shrink-0");
  });

  // The trailing segment is where you are; this is where the column browser's
  // current-vs-trail distinction went when the columns stopped carrying the trail.
  it("marks the trailing segment as the current position", () => {
    expect(render(FULL)).toContain('aria-current="page"');
  });

  // While something is unanswered the bar ends with the open question instead, so nothing
  // claims to be the current position when the path is not finished.
  it("ends with the open question, and marks no segment current, while a column is open", () => {
    const html = render({ agent: "alpha" });
    expect(html).toContain(t.columns.headings.tenants + t.columns.hintSuffix);
    expect(html).not.toContain('aria-current="page"');
  });

  // Every segment opens its level's siblings; the hint is not a control.
  it("makes each chosen segment a menu button", () => {
    const html = render(FULL);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("labels a segment by the level it changes, since its text is the value", () => {
    expect(render(FULL)).toContain(
      t.columns.changeAria.replace("{level}", t.columns.headings.agents),
    );
  });

  // The sentinel is `"all"`, which is a substring of the store's own label — so the check
  // has to be that the segment's TEXT is the label, not that the string "all" is absent.
  it("names the legacy store by its label, never by its sentinel", () => {
    const html = render({ ...FULL, agent: LEGACY_AGENT, section: "files" });
    expect(html).toContain(`title="${t.legacyStore.entryLabel}"`);
    expect(html).not.toContain(`title="${LEGACY_AGENT}"`);
  });

  it("draws nothing for a caller with no authority", () => {
    expect(render({ authority: { hasScopes: false, canEditBranding: false } })).toBe("");
  });

  // Branding is instance-wide: one crumb, and it is where you are.
  it("gives branding a single current segment", () => {
    const html = render({ root: "branding" });
    expect(html).toContain(t.shell.branding);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(t.columns.headings.agents + t.columns.hintSuffix);
  });
});
