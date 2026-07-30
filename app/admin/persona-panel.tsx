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
  type PersonaSource,
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

// Which sentence explains the text in an open editor that this scope does not own:
// where it was borrowed from, or that nothing provides the file at all.
function borrowedNote(
  source: PersonaSource | null,
  copy: { fromTemplate: string; fromTenant: string; emptyNothingResolves: string },
): string {
  if (source === "template") return copy.fromTemplate;
  if (source === "tenant") return copy.fromTenant;
  return copy.emptyNothingResolves;
}

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
  // `source` is where the open text came from — null when no layer had the file at
  // all. It drives the note above the editor and nothing else; whether a row reads
  // as injected still comes only from `injected` (the scope-only listing).
  const [editing, setEditing] = useState<{
    name: PersonaFile;
    body: string;
    source: PersonaSource | null;
    /** What was loaded, kept so Save can require an actual change. */
    loaded: string;
  } | null>(null);
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

  // Opens on what the agent actually runs: the proxy resolves this scope → the
  // layer below → the agent template, and says which one answered. An empty editor
  // used to be the starting point whenever this scope injected nothing, which is
  // the normal state — so the first save replaced an identity the admin had never
  // read. The `source` note above the editor is what keeps the preload honest:
  // borrowed text is labelled as borrowed until it is saved here.
  async function openEditor(name: PersonaFile) {
    setLoadingDoc(name);
    setError(null);
    try {
      const doc = await readPersona(scope, name);
      const body = doc?.content ?? "";
      setEditing({ name, body, source: doc?.source ?? null, loaded: body });
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
    if (!editing || !editing.body.trim() || editing.body === editing.loaded) return;
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
          {/* Only for text this scope does not own yet. An injection of its own
              needs no explanation — it is what the row already says. */}
          {editing.source !== "scope" && (
            <p className="text-[11px] leading-relaxed text-fg-muted">
              {borrowedNote(editing.source, t.persona)}
            </p>
          )}
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
              // Requires an actual change, not just text. With the editor
              // preloading the resolved content, Edit is also the only way to READ
              // a file — and a Save on untouched template text would write a
              // verbatim copy as this scope's injection, which then wins over the
              // template forever. That is the exact failure the cascade exists to
              // remove, one stray click away, so an unchanged body cannot be saved.
              disabled={saving || !editing.body.trim() || editing.body === editing.loaded}
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
