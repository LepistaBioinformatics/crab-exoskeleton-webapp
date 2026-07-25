"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  listRegisteredModels,
  registerModel,
  deleteRegisteredModel,
  applyRegisteredModel,
  type RegisteredModel,
} from "@/lib/registeredModels";
import { ALL_AGENTS, listSubscriptionUsers, type ScopeRef, type UserRef } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

const emptyForm = { provider: "", name: "", model: "", api_base: "", api_key: "" };
const modelKey = (provider: string, name: string) => `${provider}|${name}`;

// A registry entry always belongs to exactly one agent's catalog, so the agent it
// came from travels with it — that is what makes the aggregated "all agents" view
// able to delete and assign correctly.
interface OwnedModel {
  agent: string;
  model: RegisteredModel;
}

// Admin per-agent model registry + per-user assignment. Register a model
// (definition + key) into an agent's catalog, then assign it to individual users
// of the selected subscription, one by one.
//
// `target` is the shared agent picker's value (see agent-target-select.tsx). Unlike
// the shared-content tabs, ALL_AGENTS here is an **aggregated read**, not a write
// target: a catalog entry and its API key live in one agent's config, so the
// register form always names a single agent. Assignment likewise uses each user's
// OWN agent, which is the only catalog their workspace can resolve a model from.
export default function ModelRegistryPanel({
  scope,
  agents,
  target,
}: {
  scope: ScopeRef;
  agents: string[];
  target: string;
}) {
  const [models, setModels] = useState<OwnedModel[] | null>(null);
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  // Which agent's catalog a NEW model goes into. Only surfaced while the target is
  // ALL_AGENTS; otherwise the target itself is the destination.
  const [formAgent, setFormAgent] = useState<string>("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const aggregated = target === ALL_AGENTS;

  // Reads every catalog in range, tagging each entry with the agent it came from.
  // The agent list is resolved inside so the dependencies are exactly the two
  // inputs, with no derived array to memoize.
  const loadModels = useCallback(async (): Promise<OwnedModel[]> => {
    const inRange = target === ALL_AGENTS ? agents : [target];
    const perAgent = await Promise.all(
      inRange.map(async (a) => (await listRegisteredModels(a)).map((model) => ({ agent: a, model }))),
    );
    return perAgent.flat();
  }, [target, agents]);

  const refreshModels = () =>
    loadModels()
      .then(setModels)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setError(null);
    loadModels()
      .then((m) => !cancelled && setModels(m))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  // Keep the register form's destination valid as the target and the agent list
  // settle: it follows a single-agent target, and in the aggregated view it keeps
  // whatever the admin picked as long as that agent still exists.
  useEffect(() => {
    if (!aggregated) {
      setFormAgent(target);
      return;
    }
    setFormAgent((prev) => (prev && agents.includes(prev) ? prev : agents[0] ?? ""));
  }, [aggregated, target, agents]);

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

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const f = {
      provider: form.provider.trim(),
      name: form.name.trim(),
      model: form.model.trim(),
      api_base: form.api_base.trim(),
      api_key: form.api_key,
    };
    if (!f.provider || !f.name || !f.model || !f.api_base || !f.api_key) {
      setError("Fill provider, name, model, api_base and api_key.");
      return;
    }
    if (!formAgent) {
      setError("Pick the agent whose catalog this model belongs to.");
      return;
    }
    await run(async () => {
      await registerModel(formAgent, f);
      setForm(emptyForm);
      setShowAdd(false);
      await refreshModels();
    });
  }

  // A user's workspace can only resolve a model from its OWN agent's catalog, so a
  // row offers exactly those and applies with that agent.
  function modelsForUser(user: UserRef): OwnedModel[] {
    return (models ?? []).filter((m) => m.agent === user.role);
  }

  async function onApply(user: UserRef) {
    const sel = pick[user.accId];
    if (!sel || !user.role || scope.kind !== "subscription" || !scope.subsAccId) return;
    const [provider, name] = sel.split("|");
    await run(async () => {
      await applyRegisteredModel(user.role!, {
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId!,
        userAccId: user.accId,
        provider,
        name,
      });
      setApplied((prev) => ({ ...prev, [user.accId]: name }));
    });
  }

  // In the aggregated view every user of the subscription is listed (each with its
  // own agent's models); with a single agent targeted, only that agent's users are.
  const listedUsers = (users ?? []).filter((u) => aggregated || u.role === target);

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert severity="error">{error}</Alert>}

      {agents.length === 0 && (
        <Alert severity="info">
          No agents reported by the gateway, so there is nothing to register models for.
        </Alert>
      )}

      {/* Registry */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
          <span className="flex-1 font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {aggregated ? "Registered models — all agents" : `Registered models — ${target}`}
          </span>
          <Button
            variant="text"
            size="sm"
            className="gap-1.5 px-1 text-accent"
            disabled={agents.length === 0}
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus size={16} />
            Register model
          </Button>
        </div>

        {showAdd && (
          <form onSubmit={onAdd} className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
            {aggregated && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-muted">Register into</span>
                <select
                  className={selectClass}
                  value={formAgent}
                  onChange={(e) => setFormAgent(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-fg-muted">
                  A model and its key live in one agent&apos;s catalog, so a new entry needs a single
                  agent even while you are viewing all of them.
                </span>
              </label>
            )}
            <Input inputSize="sm" placeholder="provider (e.g. zhipu)" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            <Input inputSize="sm" placeholder="model_name (e.g. glm-4.7)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input inputSize="sm" placeholder="litellm model (e.g. glm-4.7)" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <Input inputSize="sm" placeholder="api_base (e.g. https://open.bigmodel.cn/api/paas/v4)" value={form.api_base} onChange={(e) => setForm({ ...form, api_base: e.target.value })} />
            <Input inputSize="sm" type="password" autoComplete="off" placeholder="api_key (write-only)" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="text" size="sm" onClick={() => { setShowAdd(false); setForm(emptyForm); }}>
                Cancel
              </Button>
              <Button type="submit" variant="filled" size="sm" disabled={busy}>
                {busy ? "Saving…" : "Register"}
              </Button>
            </div>
          </form>
        )}

        {models === null && !error ? (
          <div className="flex justify-center py-3">
            <Spinner size={18} />
          </div>
        ) : models && models.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            {aggregated
              ? "No models registered for any agent yet."
              : `No models registered for ${target} yet.`}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {models?.map((m) => (
              <li
                key={`${m.agent}|${modelKey(m.model.provider, m.model.name)}`}
                className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-xs text-fg">{m.model.name}</span>
                  <span className="truncate text-[11px] text-fg-muted">
                    {m.model.provider} · {m.model.api_base}
                  </span>
                </div>
                {aggregated && <Badge tone="accent">{m.agent}</Badge>}
                {m.model.has_key && <Badge tone="neutral">key</Badge>}
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${m.model.name} from ${m.agent}`}
                  title="Delete"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await deleteRegisteredModel(m.agent, m.model.provider, m.model.name);
                      await refreshModels();
                    })
                  }
                >
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Assignment */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Assign to users
          </span>
        </div>

        {scope.kind !== "subscription" ? (
          <p className="py-2 text-sm text-fg-muted">Select a subscription on the left to assign models to its users.</p>
        ) : !models || models.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">Register a model first.</p>
        ) : users === null ? (
          <div className="flex justify-center py-3">
            <Spinner size={18} />
          </div>
        ) : listedUsers.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            {aggregated ? (
              "No users have a workspace under this subscription yet (they must start a chat first)."
            ) : (
              <>
                No users have a <span className="font-mono">{target}</span> workspace yet (they must
                start a chat first).
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {listedUsers.map((u) => {
              const options = modelsForUser(u);
              return (
                <li key={`${u.role}|${u.accId}`} className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={u.accId}>
                    {u.name || u.email || u.accId}
                  </span>
                  {aggregated && u.role && <Badge tone="accent">{u.role}</Badge>}
                  {applied[u.accId] && <Badge tone="accent">set: {applied[u.accId]}</Badge>}
                  <select
                    className="h-9 rounded-lg border border-brand bg-surface px-2 text-xs text-fg"
                    value={pick[u.accId] ?? ""}
                    disabled={options.length === 0}
                    onChange={(e) => setPick((prev) => ({ ...prev, [u.accId]: e.target.value }))}
                  >
                    <option value="" disabled>
                      {options.length === 0 ? "no models for this agent" : "model…"}
                    </option>
                    {options.map((m) => (
                      <option
                        key={modelKey(m.model.provider, m.model.name)}
                        value={modelKey(m.model.provider, m.model.name)}
                      >
                        {m.model.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="tonal" size="sm" disabled={busy || !pick[u.accId]} onClick={() => onApply(u)}>
                    Apply
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
