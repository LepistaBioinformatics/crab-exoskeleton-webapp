"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  listModels,
  modelCatalog,
  createModel,
  updateModel,
  deleteModel,
  setModelStatus,
  deprecateModel,
  reorderModels,
  splitInventory,
  reorderPayload,
  draftFromCatalog,
  draftFromDuplicate,
  emptyDraft,
  describeError,
  type CatalogEntry,
  type DisplayError,
  type InventoryModel,
  type ModelDraft,
} from "@/lib/models";
import { ALL_AGENTS, type ScopeRef } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ModelRow } from "./model-row";
import ModelDefaultsPanel from "./model-defaults-panel";
import { FallbackEditor } from "./fallback-editor";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

const CUSTOM = "__custom__";

// Admin model inventory. The inventory is PROXY-WIDE — not per agent — so the
// agent picker only decides which service the request is routed through, and
// ALL_AGENTS resolves to the first agent rather than fanning out.
export default function ModelRegistryPanel({
  scope,
  agents,
  target,
}: {
  scope: ScopeRef;
  agents: string[];
  target: string;
}) {
  const routed = target === ALL_AGENTS ? agents[0] ?? "" : target;

  const [models, setModels] = useState<InventoryModel[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [error, setError] = useState<DisplayError | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ModelDraft>(emptyDraft());
  // editing holds the model_name + version being edited; null means "create".
  const [editing, setEditing] = useState<{ name: string; version: number } | null>(null);
  // deprecating holds the model being retired while the admin picks its
  // replacement. An inline picker rather than window.prompt: the replacement must
  // be an existing ACTIVE model, and a free-text prompt cannot offer that list —
  // the admin would type a name and get a 400 with no way to see the valid ones.
  const [deprecating, setDeprecating] = useState<InventoryModel | null>(null);
  const [replacement, setReplacement] = useState("");
  // chainFor holds the model whose fallback chain editor is open. Opening the
  // edit form closes it and vice versa: two panels open on different models at
  // once is how someone saves a chain onto the wrong model.
  const [chainFor, setChainFor] = useState<InventoryModel | null>(null);

  const refresh = useCallback(async () => {
    if (!routed) return;
    setModels(await listModels(routed));
  }, [routed]);

  useEffect(() => {
    if (!routed) return;
    let cancelled = false;
    setModels(null);
    setError(null);
    listModels(routed)
      .then((m) => !cancelled && setModels(m))
      .catch((e: Error) => !cancelled && setError(describeError(e)));
    modelCatalog(routed)
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => !cancelled && setCatalog([]));
    return () => {
      cancelled = true;
    };
  }, [routed]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  // Opening the edit form closes the chain editor and vice versa (see openChain
  // below): two panels open on different models at once is how someone saves a
  // chain onto the wrong model.
  function openCreate() {
    setChainFor(null);
    setDraft(emptyDraft());
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(m: InventoryModel) {
    setChainFor(null);
    // api_key stays blank: the API never returns it, and leaving it blank means
    // saving keeps the stored key rather than clearing it.
    setDraft({
      model_name: m.model_name,
      provider: m.provider,
      model: m.model,
      api_base: m.api_base ?? "",
      auth_method: m.auth_method ?? "",
      api_key: "",
      fallbacks: [...m.fallbacks],
      // Carried opaquely. PUT is a full replace for every readable field, so a
      // draft that dropped extra_body would silently clear it on an unrelated
      // edit — the MiniMax catalog entry's reasoning_split is a real instance.
      extra_body: m.extra_body,
    });
    setEditing({ name: m.model_name, version: m.version });
    setShowForm(true);
  }

  function openDuplicate(m: InventoryModel) {
    setChainFor(null);
    setDraft(draftFromDuplicate(m));
    setEditing(null);
    setShowForm(true);
  }

  function openChain(m: InventoryModel) {
    setShowForm(false);
    setChainFor(m);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.model_name.trim() || !draft.provider.trim() || !draft.model.trim()) {
      setError({ message: "Fill model name, provider and model.", referrers: [] });
      return;
    }
    await run(async () => {
      if (editing) {
        await updateModel(routed, editing.name, editing.version, draft);
      } else {
        await createModel(routed, draft);
      }
      setShowForm(false);
      setDraft(emptyDraft());
      setEditing(null);
      await refresh();
    });
  }

  function onCatalogPick(value: string) {
    if (value === CUSTOM) {
      setDraft((d) => ({ ...d, provider: "", model: "", api_base: "", auth_method: "" }));
      return;
    }
    const entry = catalog[Number(value)];
    if (!entry) return;
    // Keep whatever name and key the admin already typed; only the definition
    // fields are prefilled.
    setDraft((d) => ({ ...draftFromCatalog(entry), model_name: d.model_name, api_key: d.api_key, fallbacks: d.fallbacks }));
  }

  const { active, inactive } = splitInventory(models ?? []);

  function move(list: InventoryModel[], index: number, delta: number) {
    const order = reorderPayload(list, inactive, index, delta);
    if (!order) return;
    void run(async () => {
      await reorderModels(routed, order);
      await refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert severity="error">
          {error.message}
          {error.referrers.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px]">
              {error.referrers.map((r) => (
                <li key={`${r.kind}:${r.id}`}>
                  {r.kind}: <span className="font-mono">{r.id}</span>
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {!routed && (
        <Alert severity="info">No agents reported by the gateway, so the inventory cannot be reached.</Alert>
      )}

      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Model inventory
        </span>
        <Button variant="text" size="sm" className="gap-1.5 px-1 text-accent" disabled={!routed} onClick={openCreate}>
          <Plus size={16} />
          Register model
        </Button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">Start from a known model</span>
            <select className={selectClass} defaultValue="" onChange={(e) => onCatalogPick(e.target.value)}>
              <option value="" disabled>
                pick one to prefill…
              </option>
              {catalog.map((c, i) => (
                <option key={`${c.provider}|${c.model}`} value={String(i)}>
                  {c.provider} · {c.model}
                </option>
              ))}
              <option value={CUSTOM}>custom (fill everything by hand)</option>
            </select>
          </label>
          <Input inputSize="sm" placeholder="model name (unique, e.g. team-gpt)" value={draft.model_name}
            disabled={!!editing}
            onChange={(e) => setDraft({ ...draft, model_name: e.target.value })} />
          <Input inputSize="sm" placeholder="provider (e.g. openai)" value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
          <Input inputSize="sm" placeholder="model (e.g. gpt-5.4)" value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          <Input inputSize="sm" placeholder="api_base" value={draft.api_base}
            onChange={(e) => setDraft({ ...draft, api_base: e.target.value })} />
          <Input inputSize="sm" placeholder="auth_method (optional, e.g. oauth)" value={draft.auth_method}
            onChange={(e) => setDraft({ ...draft, auth_method: e.target.value })} />
          <Input inputSize="sm" type="password" autoComplete="off"
            placeholder={editing ? "api_key (leave blank to keep the stored key)" : "api_key (write-only)"}
            value={draft.api_key}
            onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="text" size="sm"
              onClick={() => { setShowForm(false); setDraft(emptyDraft()); setEditing(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="filled" size="sm" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Register"}
            </Button>
          </div>
        </form>
      )}

      {models === null && !error ? (
        <div className="flex justify-center py-3">
          <Spinner size={18} />
        </div>
      ) : (
        <>
          <Section title="Active">
            {active.length === 0 ? (
              <p className="py-2 text-sm text-fg-muted">No active models. Register one to get started.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {active.map((m, i) => (
                  <ModelRow key={m.model_name} model={m} busy={busy}
                    onMoveUp={i === 0 ? undefined : () => move(active, i, -1)}
                    onMoveDown={i === active.length - 1 ? undefined : () => move(active, i, 1)}
                    onEdit={openEdit} onDuplicate={openDuplicate}
                    onToggle={(mm) => run(async () => {
                      await setModelStatus(routed, mm.model_name, mm.version, "disabled");
                      await refresh();
                    })}
                    onDeprecate={(mm) => { setDeprecating(mm); setReplacement(""); }}
                    onDelete={(mm) => run(async () => {
                      await deleteModel(routed, mm.model_name);
                      await refresh();
                    })}
                    onEditChain={openChain} />
                ))}
              </ul>
            )}
            <p className="text-[11px] text-fg-muted">
              This order is for reading only. A model&apos;s fallback chain is the{" "}
              <span className="font-mono">fallbacks</span> list on the model itself.
            </p>

            {deprecating && (
              <div className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
                <span className="text-xs font-medium text-fg-muted">
                  Retire <span className="font-mono">{deprecating.model_name}</span>
                </span>
                <p className="text-[11px] text-fg-muted">
                  Everyone already using it keeps it. New users get the replacement instead.
                </p>
                <select className={selectClass} value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}>
                  <option value="" disabled>
                    replacement for new users…
                  </option>
                  {active
                    .filter((m) => m.model_name !== deprecating.model_name)
                    .map((m) => (
                      <option key={m.model_name} value={m.model_name}>
                        {m.model_name}
                      </option>
                    ))}
                </select>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="text" size="sm"
                    onClick={() => { setDeprecating(null); setReplacement(""); }}>
                    Cancel
                  </Button>
                  <Button variant="filled" size="sm" disabled={busy || !replacement}
                    onClick={() =>
                      run(async () => {
                        await deprecateModel(routed, deprecating.model_name, deprecating.version, replacement);
                        setDeprecating(null);
                        setReplacement("");
                        await refresh();
                      })
                    }>
                    Deprecate
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Inactive">
            {inactive.length === 0 ? (
              <p className="py-2 text-sm text-fg-muted">Nothing disabled or deprecated.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {inactive.map((m) => (
                  <ModelRow key={m.model_name} model={m} busy={busy}
                    onEdit={openEdit} onDuplicate={openDuplicate}
                    onToggle={(mm) => run(async () => {
                      await setModelStatus(routed, mm.model_name, mm.version, "active");
                      await refresh();
                    })}
                    onDeprecate={() => {}}
                    onDelete={(mm) => run(async () => {
                      await deleteModel(routed, mm.model_name);
                      await refresh();
                    })} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {chainFor && (
        <FallbackEditor
          // Keyed on the model name so switching chainFor from one model to
          // another remounts the editor instead of updating it in place — it
          // owns its chain in local state, so without a fresh mount the
          // ordered list would keep showing the PREVIOUS model's chain under
          // the new model's name, and Save would write it onto the wrong model.
          key={chainFor.model_name}
          model={chainFor}
          all={models ?? []}
          busy={busy}
          onSave={(chain) =>
            run(async () => {
              await updateModel(routed, chainFor.model_name, chainFor.version, {
                model_name: chainFor.model_name,
                provider: chainFor.provider,
                model: chainFor.model,
                api_base: chainFor.api_base ?? "",
                auth_method: chainFor.auth_method ?? "",
                api_key: "",
                fallbacks: chain,
                extra_body: chainFor.extra_body,
              });
              setChainFor(null);
              await refresh();
            })
          }
        />
      )}

      {routed && <ModelDefaultsPanel scope={scope} routed={routed} models={models ?? []} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</span>
      {children}
    </div>
  );
}
