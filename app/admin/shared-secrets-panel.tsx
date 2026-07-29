"use client";

import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
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
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

const FORMAT_LABEL: Record<SecretFormat, string> = {
  dotenv: "dotenv (.env)",
  json: "json",
  file: "file",
  native: "native",
};

// `file` is not env-shaped, so the proxy rejects it at scope level. The other
// three are offered: dotenv/json cascade as sink files, and native writes into
// each workspace's .security.yml — the admin-only path added by
// native-secrets-admin-only.
const SCOPE_FORMATS = SECRET_FORMATS.filter((f) => f !== "file");

// Shared secrets at a scope: write / list-names / delete. Injected as env into
// every container below the scope (FR-5). WRITE-ONLY over the API -- values are
// never listed or retrieved (FR-5.1), only names.
export default function SharedSecretsPanel({
  scope,
  restartPolicy = DEFAULT_POLICY,
  readOnly = false,
}: {
  scope: ScopeRef;
  // How the resulting container bounce is delivered; chosen once in the admin
  // screen and applied to every write here (restart-control FR-8.1).
  restartPolicy?: RestartPolicy;
  /**
   * Set for the legacy all-agents store. Hides the write form entirely; the name
   * list and DELETE stay, because the legacy entry exists to empty that store.
   */
  readOnly?: boolean;
}) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const errs = useT(errorCopy);
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
      .catch((e) => !cancelled && setModelsError(describeError(e).code));
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
      setSubmitError(t.sharedSecrets.invalidName);
      return;
    }
    if (format === "native" && nativeKind === "model" && !modelName) {
      setSubmitError(t.sharedSecrets.selectModel);
      return;
    }
    if (!value) {
      setSubmitError(t.sharedSecrets.valueRequired);
      return;
    }

    setSubmitting(true);
    try {
      await setSharedSecret(scope, { format, name: finalName, value }, restartPolicy);
      setValue("");
      await refresh();
    } catch (err) {
      setSubmitError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(fmt: SecretFormat, secretName: string) {
    setPendingDelete(null);
    setBusy(secretName);
    setLoadError(null);
    try {
      await deleteSharedSecret(scope, { format: fmt, name: secretName }, restartPolicy);
      await refresh();
    } catch (err) {
      setLoadError(errorText(errs, err instanceof Error ? err.message : null));
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
        {readOnly ? (
          t.legacyStore.readOnlyNote
        ) : (
          <>
            {t.sharedSecrets.injectedAs} Values are write-only: never shown or retrieved. Writing or
            deleting restarts running containers under the scope.
          </>
        )}
      </p>

      {/* The whole write form goes under readOnly — there is no partial version of
          "you may not put anything new in here". Removed from the tree rather than
          hidden with CSS: a display:none form still holds real controls, and Preflight
          is one `[hidden]` override away from putting them back on screen. The name
          list below stays, and so does delete: emptying the legacy store is the point
          of reaching it. */}
      {!readOnly && (
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field
          label={t.sharedSecrets.howReceived}
          job={t.sharedSecrets.howReceivedJob}
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
                {f === "native" ? t.sharedSecrets.formatNative : FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>

        {format === "native" ? (
          <>
            <Field
              label={t.sharedSecrets.whichSetting}
              job={t.sharedSecrets.whichSettingJob}
              htmlFor="s-slot"
            >
              <select
                id="s-slot"
                className={fieldControlClass()}
                value={nativeKind}
                onChange={(e) => setNativeKind(e.target.value as "web" | "model")}
              >
                <option value="web">{t.sharedSecrets.slotWeb}</option>
                <option value="model">{t.sharedSecrets.slotModel}</option>
              </select>
            </Field>
            {nativeKind === "web" ? (
              <Field
                label={t.sharedSecrets.whichSearch}
                job={t.sharedSecrets.whichSearchJob}
                htmlFor="s-provider"
                consequence={t.sharedSecrets.whichSearchConsequence}
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
              <Alert severity="info">{t.sharedSecrets.pickAgentFirst}</Alert>
            ) : modelsError ? (
              <Alert severity="error">{errorText(errs, modelsError)}</Alert>
            ) : models === null ? (
              <div className="flex justify-center py-2">
                <Spinner size={16} />
              </div>
            ) : availableModels.length === 0 ? (
              <Alert severity="info">
                {t.sharedSecrets.noRegisteredModels.replace("{agent}", routedAgent)}
              </Alert>
            ) : (
              <Field
                label={t.sharedSecrets.whichModel}
                job={t.sharedSecrets.whichModelJob.replace("{agent}", routedAgent)}
                htmlFor="s-model"
                consequence={
                  <>
                    {t.sharedSecrets.modelConsequenceBefore}
                    <b>{t.sharedSecrets.modelConsequenceBold}</b>
                    {t.sharedSecrets.modelConsequenceAfter}
                  </>
                }
              >
                <select
                  id="s-model"
                  className={fieldControlClass(true)}
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                >
                  <option value="">{t.sharedSecrets.selectModelOption}</option>
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
            label={t.sharedSecrets.nameLabel}
            job={t.sharedSecrets.nameJob}
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
          label={t.sharedSecrets.valueLabel}
          job={t.sharedSecrets.valueJob}
          htmlFor="s-value"
          consequence={t.sharedSecrets.valueConsequence}
        >
          <input
            id="s-value"
            className={fieldControlClass()}
            type="password"
            autoComplete="off"
            placeholder={t.sharedSecrets.valuePlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>

        {submitError && <Alert severity="error">{submitError}</Alert>}

        <Button type="submit" variant="filled" disabled={submitting}>
          {submitting ? t.sharedSecrets.saving : t.sharedSecrets.save}
        </Button>
      </form>
      )}

      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t.sharedSecrets.setSecrets}
        </span>
      </div>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {!loadError && secrets === null && (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      )}

      {isEmpty && <p className="py-3 text-sm text-fg-muted">{t.sharedSecrets.none}</p>}

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
                  aria-label={`${t.sharedSecrets.deletePrefix} ${secretName}`}
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
        title={t.sharedSecrets.deleteTitle}
        message={
          pendingDelete
            ? t.sharedSecrets.deleteMessage.replace("{name}", pendingDelete.name)
            : undefined
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete.fmt, pendingDelete.name)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
