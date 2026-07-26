"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getModelDefault,
  setModelDefault,
  clearModelDefault,
  setModelAssignment,
  clearModelAssignment,
  listModelAssignments,
  assignmentKey,
  pinnedModel,
  defaultOptions,
  type DefaultScope,
  type InventoryModel,
  type ModelAssignment,
  type ScopeDefault,
} from "@/lib/models";
import { listSubscriptionUsers, type ScopeRef, type UserRef } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

const selectClass = "h-9 rounded-lg border border-brand bg-surface px-2 text-xs text-fg";

// The level -> DefaultScope derivation, extracted and tested (see
// model-defaults-panel.test.ts) rather than left as an inline ladder in the
// component body: it's exactly the kind of branching that hides a desync bug,
// and Task 20's chain-editor `key` fix showed that shape is easy to miss without
// a test that exercises the target-changed case directly.
export function resolveDefaultScope(level: DefaultScope["kind"], scope: ScopeRef): DefaultScope | null {
  if (level === "global") return { kind: "global" };
  if (level === "agent") return { kind: "agent" };
  if (level === "subscription") {
    return scope.kind === "subscription" && scope.subsAccId
      ? { kind: "subscription", tenantId: scope.tenantId, subsAccId: scope.subsAccId }
      : null;
  }
  return scope.tenantId ? { kind: "tenant", tenantId: scope.tenantId } : null;
}

