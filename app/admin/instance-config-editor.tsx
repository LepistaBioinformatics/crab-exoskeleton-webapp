"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cva } from "class-variance-authority";
import { Braces, ListTree, X } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/context";
import { adminCopy } from "@/lib/i18n/admin";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
import {
  readInstanceConfig,
  restartInstance,
  writeInstanceConfig,
  type InstanceConfig,
  type InstanceRef,
} from "@/lib/admin";
import RestartPolicySelect from "./restart-policy-select";
import { JsonTree } from "./json-tree-view";
import { parseDocument, serialize, type JsonValue } from "./json-tree";
import {
  canSave,
  initialMode,
  insertTab,
  outcomeFor,
  outcomeForError,
  saveLabel,
  type Delivery,
  type Mode,
  type Outcome,
} from "./instance-config-state";

// One member instance's config.json, in two interchangeable modes: the raw
// document text, and a key/value tree over the parsed value.
//
// This is not the private-file editor admin-shared-content FR-7 forbids.
// config.json is proxy-materialized provisioning state at the workspace root,
// never one of the member's uploads — see the feature spec.

const tab = cva("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors", {
  variants: {
    chosen: {
      true: "border-brand bg-accent text-accent-fg",
      false: "border-brand/40 bg-transparent text-fg hover:bg-accent/10",
    },
  },
  defaultVariants: { chosen: false },
});

export default function InstanceConfigEditor({
  instance,
  memberLabel,
  onClose,
}: {
  // Not named `ref`: React 19 treats a `ref` prop on a function component as the
  // ref, and it would never reach this component as data.
  instance: InstanceRef;
  memberLabel: string;
  onClose: () => void;
}) {
  const t = useT(adminCopy).instanceConfig;
  const err = useT(errorCopy);

  const [loaded, setLoaded] = useState<InstanceConfig | null>(null);
  // The TEXT is the single source of truth. Tree edits re-serialize into it, so
  // switching modes never merges two states and never loses an edit.
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("raw");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RestartPolicy>(DEFAULT_POLICY);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    setOutcome(null);
    readInstanceConfig(instance)
      .then((cfg) => {
        if (cancelled) return;
        setLoaded(cfg);
        setText(cfg.raw);
        setMode(initialMode(cfg.valid));
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [instance, reload]);

  const parsed = useMemo(() => parseDocument(text), [text]);
  const dirty = loaded !== null && text !== loaded.raw;

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // Re-registered when `dirty` changes: the handler has to route through the
    // discard confirmation once there is an unsaved edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  // Restarting is its own action, not a side effect of saving. picoclaw reads
  // config.json only at boot, and a broken instance may not have booted at all —
  // so its member cannot press their own restart button, and "notify the member"
  // is useless for exactly the instance an admin just repaired.
  async function restart() {
    setRestarting(true);
    setOutcome(null);
    try {
      const status = await restartInstance(instance);
      setOutcome({ kind: status === "noop" ? "restartNoop" : "restarted" });
    } catch (e) {
      setOutcome({ kind: "error", code: e instanceof Error ? e.message : "unknown" });
    } finally {
      setRestarting(false);
    }
  }

  async function save() {
    if (!loaded || !parsed.ok) return;
    setSaving(true);
    setOutcome(null);
    const submitted = parsed.value as JsonValue;
    try {
      const res = await writeInstanceConfig(instance, { raw: text, revision: loaded.revision }, policy);
      // The response is the POST-materialization document. Replace state with it
      // rather than assuming the save landed as typed.
      setLoaded(res);
      setText(res.raw);
      setOutcome(outcomeFor(res, submitted));
    } catch (e) {
      setOutcome(outcomeForError(e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} aria-hidden />
      <Surface
        level={1}
        bordered
        role="dialog"
        aria-modal="true"
        aria-label={t.heading}
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col p-5"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-fg">{t.heading}</h2>
            <p className="mt-0.5 truncate text-xs text-fg-muted">
              {memberLabel} · {instance.agent}
            </p>
          </div>
          <IconButton variant="ghost" size="sm" aria-label={t.close} onClick={requestClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>

        {loadError && (
          <div className="mt-3">
            <Alert severity={loadError === "not_found" ? "info" : "error"}>
              {loadError === "not_found" ? t.notProvisioned : errorText(err, loadError)}
            </Alert>
          </div>
        )}

        {loaded === null && !loadError ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : loaded === null ? null : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMode("raw")} className={tab({ chosen: mode === "raw" })}>
                <Braces size={14} aria-hidden />
                {t.rawMode}
              </button>
              <button
                type="button"
                disabled={!parsed.ok}
                onClick={() => setMode("tree")}
                className={tab({ chosen: mode === "tree" })}
              >
                <ListTree size={14} aria-hidden />
                {t.treeMode}
              </button>
              {parsed.ok && mode === "raw" && (
                <Button
                  variant="text"
                  onClick={() => setText(serialize(parsed.value as JsonValue))}
                >
                  {t.format}
                </Button>
              )}
              <span className="ml-auto text-xs text-fg-muted">
                {parsed.ok ? t.validJson : parseMessage(t, parsed)}
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-fg-muted">{t.managedNote}</p>
            {loaded.redactedPaths && loaded.redactedPaths.length > 0 && (
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t.redactedNote}</p>
            )}

            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-brand/30 bg-elevated p-2">
              {mode === "raw" ? (
                <Textarea
                  className="min-h-[45vh] resize-y font-mono text-xs leading-relaxed"
                  spellCheck={false}
                  aria-label={t.rawMode}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Tab") return;
                    e.preventDefault();
                    const el = e.currentTarget;
                    const next = insertTab(text, el.selectionStart, el.selectionEnd);
                    setText(next.text);
                    requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
                  }}
                />
              ) : (
                <JsonTree
                  doc={parsed.value as JsonValue}
                  managed={loaded.managedPaths}
                  redacted={loaded.redactedPaths}
                  onChange={(next) => setText(serialize(next))}
                />
              )}
            </div>

            {outcome && (
              <div className="mt-3">
                <OutcomeAlert outcome={outcome} onReload={() => setReload((n) => n + 1)} />
              </div>
            )}

            {/* Says why a save alone is not enough, and why the member cannot be
                relied on to restart a broken instance. Without this the policy
                control reads as the whole story. */}
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">{t.restartHint}</p>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              {/* Schedule is absent on purpose: the proxy reduces this endpoint's
                  policy per workspace, where "schedule" behaves as "notice". */}
              <RestartPolicySelect policy={policy} onChange={setPolicy} modes={["now", "notice"]} />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="text" onClick={requestClose}>
                  {t.close}
                </Button>
                {/* A real action, always available and independent of a save: the
                    admin may have finished a run of edits, or the instance may need
                    a bounce for a change made elsewhere. */}
                <Button variant="outlined" disabled={restarting || saving} onClick={() => void restart()}>
                  {restarting ? t.restarting : t.restartNow}
                </Button>
                <Button
                  variant="filled"
                  disabled={!canSave({ parsedOk: parsed.ok, dirty, saving }) || restarting}
                  onClick={() => void save()}
                >
                  {saving ? t.saving : saveLabel(policy.mode as Delivery, t)}
                </Button>
              </div>
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirmDiscard}
          tone="danger"
          title={t.discardTitle}
          message={t.discardMessage}
          confirmLabel={t.discard}
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      </Surface>
    </div>,
    document.body,
  );
}

