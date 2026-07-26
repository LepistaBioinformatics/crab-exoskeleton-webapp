"use client";

import { FormEvent, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  listSharedSecrets,
  setSharedSecret,
  deleteSharedSecret,
  ALL_AGENTS,
  type ScopeRef,
} from "@/lib/admin";
import {
  SECRET_FORMATS,
  SECRET_NAME_RE,
  WEB_PROVIDERS,
  type SecretNames,
  type SecretFormat,
} from "@/lib/secrets";
import { listModels, describeError, type InventoryModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Field, fieldControlClass } from "./field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

const FORMAT_LABEL: Record<SecretFormat, string> = {
  dotenv: "dotenv (.env)",
  json: "json",
  file: "file",
  native: "native (picoclaw search-provider / model key)",
};

// `file` is not env-shaped, so the proxy rejects it at scope level. The other
// three are offered: dotenv/json cascade as sink files, and native writes into
// each workspace's .security.yml — the admin-only path added by
// native-secrets-admin-only.
const SCOPE_FORMATS = SECRET_FORMATS.filter((f) => f !== "file");

// Shared secrets at a scope: write / list-names / delete. Injected as env into
// every container below the scope (FR-5). WRITE-ONLY over the API -- values are
// never listed or retrieved (FR-5.1), only names.
export default function SharedSecretsPanel({ scope }: { scope: ScopeRef }) {
  const [secrets, setSecrets] = useState<SecretNames | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [format, setFormat] = useState<SecretFormat>("dotenv");
  const [nativeKind, setNativeKind] = useState<"web" | "model">("web");
  const [provider, setProvider] = useState<string>(WEB_PROVIDERS[0]);
  const [modelName, setModelName] = useState("");
  const [models, setModels] = useState<InventoryModel[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  // A model_list slot must name a single agent (the proxy rejects it for an
  // all-agents scope): the inventory itself is per-agent, so there is no
  // catalog to offer without one.
  const routedAgent = scope.agent && scope.agent !== ALL_AGENTS ? scope.agent : null;
  const availableModels = models?.filter((m) => m.status !== "disabled") ?? [];

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ fmt: SecretFormat; name: string } | null>(null);

  const refresh = () => listSharedSecrets(scope).then(setSecrets);

  useEffect(() => {
    let cancelled = false;
    setSecrets(null);
    setLoadError(null);
    listSharedSecrets(scope)
      .then((s) => {
        if (!cancelled) setSecrets(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.tenantId, scope.subsAccId, scope.agent]);

  useEffect(() => {
    setModelName("");
    setModels(null);
    setModelsError(null);
    if (!routedAgent) return;
    let cancelled = false;
    listModels(routedAgent)
      .then((m) => !cancelled && setModels(m))
      .catch((e) => !cancelled && setModelsError(describeError(e).message));
    return () => {
      cancelled = true;
    };
  }, [routedAgent]);

  // A native secret addresses a picoclaw slot, not a free-form name. The web
  // family is the fixed `web.<provider>` enum; the model family reads
  // `model_list.<model>.api_keys`, where `<model>` must be a name the
  // inventory (T17's listModels) actually knows -- the proxy validates this
  // slot against the inventory, so a hand-typed name would only 400.
  function targetName(): string {
    if (format !== "native") return name.trim();
    return nativeKind === "web" ? `web.${provider}` : `model_list.${modelName}.api_keys`;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const finalName = targetName();

    if (format !== "native" && !SECRET_NAME_RE.test(finalName)) {
      setSubmitError("Name may only contain letters, numbers, and . _ -");
      return;
    }
    if (format === "native" && nativeKind === "model" && !modelName) {
      setSubmitError("Select a model.");
      return;
    }
    if (!value) {
      setSubmitError("Enter a value.");
      return;
    }

    setSubmitting(true);
    try {
      await setSharedSecret(scope, { format, name: finalName, value });
      setValue("");
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(fmt: SecretFormat, secretName: string) {
    setPendingDelete(null);
    setBusy(secretName);
    setLoadError(null);
    try {
      await deleteSharedSecret(scope, { format: fmt, name: secretName });
      await refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const groups = SECRET_FORMATS.map((fmt) => ({ fmt, names: secrets?.[fmt] ?? [] })).filter(
    (g) => g.names.length > 0,
  );
  const isEmpty = secrets !== null && groups.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-fg-muted">
        Injected as environment into every container below this scope, merged under each user&apos;s
        own secrets. Values are write-only: never shown or retrieved. Writing or deleting restarts
        running containers under the scope.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field
          label="How the agent receives it"
          job="Environment variable, a JSON entry, a file on disk, or a slot in picoclaw's own config."
          htmlFor="s-format"
        >
          <select
            id="s-format"
            className={fieldControlClass()}
            value={format}
            onChange={(e) => setFormat(e.target.value as SecretFormat)}
          >
            {SCOPE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>

        {format === "native" ? (
          <>
            <Field
              label="Which picoclaw setting"
              job="The two config slots a scope admin may write. Everything else in picoclaw's config is off limits."
              htmlFor="s-slot"
            >
              <select
                id="s-slot"
                className={fieldControlClass()}
                value={nativeKind}
                onChange={(e) => setNativeKind(e.target.value as "web" | "model")}
              >
                <option value="web">A web search provider&apos;s key</option>
                <option value="model">A model&apos;s API key</option>
              </select>
            </Field>
            {nativeKind === "web" ? (
              <Field
                label="Which search provider"
                job="Picoclaw's web tool uses whichever provider has a key."
                htmlFor="s-provider"
                consequence={<>Written into every workspace below this scope, on their next start.</>}
              >
                <select
                  id="s-provider"
                  className={fieldControlClass(true)}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {WEB_PROVIDERS.map((pv) => (
                    <option key={pv} value={pv}>
                      {pv}
                    </option>
                  ))}
                </select>
              </Field>
            ) : !routedAgent ? (
              <Alert severity="info">Pick a single agent above to set a model API key.</Alert>
            ) : modelsError ? (
              <Alert severity="error">{modelsError}</Alert>
            ) : models === null ? (
              <div className="flex justify-center py-2">
                <Spinner size={16} />
              </div>
            ) : availableModels.length === 0 ? (
              <Alert severity="info">
                {routedAgent} has no registered models yet — register one in the Model tab first.
              </Alert>
            ) : (
              <Field
                label="Which model"
                job={`Only models registered for ${routedAgent}. A name typed by hand would be rejected.`}
                htmlFor="s-model"
                consequence={
                  <>
                    A key here <b>overrides the one stored on the model itself</b>, for this scope
                    only. Workspaces below this scope that resolve to a different model are skipped.
                  </>
                }
              >
                <select
                  id="s-model"
                  className={fieldControlClass(true)}
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                >
                  <option value="">Select a model…</option>
                  {availableModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.model_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        ) : (
          <Field
            label="Name the agent will read it by"
            job="Exactly as the agent's code expects it — case and underscores included."
            htmlFor="s-name"
          >
            <input
              id="s-name"
              className={fieldControlClass(true)}
              placeholder="SHARED_API_KEY"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}

        <Field
          label="Value"
          job="Write-only. It is never shown or retrieved after you save it."
          htmlFor="s-value"
          consequence={<>Saving restarts the running containers under this scope so they pick it up.</>}
        >
          <input
            id="s-value"
            className={fieldControlClass()}
            type="password"
            autoComplete="off"
            placeholder="paste the value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>

        {submitError && <Alert severity="error">{submitError}</Alert>}

        <Button type="submit" variant="filled" disabled={submitting}>
          {submitting ? "Saving…" : "Save shared secret"}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Set secrets
        </span>
      </div>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {!loadError && secrets === null && (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      )}

      {isEmpty && <p className="py-3 text-sm text-fg-muted">No shared secrets at this scope yet.</p>}

      {groups.map((group) => (
        <div key={group.fmt}>
          <div className="mb-1">
            <Badge tone="neutral">{group.fmt}</Badge>
          </div>
          <ul className="flex flex-col gap-1">
            {group.names.map((secretName) => (
              <li
                key={secretName}
                className="flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                  {secretName}
                </span>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${secretName}`}
                  disabled={busy === secretName}
                  onClick={() => setPendingDelete({ fmt: group.fmt, name: secretName })}
                >
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete shared secret?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed. Containers below this scope restart to drop it.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && onDelete(pendingDelete.fmt, pendingDelete.name)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
