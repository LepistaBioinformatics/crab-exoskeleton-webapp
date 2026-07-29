"use client";

import { useEffect, useState } from "react";
import { Check, FileText, Lock, Pencil, PenLine, Trash2, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
import type { ScopeRef } from "@/lib/admin";
import {
  PERSONA_FILES,
  PERSONA_SEED_ONLY,
  deletePersona,
  listPersona,
  readPersona,
  savePersona,
  type PersonaFile,
} from "@/lib/adminPersona";
import { formatBytes } from "./format";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// The agent's identity files at a scope. A FIXED set of four rows, not a list:
// these are not user-named documents, they are the four files picoclaw reads from
// its workspace root. Each row says whether this scope injects it or inherits it.
const row = cva("flex flex-col gap-2 rounded-lg border px-3.5 py-3 transition-colors", {
  variants: {
    injected: {
      true: "border-brand/40 bg-elevated",
      // Inherited: nothing at this scope, so the next layer up (or the agent
      // template) is what workspaces get. Drawn quieter than an injection.
      false: "border-dashed border-brand/25 bg-transparent",
    },
  },
  defaultVariants: { injected: false },
});

export default function PersonaPanel({
  scope,
  restartPolicy = DEFAULT_POLICY,
}: {
  scope: ScopeRef;
  // How the resulting container bounce is delivered; chosen once in the admin
  // screen and applied to every write here (restart-control FR-8.1).
  restartPolicy?: RestartPolicy;
}) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);

  const [injected, setInjected] = useState<Map<string, { size: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: PersonaFile; body: string } | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingClear, setPendingClear] = useState<PersonaFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInjected(null);
    setError(null);
    setEditing(null);
    listPersona(scope)
      .then((files) => {
        if (cancelled) return;
        setInjected(new Map(files.map((f) => [f.name, { size: f.size }])));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.tenantId, scope.subsAccId, scope.agent]);

  const refresh = () =>
    listPersona(scope).then((files) => setInjected(new Map(files.map((f) => [f.name, { size: f.size }]))));

  // Loads the injected text, or opens an empty editor when this scope inherits —
  // deliberately NOT prefilled with the inherited content. The proxy resolves the
  // cascade per workspace; showing one layer's text as the starting point of
  // another would suggest this screen knows what a given workspace ends up with.
  async function openEditor(name: PersonaFile) {
    setLoadingDoc(name);
    setError(null);
    try {
      const body = await readPersona(scope, name);
      setEditing({ name, body: body ?? "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDoc(null);
    }
  }

  // The refresh is deliberately OUTSIDE the write's try. Awaiting it in there made a
  // failing list read surface as a failed save — telling the admin to redo a change
  // that had already landed, on a screen where redoing it also re-bounces every
  // container under the scope.
  async function onSave() {
    if (!editing || !editing.body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await savePersona(scope, editing.name, editing.body, restartPolicy);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      return;
    }
    setEditing(null);
    setSaving(false);
    refresh().catch((e: Error) => setError(e.message));
  }

  async function onClear(name: PersonaFile) {
    setError(null);
    try {
      await deletePersona(scope, name, restartPolicy);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setPendingClear(null);
    if (editing?.name === name) setEditing(null);
    refresh().catch((e: Error) => setError(e.message));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] text-xs leading-relaxed text-fg-muted">{t.persona.intro}</p>

      {error && <Alert severity="error">{errorText(err, error)}</Alert>}

      {injected === null ? (
        <div className="flex justify-center py-8">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {PERSONA_FILES.map((name) => {
            const here = injected.get(name);
            const seedOnly = name === PERSONA_SEED_ONLY;
            return (
              <div key={name} className={row({ injected: !!here })}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {seedOnly ? (
                    <PenLine size={16} className="shrink-0 text-fg-muted" aria-hidden />
                  ) : (
                    <Lock size={16} className="shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <span className="font-mono text-sm text-fg">{name}</span>
                  {here ? (
                    <Badge tone="accent">{t.persona.injectedHere}</Badge>
                  ) : (
                    <span className="text-xs text-fg-muted">{t.persona.inherited}</span>
                  )}
                  {here && (
                    <span className="text-xs text-fg-muted">{formatBytes(here.size)}</span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={`${t.persona.edit} ${name}`}
                      title={t.persona.edit}
                      disabled={loadingDoc === name}
                      onClick={() => openEditor(name)}
                    >
                      {loadingDoc === name ? <Spinner size={14} /> : <Pencil size={15} aria-hidden />}
                    </IconButton>
                    {here && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={`${t.persona.clear} ${name}`}
                        title={t.persona.clear}
                        onClick={() => setPendingClear(name)}
                      >
                        <Trash2 size={15} aria-hidden />
                      </IconButton>
                    )}
                  </span>
                </div>
                {/* The two promises differ, and the difference is not cosmetic: three
                    files are made unwritable in the workspace, while USER.md only
                    gets its STARTING content from here. Saying so per row is the only
                    place an admin will read it. */}
                <p className="text-[11px] leading-relaxed text-fg-muted">
                  {seedOnly ? t.persona.seedOnlyNote : t.persona.readOnlyNote}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="shrink-0 text-fg-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{editing.name}</span>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={c.actions.cancel}
              title={c.actions.cancel}
              onClick={() => setEditing(null)}
            >
              <X size={16} aria-hidden />
            </IconButton>
          </div>
          <Textarea
            rows={18}
            className="font-mono text-xs"
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            aria-label={editing.name}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="text" size="sm" onClick={() => setEditing(null)}>
              {c.actions.cancel}
            </Button>
            <Button
              variant="filled"
              size="sm"
              disabled={saving || !editing.body.trim()}
              onClick={onSave}
            >
              <Check size={15} aria-hidden />
              {saving ? t.persona.saving : t.persona.save}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingClear !== null}
        title={t.persona.clearTitle}
        message={t.persona.clearMessage.replace("{name}", pendingClear ?? "")}
        confirmLabel={t.persona.clear}
        onConfirm={() => pendingClear && onClear(pendingClear)}
        onCancel={() => setPendingClear(null)}
      />
    </div>
  );
}
