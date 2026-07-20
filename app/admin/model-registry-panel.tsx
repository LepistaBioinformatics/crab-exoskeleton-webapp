"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INSTANCES, type Instance } from "@/lib/mycelium";
import {
  listRegisteredModels,
  registerModel,
  deleteRegisteredModel,
  applyRegisteredModel,
  type RegisteredModel,
} from "@/lib/registeredModels";
import { listSubscriptionUsers, type ScopeRef, type UserRef } from "@/lib/admin";
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

// Admin per-agent model registry + per-user assignment. Register a model
// (definition + key) for an agent (alpha/beta separately), then assign it to
// individual users of the selected subscription, one by one.
export default function ModelRegistryPanel({ scope }: { scope: ScopeRef }) {
  const [agent, setAgent] = useState<Instance>(INSTANCES[0]);
  const [models, setModels] = useState<RegisteredModel[] | null>(null);
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const refreshModels = () =>
    listRegisteredModels(agent)
      .then(setModels)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setError(null);
    listRegisteredModels(agent)
      .then((m) => !cancelled && setModels(m))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [agent]);

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
    await run(async () => {
      await registerModel(agent, f);
      setForm(emptyForm);
      setShowAdd(false);
      await refreshModels();
    });
  }

  async function onApply(user: UserRef) {
    const sel = pick[user.accId];
    if (!sel || scope.kind !== "subscription" || !scope.subsAccId) return;
    const [provider, name] = sel.split("|");
    await run(async () => {
      await applyRegisteredModel(agent, {
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId!,
        userAccId: user.accId,
        provider,
        name,
      });
      setApplied((prev) => ({ ...prev, [user.accId]: name }));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg-muted">Agent</span>
        <select className={selectClass} value={agent} onChange={(e) => setAgent(e.target.value as Instance)}>
          {INSTANCES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Registry */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
          <span className="flex-1 font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Registered models — {agent}
          </span>
          <Button variant="text" size="sm" className="gap-1.5 px-1 text-accent" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} />
            Register model
          </Button>
        </div>

        {showAdd && (
          <form onSubmit={onAdd} className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
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
          <p className="py-2 text-sm text-fg-muted">No models registered for {agent} yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {models?.map((m) => (
              <li key={modelKey(m.provider, m.name)} className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-xs text-fg">{m.name}</span>
                  <span className="truncate text-[11px] text-fg-muted">{m.provider} · {m.api_base}</span>
                </div>
                {m.has_key && <Badge tone="neutral">key</Badge>}
                <IconButton variant="ghost" size="sm" aria-label={`Delete ${m.name}`} title="Delete" disabled={busy} onClick={() => run(async () => { await deleteRegisteredModel(agent, m.provider, m.name); await refreshModels(); })}>
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
        ) : users.filter((u) => u.role === agent).length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            No users have a <span className="font-mono">{agent}</span> workspace yet (they must start a chat first).
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {users
              .filter((u) => u.role === agent)
              .map((u) => (
              <li key={u.accId} className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-fg" title={u.accId}>
                  {u.name || u.email || u.accId}
                </span>
                {applied[u.accId] && <Badge tone="accent">set: {applied[u.accId]}</Badge>}
                <select
                  className="h-9 rounded-lg border border-brand bg-surface px-2 text-xs text-fg"
                  value={pick[u.accId] ?? ""}
                  onChange={(e) => setPick((prev) => ({ ...prev, [u.accId]: e.target.value }))}
                >
                  <option value="" disabled>
                    model…
                  </option>
                  {models.map((m) => (
                    <option key={modelKey(m.provider, m.name)} value={modelKey(m.provider, m.name)}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button variant="tonal" size="sm" disabled={busy || !pick[u.accId]} onClick={() => onApply(u)}>
                  Apply
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
