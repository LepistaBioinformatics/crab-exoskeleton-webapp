"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import {
  listSharedFiles,
  uploadSharedFile,
  deleteSharedFile,
  sharedFileDownloadUrl,
  type ScopeRef,
  type FileMeta,
} from "@/lib/admin";
import { formatBytes } from "./format";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// Shared files at a scope: pick tenant/subscription, then list / upload /
// download / delete. Shared content is scope-owned and cascades read-only to
// every container below (FR-4), so download here is expected (FR-7.1) --
// distinct from user private files, which never expose bytes.
export default function SharedFilesPanel({ scope }: { scope: ScopeRef }) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listSharedFiles(scope).then(setFiles);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    listSharedFiles(scope)
      .then((f) => {
        if (!cancelled) setFiles(f);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, scope.tenantId, scope.subsAccId, scope.agent]);

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await uploadSharedFile(scope, file);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onDelete(name: string) {
    setPendingDelete(null);
    setBusy(name);
    setError(null);
    try {
      await deleteSharedFile(scope, name);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
        <Button
          variant="filled"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} aria-hidden />
          {uploading ? t.sharedFiles.uploading : t.sharedFiles.upload}
        </Button>
        <span className="text-xs text-fg-muted">{t.sharedFiles.cascades}</span>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {files === null && !error ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : files && files.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">{t.sharedFiles.none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files?.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-3 rounded-lg border border-brand/30 bg-elevated px-3 py-2"
            >
              <FileText size={16} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-fg" title={f.name}>
                {f.name}
              </span>
              <Badge tone="neutral">{formatBytes(f.size)}</Badge>
              <a
                href={sharedFileDownloadUrl(scope, f.name)}
                download={f.name}
                aria-label={`${t.sharedFiles.downloadPrefix} ${f.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Download size={15} aria-hidden />
              </a>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.sharedFiles.deletePrefix} ${f.name}`}
                disabled={busy === f.name}
                onClick={() => setPendingDelete(f.name)}
              >
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.sharedFiles.deleteTitle}
        message={
          pendingDelete
            ? t.sharedFiles.deleteMessage.replace("{name}", pendingDelete)
            : undefined
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