// Scope defaults plus per-user pins. A pin wins over every default (the proxy's
// cascade is user > subscription > tenant > agent > global), so the UI has to make
// the difference between a pin and a cascade visible.
export default function ModelDefaultsPanel({
  scope,
  routed,
  models,
}: {
  scope: ScopeRef;
  routed: string;
  models: InventoryModel[];
}) {
  const [current, setCurrent] = useState<ScopeDefault | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  // The STORED pins, keyed "<agent>|<userAccId>". Without reading these the panel
  // renders every user as "inherited from scope" even when explicitly pinned, so an
  // admin cannot see who is pinned, or to what, or that "Unpin" means anything.
  const [assignments, setAssignments] = useState<Record<string, ModelAssignment>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assignable = models.filter((m) => m.status !== "disabled");

  // Which cascade level the default control addresses. global and agent are
  // instance-wide (the proxy gates them at proxy-admin); tenant and subscription
  // follow the scope tree on the left. Without this selector there is no way to set
  // an instance-wide default at all, and a fresh install with no scope default
  // refuses to provision every new workspace.
  const [level, setLevel] = useState<DefaultScope["kind"]>(
    scope.kind === "subscription" ? "subscription" : "tenant",
  );

  // Resync when the admin navigates to a different scope in the tree. Without
  // this, a level picked for the previous scope stays selected — and if it's
  // still satisfiable in the new scope (e.g. "tenant" survives moving from that
  // tenant into one of its subscriptions), the panel silently reads and writes
  // the wrong-scope default: the dropdown still says "tenant" while the
  // per-user pins below it show one subscription's users. Same
  // stale-state-across-targets shape as FallbackEditor's missing `key`; the fix
  // here is a resync effect rather than a remount, since this component must
  // keep reacting to prop changes in place (see its other effects below). Scoped
  // to scope *identity* so it cannot fight a manual level choice within one scope.
  useEffect(() => {
    setLevel(scope.kind === "subscription" ? "subscription" : "tenant");
  }, [scope.kind, scope.tenantId, scope.subsAccId]);

  const defaultScope = resolveDefaultScope(level, scope);

  // One serialized dependency instead of picking fields off a union: the scope's
  // identity IS its serialization, and casting to read optional fields would be a
  // silent hazard the next time the union grows a member.
  const scopeKey = defaultScope ? JSON.stringify(defaultScope) : "";

  const load = useCallback(async () => {
    if (!routed || !scopeKey) {
      setLoaded(true);
      return;
    }
    setCurrent(await getModelDefault(routed, JSON.parse(scopeKey) as DefaultScope));
    setLoaded(true);
  }, [routed, scopeKey]);

  useEffect(() => {
    setLoaded(false);
    load().catch((e: Error) => {
      setError(e.message);
      setLoaded(true);
    });
  }, [load]);

  useEffect(() => {
    if (scope.kind !== "subscription" || !scope.subsAccId) {
      setUsers(null);
      return;
    }
    let cancelled = false;
    setUsers(null);
    listSubscriptionUsers(scope.tenantId, scope.subsAccId)
      .then((u) => !cancelled && setUsers(u))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.tenantId, scope.subsAccId]);

  const loadAssignments = useCallback(async () => {
    if (!routed || scope.kind !== "subscription" || !scope.subsAccId) {
      setAssignments({});
      return;
    }
    setAssignments(
      await listModelAssignments(routed, {
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId,
      }),
    );
  }, [routed, scope.kind, scope.tenantId, scope.subsAccId]);

  useEffect(() => {
    // A failure here must not blank the panel: the pins are an indicator, and the
    // pin/unpin controls still work without them.
    loadAssignments().catch(() => setAssignments({}));
  }, [loadAssignments]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert severity="error">{error}</Alert>}

      <div className="flex flex-col gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Default model
        </span>
        <label className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Level</span>
          <select className={selectClass} value={level} disabled={busy}
            onChange={(e) => setLevel(e.target.value as DefaultScope["kind"])}>
            <option value="global">global (whole instance)</option>
            <option value="agent">agent (this agent, all tenants)</option>
            <option value="tenant">tenant</option>
            <option value="subscription">subscription</option>
          </select>
        </label>
        <p className="text-[11px] text-fg-muted">
          Resolution order, most specific first: per-user pin → subscription → tenant → agent → global.
        </p>
        {!defaultScope ? (
          <p className="py-2 text-sm text-fg-muted">
            Select a {level} on the left to set its default.
          </p>
        ) : !loaded ? (
          <div className="flex justify-center py-3">
            <Spinner size={18} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select className={selectClass} value={current?.model_name ?? ""} disabled={busy}
              onChange={(e) =>
                run(async () => {
                  await setModelDefault(routed, defaultScope, e.target.value);
                  await load();
                })
              }>
              <option value="" disabled>
                no default set
              </option>
              {/* The current default is offered even when it is no longer active:
                  filtering to active models made a deprecated default match no
                  option, so the control read "no default set" while one WAS set. */}
              {defaultOptions(models, current?.model_name ?? null).map((o) => (
                <option key={o.name} value={o.name}>
                  {o.inactive ? `${o.name} (retired — current default)` : o.name}
                </option>
              ))}
            </select>
            {current && (
              <Button variant="text" size="sm" disabled={busy}
                onClick={() =>
                  run(async () => {
                    await clearModelDefault(routed, defaultScope);
                    await load();
                  })
                }>
                Clear
              </Button>
            )}
          </div>
        )}
        <p className="text-[11px] text-fg-muted">
          New workspaces at this level land on this model unless a more specific level or a per-user
          pin overrides it. Setting a <span className="font-mono">global</span> or{" "}
          <span className="font-mono">agent</span> default requires instance-admin privileges, and takes
          effect on each workspace&apos;s next start rather than restarting the fleet.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Per-user pins
        </span>
        {scope.kind !== "subscription" ? (
          <p className="py-2 text-sm text-fg-muted">Select a subscription to pin models to its users.</p>
        ) : users === null ? (
          <div className="flex justify-center py-3">
            <Spinner size={18} />
          </div>
        ) : users.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            No users have a workspace under this subscription yet (they must start a chat first).
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {users.map((u) => {
              const stored = assignments[assignmentKey(u.role ?? routed, u.accId)];
              const pinned = pinnedModel(stored);
              return (
                <li key={`${u.role}|${u.accId}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={u.accId}>
                    {u.name || u.email || u.accId}
                  </span>
                  {u.role && <Badge tone="accent">{u.role}</Badge>}
                  {/* What this user actually resolves to today, and whether it is a
                      pin or the cascade. Both halves matter: "pinned" says a scope
                      change will NOT move them, which is the whole reason a pin
                      exists. */}
                  {pinned ? (
                    <Badge tone="accent">pinned · {pinned}</Badge>
                  ) : stored ? (
                    <Badge tone="neutral">inherited · {stored.model_name}</Badge>
                  ) : (
                    <Badge tone="neutral">not materialized yet</Badge>
                  )}
                  <select className={selectClass} value={pick[u.accId] ?? pinned ?? ""} disabled={busy}
                    onChange={(e) => setPick((prev) => ({ ...prev, [u.accId]: e.target.value }))}>
                    <option value="" disabled>
                      inherited from scope
                    </option>
                    {assignable.map((m) => (
                      <option key={m.model_name} value={m.model_name}>
                        {m.model_name}
                      </option>
                    ))}
                  </select>
                  <Button variant="tonal" size="sm" disabled={busy || !(pick[u.accId] ?? pinned)}
                    onClick={() =>
                      run(async () => {
                        await setModelAssignment(
                          u.role ?? routed,
                          { tenantId: scope.tenantId, subsAccId: scope.subsAccId!, userAccId: u.accId },
                          pick[u.accId] ?? pinned!,
                        );
                        await loadAssignments();
                      })
                    }>
                    Pin
                  </Button>
                  <Button variant="text" size="sm" disabled={busy || !stored}
                    onClick={() =>
                      run(async () => {
                        await clearModelAssignment(u.role ?? routed, {
                          tenantId: scope.tenantId,
                          subsAccId: scope.subsAccId!,
                          userAccId: u.accId,
                        });
                        setPick((prev) => ({ ...prev, [u.accId]: "" }));
                        await loadAssignments();
                      })
                    }>
                    Unpin
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
