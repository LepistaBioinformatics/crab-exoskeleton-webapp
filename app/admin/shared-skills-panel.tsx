"use client";

import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
import { useEffect, useRef, useState } from "react";
import { BookText, Download, Eye, Plus, Trash2, Upload, X } from "lucide-react";
import {
  listSharedSkills,
  sharedSkillDoc,
  saveSharedSkillDoc,
  uploadSharedSkillZip,
  sharedSkillArchiveUrl,
  deleteSharedSkill,
  type SkillMeta,
} from "@/lib/adminSkills";
import type { ScopeRef } from "@/lib/admin";
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

const SKILL_TEMPLATE = "---\nname: \ndescription: \n---\n\n";

type Editor =
  | { mode: "create"; name: string; body: string }
  | { mode: "preview"; name: string; body: string };

// Shared skills at a scope: pick tenant/subscription, then list / create
// (inline SKILL.md editor) / upload (.zip) / preview / download / delete.
// Clone of shared-files-panel.tsx with a skill-shaped payload (a directory of
// SKILL.md + optional supporting files) instead of a single file.
export default function SharedSkillsPanel({
  scope,
  restartPolicy = DEFAULT_POLICY,
  readOnly = false,
}: {
  scope: ScopeRef;
  // How the resulting container bounce is delivered; chosen once in the admin
  // screen and applied to every write here (restart-control FR-8.1).
  restartPolicy?: RestartPolicy;
  /**
   * Set for the legacy all-agents store. Hides create, upload and save; preview,
   * download and DELETE stay, because the legacy entry exists to empty that store.
   */
  readOnly?: boolean;
}) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [skills, setSkills] = useState<SkillMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);

  const refresh = () => listSharedSkills(scope).then(setSkills);

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setError(null);
    setEditor(null);
    listSharedSkills(scope)
      .then((s) => {
        if (!cancelled) setSkills(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.tenantId, scope.subsAccId, scope.agent]);

  async function onUploadZip(file: File) {
    setUploading(true);
    setError(null);
    try {
      const name = file.name.replace(/\.zip$/i, "");
      await uploadSharedSkillZip(scope, name, file, restartPolicy);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setUploading(false);
      if (zipInput.current) zipInput.current.value = "";
    }
  }

  async function onPreview(name: string) {
    setPreviewLoading(name);
    setError(null);
    try {
      const doc = await sharedSkillDoc(scope, name);
      setEditor({ mode: "preview", name: doc.name, body: doc.content });
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setPreviewLoading(null);
    }
  }

  async function onSave() {
    if (!editor || editor.mode !== "create") return;
    const name = editor.name.trim();
    if (!name || !editor.body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveSharedSkillDoc(scope, name, editor.body, restartPolicy);
      setEditor(null);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(name: string) {
    setPendingDelete(null);
    setBusy(name);
    setError(null);
    try {
      await deleteSharedSkill(scope, name, restartPolicy);
      if (editor?.name === name) setEditor(null);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <>
            <input
              ref={zipInput}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadZip(f);
              }}
            />
            <Button
              variant="filled"
              size="sm"
              disabled={saving}
              onClick={() => setEditor({ mode: "create", name: "", body: SKILL_TEMPLATE })}
            >
              <Plus size={16} aria-hidden />
              {t.sharedSkills.newSkill}
            </Button>
            <Button
              variant="tonal"
              size="sm"
              disabled={uploading}
              onClick={() => zipInput.current?.click()}
            >
              <Upload size={16} aria-hidden />
              {uploading ? t.sharedSkills.uploading : t.sharedSkills.uploadZip}
            </Button>
          </>
        )}
        <span className="text-xs text-fg-muted">
          {readOnly ? t.legacyStore.readOnlyNote : t.sharedSkills.cascades}
        </span>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {editor && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-elevated p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editor.name}
              readOnly={editor.mode === "preview"}
              placeholder={t.sharedSkills.namePlaceholder}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-brand/30 bg-transparent px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none disabled:opacity-50"
            />
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t.sharedSkills.closeEditor}
              onClick={() => setEditor(null)}
            >
              <X size={15} aria-hidden />
            </IconButton>
          </div>
          <div className="rounded-lg border border-brand/20 bg-bg p-2">
            <Textarea
              value={editor.body}
              readOnly={editor.mode === "preview"}
              onChange={(e) => setEditor({ ...editor, body: e.target.value })}
              rows={14}
              placeholder={t.sharedSkills.bodyPlaceholder}
              className="font-mono"
            />
          </div>
          {editor.mode === "create" && (
            <div className="flex justify-end gap-2">
              <Button variant="text" size="sm" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button
                variant="filled"
                size="sm"
                disabled={saving || !editor.name.trim() || !editor.body.trim()}
                onClick={onSave}
              >
                {saving ? t.sharedSkills.saving : c.actions.save}
              </Button>
            </div>
          )}
        </div>
      )}

      {skills === null && !error ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : skills && skills.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">{t.sharedSkills.none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {skills?.map((s) => (
            <li
              key={s.name}
              className="flex items-center gap-3 rounded-lg border border-brand/30 bg-elevated px-3 py-2"
            >
              <BookText size={16} className="shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg" title={s.name}>
                  {s.name}
                </div>
                {s.description && (
                  <div className="truncate text-xs text-fg-muted" title={s.description}>
                    {s.description}
                  </div>
                )}
              </div>
              {s.hasFiles && <Badge tone="accent">{t.sharedSkills.files}</Badge>}
              <Badge tone="neutral">{formatBytes(s.size)}</Badge>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.sharedSkills.previewPrefix} ${s.name}`}
                disabled={previewLoading === s.name}
                onClick={() => onPreview(s.name)}
              >
                {previewLoading === s.name ? <Spinner size={15} /> : <Eye size={15} aria-hidden />}
              </IconButton>
              <a
                href={sharedSkillArchiveUrl(scope, s.name)}
                download={`${s.name}.zip`}
                aria-label={`${t.sharedSkills.downloadPrefix} ${s.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Download size={15} aria-hidden />
              </a>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.sharedSkills.deletePrefix} ${s.name}`}
                disabled={busy === s.name}
                onClick={() => setPendingDelete(s.name)}
              >
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.sharedSkills.deleteTitle}
        message={
          pendingDelete
            ? t.sharedSkills.deleteMessage.replace("{name}", pendingDelete)
            : undefined
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
