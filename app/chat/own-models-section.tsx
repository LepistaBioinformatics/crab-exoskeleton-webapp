"use client";

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import { Check, CircleAlert, Cpu, Pencil, Plus, Trash2 } from "lucide-react";
import {
  applyProvider,
  canTest,
  createUserModel,
  deleteUserModel,
  draftFingerprint,
  draftFromUserModel,
  effectiveSource,
  emptyUserDraft,
  listUserModels,
  parseExtraBody,
  providerModels,
  registerableProviders,
  saveGate,
  selectUserModel,
  slugFromLabel,
  testUserModel,
  updateUserModel,
  useOrganisationModel,
  type TestOutcome,
  type UserModel,
  type UserModelDraft,
  type UserModelsState,
} from "@/lib/userModels";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Accordion } from "@/components/ui/accordion";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The member's own models, inside the secrets drawer. It sits ABOVE the secret
// form because it answers a more urgent question than "which secrets do I have":
// which model is answering me, and can I change it.

const selectClass =
  "h-11 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

const row = cva(
  "flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors",
  {
    variants: {
      state: {
        // In use: the accent says which one is answering without a second label.
        active: "border-accent bg-accent/10",
        idle: "border-brand/30 bg-elevated",
        // Registered but an administrator switched it off. Dimmed rather than
        // hidden: it is the member's own record and they may still delete it.
        disabled: "border-brand/20 bg-elevated opacity-60",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const testLine = cva("text-[11px] leading-relaxed", {
  variants: { ok: { true: "text-fg-muted", false: "text-red-400" } },
});

export default function OwnModelsSection({
  workspace,
  onChanged,
}: {
  workspace: Workspace;
  /** Raise the restart notice: a model change reaches the container, not the tab. */
  onChanged: () => void;
}) {
  const t = useT(chatCopy).ownModels;
  const errs = useT(errorCopy);

  const [state, setState] = useState<UserModelsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState<UserModelDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // What the last probe covered. Holding the FINGERPRINT rather than a boolean
  // is what makes the gate re-arm on any edit — see saveGate.
  const [tested, setTested] = useState<{ fingerprint: string; ok: boolean } | null>(null);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [testing, setTesting] = useState(false);
  const [doomed, setDoomed] = useState<UserModel | null>(null);

  const refresh = () =>
    listUserModels(workspace)
      .then(setState)
      .catch((e: Error) => setError(errorText(errs, e.message)));

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    listUserModels(workspace)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(errorText(errs, e.message));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r]);

  function openForm(model: UserModel | null) {
    setDraft(model ? draftFromUserModel(model) : emptyUserDraft());
    setEditing(model?.slug ?? null);
    setTested(null);
    setOutcome(null);
    setError(null);
  }

  function closeForm() {
    setDraft(null);
    setEditing(null);
    setTested(null);
    setOutcome(null);
  }

  // Every mutation runs through here so the restart notice and the refresh
  // cannot be forgotten at one call site.
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      await refresh();
      return true;
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (!draft) return;
    const extra = parseExtraBody(draft.extra_body);
    if (extra.error) {
      setError(errorText(errs, extra.error));
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const res = await testUserModel(workspace, draft, extra.value);
      setOutcome(res);
      setTested({ fingerprint: draftFingerprint(draft), ok: res.ok });
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
      // A probe that never ran is not a failed probe: leaving the gate untested
      // keeps Save disabled rather than offering "save anyway" for a request
      // nobody made.
      setTested(null);
      setOutcome(null);
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    const extra = parseExtraBody(draft.extra_body);
    if (extra.error) {
      setError(errorText(errs, extra.error));
      return;
    }
    // A slug the member never types: derived from their label, falling back to
    // the model id when the label is all punctuation. On an edit it is fixed —
    // it is half the store key.
    const slug = editing ?? (slugFromLabel(draft.label) || slugFromLabel(draft.model));
    const payload = { ...draft, slug };
    // The version of the record this form was opened on, so a concurrent edit
    // from another tab is rejected rather than overwritten.
    const version = state?.models.find((m) => m.slug === editing)?.version ?? 0;
    const ok = await mutate(() =>
      editing
        ? updateUserModel(workspace, payload, extra.value, version)
        : createUserModel(workspace, payload, extra.value),
    );
    if (ok) closeForm();
  }

  // The shell stays put while the section resolves, so opening the drawer does
  // not make the groups below it jump.
  if (error && state === null) {
    return (
      <Accordion title={t.heading} summary={t.summaryUnknown} variant="section" defaultOpen>
        <Alert severity="error">{error}</Alert>
      </Accordion>
    );
  }
  if (state === null) {
    return (
      <Accordion title={t.heading} summary={t.summaryLoading} variant="section" defaultOpen>
        <div className="flex justify-center py-2">
          <Spinner size={20} />
        </div>
      </Accordion>
    );
  }

  const source = effectiveSource(state);
  const orgName = state.organisationModel || t.unnamedOrgModel;
  const gate = draft ? saveGate(draft, tested) : "untested";

  // The header answers the section's own question without being opened: which
  // model is answering. A blocked selection says so here too — that is the state
  // a member most needs to see before deciding to open anything.
  const summary =
    source.kind === "own"
      ? t.summaryOwn.replace("{name}", source.model.label || source.model.slug)
      : source.kind === "own-blocked"
        ? t.summaryBlocked
        : t.summaryOrg.replace("{name}", orgName);

  return (
    <Accordion title={t.heading} summary={summary} variant="section" defaultOpen>
      {/* What is answering, right now. */}
      <div className="rounded-lg border border-brand/30 bg-elevated px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-medium text-fg">
          <Cpu size={14} className="shrink-0 text-accent" aria-hidden />
          {source.kind === "own" ? t.inEffectOwn : t.inEffectOrg}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
          {source.kind === "own" ? (
            state.organisationModel ? (
              // The guarantee the test cannot give: picoclaw itself falls back.
              t.fallbackNote.replace("{name}", state.organisationModel)
            ) : (
              t.noOrgModel
            )
          ) : (
            <span className="font-mono">{orgName}</span>
          )}
        </p>
        {source.kind === "own-blocked" && (
          <div className="mt-2">
            <Alert severity="error">
              {(source.blockedBy === "disabled" ? t.disabledSelected : t.lockedSelected).replace(
                "{name}",
                orgName,
              )}
            </Alert>
          </div>
        )}
      </div>

      {!state.allowed && <Alert severity="info">{t.lockedScope}</Alert>}

      {error && <Alert severity="error">{error}</Alert>}

      <ul className="flex flex-col gap-1.5">
        {/* The organisation's model is an option in the same list as the member's
            own, because "switch back" is the same kind of act as "switch to". */}
        <li className={row({ state: state.selected ? "idle" : "active" })}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-fg">{t.useOrg}</span>
            {state.selected ? (
              <Button
                size="sm"
                variant="outlined"
                disabled={busy}
                onClick={() => mutate(() => useOrganisationModel(workspace))}
              >
                {t.useThis}
              </Button>
            ) : (
              <Badge tone="accent">
                <Check size={11} aria-hidden /> {t.inUse}
              </Badge>
            )}
          </div>
          <span className="truncate font-mono text-[11px] text-fg-muted">{orgName}</span>
        </li>

        {state.models.map((m) => {
          const active = m.slug === state.selected && m.enabled && state.allowed;
          return (
            <li key={m.slug} className={row({ state: active ? "active" : m.enabled ? "idle" : "disabled" })}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-fg">{m.label || m.slug}</span>
                {active ? (
                  <Badge tone="accent">
                    <Check size={11} aria-hidden /> {t.inUse}
                  </Badge>
                ) : (
                  m.enabled &&
                  state.allowed && (
                    <Button
                      size="sm"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => mutate(() => selectUserModel(workspace, m.slug))}
                    >
                      {t.useThis}
                    </Button>
                  )
                )}
                <IconButton variant="ghost" size="sm" aria-label={t.edit} onClick={() => openForm(m)}>
                  <Pencil size={14} aria-hidden />
                </IconButton>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={t.delete}
                  disabled={busy}
                  onClick={() => setDoomed(m)}
                >
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </div>
              <span className="truncate font-mono text-[11px] text-fg-muted">
                {m.provider} · {m.model}
              </span>
              {!m.enabled && <span className="text-[11px] text-fg-muted">{t.disabledBadge}</span>}
              {/* The stored verdict, so the list says what is known without a
                  re-test — and says "never tested" rather than implying success. */}
              <span className={testLine({ ok: m.last_test ? m.last_test.ok : true })}>
                {!m.last_test
                  ? t.neverTested
                  : m.last_test.ok
                    ? t.lastTestOk.replace("{ms}", String(m.last_test.latency_ms))
                    : t.lastTestFailed}
              </span>
            </li>
          );
        })}
      </ul>

      {state.models.length === 0 && !draft && (
        <p className="text-[11px] leading-relaxed text-fg-muted">
          {t.empty} {t.emptyHint}
        </p>
      )}

      {!draft ? (
        <Button variant="tonal" size="sm" className="w-full" onClick={() => openForm(null)}>
          <Plus size={14} aria-hidden /> {t.add}
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-elevated p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.labelLabel}</span>
            <Input
              inputSize="md"
              placeholder={t.labelPlaceholder}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.providerLabel}</span>
            <select
              className={selectClass}
              value={draft.provider}
              // Picking a provider carries its endpoint with it, unless the member
              // typed one of their own — see applyProvider.
              onChange={(e) => setDraft(applyProvider(draft, state.providers, e.target.value))}
            >
              <option value="">{t.providerPlaceholder}</option>
              {registerableProviders(state.providers, state.customEndpointAllowed).map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.provider}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.modelLabel}</span>
            <Input
              inputSize="md"
              // Suggestions, not a closed list: a provider's real model set moves
              // faster than the catalog behind them.
              list="own-model-suggestions"
              placeholder={t.modelPlaceholder}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
            <datalist id="own-model-suggestions">
              {providerModels(state.providers, draft.provider).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.apiBaseLabel}</span>
            <Input
              inputSize="md"
              inputMode="url"
              placeholder={t.apiBasePlaceholder}
              value={draft.api_base}
              // Read-only unless an administrator opened this scope. Shown rather
              // than hidden: the endpoint is where the member's key is going, and
              // that is worth seeing even when it is not theirs to change.
              readOnly={!state.customEndpointAllowed}
              onChange={(e) => setDraft({ ...draft, api_base: e.target.value })}
            />
            <span className="text-[11px] text-fg-muted">
              {state.customEndpointAllowed ? t.apiBaseHint : t.apiBaseFixed}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">{t.apiKeyLabel}</span>
            <Input
              inputSize="md"
              type="password"
              autoComplete="off"
              placeholder={t.apiKeyPlaceholder}
              value={draft.api_key}
              onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
            />
            {editing && <span className="text-[11px] text-fg-muted">{t.apiKeyKept}</span>}
          </label>

          <details>
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">{t.advanced}</summary>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-muted">{t.extraBodyLabel}</span>
              <Textarea
                rows={4}
                className="rounded-lg border border-brand px-3 py-2 font-mono"
                placeholder="{}"
                value={draft.extra_body}
                onChange={(e) => setDraft({ ...draft, extra_body: e.target.value })}
              />
              <span className="text-[11px] text-fg-muted">{t.extraBodyHint}</span>
            </label>
          </details>

          {/* The verdict, and what it does and does not mean. */}
          {outcome && gate !== "untested" && (
            <Alert severity={outcome.ok ? "info" : "error"}>
              <span className="block">
                {outcome.ok
                  ? t.testOk.replace("{ms}", String(outcome.latency_ms))
                  : `${t.testFailed} ${outcome.detail ? errorText(errs, `probe_${outcome.detail}`) : ""}`}
              </span>
              <span className="mt-1 block text-[11px] text-fg-muted">
                {outcome.ok ? t.testOkHint : t.testFailedHint}
              </span>
            </Alert>
          )}

          {gate === "untested" && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-muted">
              <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t.testFirst}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outlined"
              size="sm"
              className="flex-1"
              disabled={testing || busy || !canTest(draft, editing !== null)}
              onClick={onTest}
            >
              {testing ? t.testing : gate === "untested" ? t.test : t.retest}
            </Button>
            <Button
              variant="filled"
              size="sm"
              className="flex-1"
              // The gate: never saveable before a probe has covered THIS draft. A
              // red probe still saves — an endpoint that is briefly down must not
              // make a correct model unsaveable — but it has to be a deliberate
              // second click on a button that says so.
              disabled={busy || gate === "untested"}
              onClick={onSave}
            >
              {busy ? t.saving : gate === "tested-failed" ? t.saveAnyway : t.save}
            </Button>
            <Button variant="text" size="sm" disabled={busy} onClick={closeForm}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-fg-muted">{t.restartNote}</p>

      <ConfirmDialog
        open={doomed !== null}
        title={t.delete}
        message={t.deleteConfirm.replace("{name}", doomed?.label || doomed?.slug || "")}
        tone="danger"
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          const target = doomed;
          setDoomed(null);
          if (target) void mutate(() => deleteUserModel(workspace, target.slug));
        }}
      />
    </Accordion>
  );
}
