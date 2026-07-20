"use client";

import { useEffect, useState } from "react";
import { Cpu, RotateCcw, User } from "lucide-react";
import {
  listSelectableModels,
  getModelOverride,
  setModelOverride,
  clearModelOverride,
  listUserModels,
  type SelectableModel,
  type ModelOverride,
  type UserModel,
} from "@/lib/adminModels";
import type { ScopeRef } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function modelKey(m: SelectableModel): string {
  return `${m.provider}::${m.name}`;
}

function parseModelKey(key: string): SelectableModel {
  const [provider, name] = key.split("::");
  return { provider, name };
}

// "tenant" -> "the tenant", "subscription" -> "the subscription", etc, for the
// "inherited from ..." caption.
function levelNoun(level: string): string {
  switch (level) {
    case "tenant":
      return "the tenant";
    case "subscription":
      return "the subscription";
    case "user":
      return "the user";
    default:
      return "the agent default";
  }
}

// Model override at a scope (tenant/subscription), plus the per-user overrides
// under a subscription. Cascades user > subscription > tenant > agent default
// (design.md "Override store"); keys never transit this API (CTX-AMO-06) -- we
// only ever handle {provider, name}.
export default function ModelPanel({ scope }: { scope: ScopeRef }) {
  const [models, setModels] = useState<SelectableModel[] | null>(null);
  const [override, setOverride] = useState<ModelOverride | null>(null);
  const [selection, setSelection] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refreshOverride = () =>
    getModelOverride(scope).then((o) => {
      setOverride(o);
      setSelection(modelKey(o));
    });

  useEffect(() => {
    let cancelled = false;
    listSelectableModels()
      .then((m) => {
        if (!cancelled) setModels(m);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOverride(null);
    setError(null);
    getModelOverride(scope)
      .then((o) => {
        if (cancelled) return;
        setOverride(o);
        setSelection(modelKey(o));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.tenantId, scope.subsAccId]);

  async function onApply() {
    if (!selection) return;
    setApplying(true);
    setError(null);
    try {
      await setModelOverride(scope, parseModelKey(selection));
      await refreshOverride();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set the model.");
    } finally {
      setApplying(false);
    }
  }

  async function onReset() {
    setConfirmReset(false);
    setResetting(true);
    setError(null);
    try {
      await clearModelOverride(scope);
      await refreshOverride();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset the model.");
    } finally {
      setResetting(false);
    }
  }

  const overriddenHere = override?.level === scope.kind;
  const dirty = !!override && selection !== modelKey(override);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-fg-muted">
        Cascades to every container below this scope that has no override of its own. Changing the
        model restarts affected containers so they pick it up.
      </p>

      {error && <Alert severity="error">{error}</Alert>}

      {(models === null || override === null) && !error ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : models === null || override === null ? null : (
        <div className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-elevated p-3">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="shrink-0 text-fg-muted" aria-hidden />
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-brand/30 bg-transparent px-2.5 py-1.5 text-sm text-fg focus:outline-none"
            >
              {models.map((m) => (
                <option key={modelKey(m)} value={modelKey(m)}>
                  {m.provider} / {m.name}
                </option>
              ))}
            </select>
            <Badge tone={overriddenHere ? "accent" : "neutral"}>
              {overriddenHere ? "set here" : `inherited from ${levelNoun(override.level)}`}
            </Badge>
          </div>
          <div className="flex justify-end gap-2">
            {overriddenHere && (
              <Button
                variant="text"
                size="sm"
                disabled={resetting}
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={14} aria-hidden />
                {resetting ? "Resetting…" : "Reset to inherited"}
              </Button>
            )}
            <Button variant="filled" size="sm" disabled={applying || !dirty} onClick={onApply}>
              {applying ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      )}

      {scope.kind === "subscription" && scope.subsAccId && (
        <UserModels scope={scope} models={models} />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset to inherited model?"
        message="This scope's override will be cleared and workspaces below it fall back to whatever the level above provides. Affected containers restart to pick it up."
        confirmLabel="Reset"
        onConfirm={onReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function UserModels({
  scope,
  models,
}: {
  scope: ScopeRef;
  models: SelectableModel[] | null;
}) {
  const [users, setUsers] = useState<UserModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listUserModels(scope).then(setUsers);

  useEffect(() => {
    let cancelled = false;
    setUsers(null);
    setError(null);
    listUserModels(scope)
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.tenantId, scope.subsAccId]);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-fg">Per-user overrides</h2>

      {error && <Alert severity="error">{error}</Alert>}

      {(users === null || models === null) && !error ? (
        <div className="flex justify-center py-4">
          <Spinner size={18} />
        </div>
      ) : users === null || models === null ? null : users.length === 0 ? (
        <p className="py-2 text-xs text-fg-muted">No members under this subscription yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {users.map((u) => (
            <UserModelRow key={u.accId} scope={scope} user={u} models={models} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserModelRow({
  scope,
  user,
  models,
  onChanged,
}: {
  scope: ScopeRef;
  user: UserModel;
  models: SelectableModel[];
  onChanged: () => Promise<void>;
}) {
  const [selection, setSelection] = useState(modelKey({ provider: user.provider, name: user.name }));
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resync the dropdown whenever the user's effective model changes underneath
  // us (e.g. after Apply/Reset refreshes the list) -- otherwise the row keeps
  // whatever was selected at mount, which goes stale on reset (dropdown would
  // still show the just-cleared model with Apply wrongly enabled).
  useEffect(() => {
    setSelection(modelKey({ provider: user.provider, name: user.name }));
  }, [user.provider, user.name]);

  const overriddenHere = user.level === "user";
  const dirty = selection !== modelKey({ provider: user.provider, name: user.name });

  async function onApply() {
    if (!selection) return;
    setApplying(true);
    setError(null);
    try {
      await setModelOverride(scope, parseModelKey(selection), user.accId);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set the model.");
    } finally {
      setApplying(false);
    }
  }

  async function onReset() {
    setConfirmReset(false);
    setResetting(true);
    setError(null);
    try {
      await clearModelOverride(scope, user.accId);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset the model.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-2">
      <div className="flex items-center gap-2">
        <User size={14} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-fg" title={user.email || user.accId}>
          {user.email || user.accId}
        </span>
        <Badge tone={overriddenHere ? "accent" : "neutral"}>
          {overriddenHere ? "set here" : `inherited from ${levelNoun(user.level)}`}
        </Badge>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="flex items-center gap-2">
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-brand/30 bg-transparent px-2.5 py-1.5 text-sm text-fg focus:outline-none"
        >
          {models.map((m) => (
            <option key={modelKey(m)} value={modelKey(m)}>
              {m.provider} / {m.name}
            </option>
          ))}
        </select>
        {overriddenHere && (
          <Button variant="text" size="sm" disabled={resetting} onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} aria-hidden />
          </Button>
        )}
        <Button variant="tonal" size="sm" disabled={applying || !dirty} onClick={onApply}>
          {applying ? "Applying…" : "Apply"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset this user's model?"
        message={`"${user.email || user.accId}" falls back to whatever the subscription or tenant provides. Their container restarts to pick it up.`}
        confirmLabel="Reset"
        onConfirm={onReset}
        onCancel={() => setConfirmReset(false)}
      />
    </li>
  );
}