function OutcomeAlert({ outcome, onReload }: { outcome: Outcome; onReload: () => void }) {
  const t = useT(adminCopy).instanceConfig;
  const err = useT(errorCopy);

  switch (outcome.kind) {
    case "saved":
      return <Alert severity="info">{t.saved}</Alert>;
    case "restarted":
      return <Alert severity="info">{t.restarted}</Alert>;
    case "restartNoop":
      // Nothing was running to bounce. Still a success: the next cold start reads
      // the repaired file.
      return <Alert severity="info">{t.restartNoop}</Alert>;
    case "managedReverted":
      return (
        <Alert severity="info">
          {t.managedReverted.replace("{paths}", outcome.paths.join(", "))}
        </Alert>
      );
    case "reapplyFailed":
      // Saved, but the model resolution could not be re-imposed. Never presented
      // as a failed save.
      return (
        <Alert severity="info">
          {t.reapplyFailed}
          {outcome.detail ? ` (${outcome.detail})` : ""}
        </Alert>
      );
    case "stale":
      return (
        <Alert severity="error">
          <span className="flex flex-wrap items-center gap-2">
            {t.staleRevision}
            <Button variant="text" onClick={onReload}>
              {t.reload}
            </Button>
          </span>
        </Alert>
      );
    case "error":
      return <Alert severity="error">{errorText(err, outcome.code)}</Alert>;
  }
}

function parseMessage(
  t: { invalidJson: string; atLine: string },
  parsed: ReturnType<typeof parseDocument>,
): string {
  if (parsed.error === "notObject") return t.invalidJson;
  const where =
    parsed.line !== undefined
      ? ` ${t.atLine.replace("{line}", String(parsed.line)).replace("{column}", String(parsed.column ?? 1))}`
      : "";
  return `${parsed.error ?? t.invalidJson}${where}`;
}
