import type { AdminScope, ScopeRef } from "@/lib/admin";

// THE NAVIGATION MODEL of the admin console: which top-level items a caller has,
// which step of the selection they are on, and how the selected scope is written to
// and read back from the URL.
//
// React-free, for the same reason `agent-scope.ts` is: the suite runs
// `environment: "node"`, and this is where a screen that asks for two things in
// sequence goes quietly wrong. Every rule here has a case in `admin-nav.test.ts`.

// WHICH WORLD, now that there are two rather than three. `agents` and `members` were
// separate modes; they are one menu entered by one selection, and `members` is a
// section of it. `branding` stays apart because it is instance-wide — it has no scope
// and no agent, which is why it needs no gate.
export type RailItem = "workspaces" | "branding";

export interface Authority {
  /** At least one manageable tenant or subscription. */
  hasScopes: boolean;
  canEditBranding: boolean;
}

// `hasSubscriptions` is deliberately NOT here. It used to decide whether the Members
// MODE was offered to a caller. Members is now a section of whatever scope is
// selected, so the question is answered per selection — a tenant scope shows the
// section blocked, naming what it needs (spec FR-5.4) — and a caller-level flag would
// be a second, weaker answer to a question nobody asks any more.

// The items this caller can actually use. An item they cannot use is ABSENT rather
// than disabled: a control that exists only to refuse is worse than one that is not
// there. Unlike the mode bar this replaced, the rail is drawn even with a single item
// — it is the shell, and it carries the brand header and the footer regardless.
export function railItems(a: Authority): RailItem[] {
  const items: RailItem[] = [];
  if (a.hasScopes) items.push("workspaces");
  if (a.canEditBranding) items.push("branding");
  return items;
}

// The selected scope as a query-string value.
//
// The shape is `scopeKey`'s minus the agent segment — the agent has its own parameter,
// and one address carrying both would make `?agent=` and `?scope=` able to disagree.
// Keeping the two shapes alike means an admin reading a URL sees the same vocabulary
// the code uses.
//
// A subscription with no `subsAccId` cannot be addressed as one, so it encodes as its
// tenant. That combination should not reach here, but the alternative — emitting
// `s:<tenant>:` — is an address that resolves to nothing and would silently drop the
// admin back to the scope step with no way to tell why.
export function encodeScope(scope: ScopeRef): string {
  return scope.kind === "subscription" && scope.subsAccId
    ? `s:${scope.tenantId}:${scope.subsAccId}`
    : `t:${scope.tenantId}`;
}

// The scope a `?scope=` names, RESOLVED AGAINST WHAT THE CALLER MANAGES.
//
// Resolution is not parsing. The query string is user-editable and survives a
// revocation between visits, so a value that parses perfectly well can still name a
// scope this caller has no authority over. Both cases yield null — the scope step,
// never a working view whose header names a scope the admin cannot write to. Same rule
// and same reason as `resolveAgent`.
export function resolveScope(
  raw: string | null | undefined,
  scopes: AdminScope[],
): ScopeRef | null {
  if (!raw) return null;
  const match = scopes.find((s) => encodeScope(s) === raw);
  if (!match) return null;
  return match.kind === "subscription"
    ? { kind: "subscription", tenantId: match.tenantId, subsAccId: match.subsAccId }
    : { kind: "tenant", tenantId: match.tenantId };
}


// The state where the console has exactly one thing to offer and no obvious reason why:
// branding rights, no manageable scope.
//
// It has to be NAMED rather than left implicit, because it is indistinguishable from a
// broken screen. Branding is instance-wide and needs no scope, so it survives the
// filter; every workspace section needs one, so none of them do. An admin who reaches
// /admin and finds a single item they did not ask for reads that as the screen failing,
// not as an answer about their authority -- which is exactly what happened.
export function brandingOnly(a: Authority): boolean {
  return !a.hasScopes && a.canEditBranding;
}

// THE TENANT whose subscriptions column is open.
//
// It needs an address of its own because selecting a tenant is a real state: the
// subscriptions column is showing, and nothing in it has been chosen yet. `?scope=` cannot
// carry that — it is the answer to the question the column is still asking.
export function encodeTenant(tenantId: string): string {
  return tenantId;
}

// `?tenant=` resolved against the tenants the caller actually administers. Unknown yields
// null and the column simply does not open, for the same reason every other resolver here
// works that way: the query string is user-editable and outlives a revoked scope.
export function resolveTenant(
  raw: string | null | undefined,
  scopes: AdminScope[],
): string | null {
  if (!raw) return null;
  return scopes.some((s) => s.tenantId === raw) ? raw : null;
}

// WHICH TENANT IS OPEN, from the two parameters that can both claim to say.
//
// `?scope=` wins whenever it resolves: a selected scope belongs to exactly one tenant, so
// a `?tenant=` naming a different one is stale or hand-edited, and honouring it would draw
// a subscriptions column that does not contain the selected row. `?tenant=` decides only
// while no scope is selected, which is the state it exists for.
export function openTenant(
  scope: ScopeRef | null,
  rawTenant: string | null | undefined,
  scopes: AdminScope[],
): string | null {
  if (scope) return scope.tenantId;
  return resolveTenant(rawTenant, scopes);
}

// The distinct tenants among the caller's scopes, first-seen order, with the display name
// when one resolved. Order is preserved rather than sorted so the column is stable across
// reloads — /scopes returns a stable order and re-sorting here would fight it.
export function tenantsOf(scopes: AdminScope[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const s of scopes) {
    const found = out.find((t) => t.id === s.tenantId);
    if (!found) out.push({ id: s.tenantId, name: s.tenantName ?? s.tenantId });
    else if (s.tenantName && found.name === found.id) found.name = s.tenantName;
  }
  return out;
}
