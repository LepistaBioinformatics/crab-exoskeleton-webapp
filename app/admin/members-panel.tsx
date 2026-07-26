"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Trash2, User } from "lucide-react";
import {
  listSubscriptionUsers,
  listUserFiles,
  deleteUserFile,
  type ScopeRef,
  type UserRef,
  type FileMeta,
} from "@/lib/admin";
import { formatBytes, formatModified } from "./format";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BCP47 } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/context";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// Members of the subscription selected in the rail (the scope is owned by the
// admin screen, same as the shared-files / shared-secrets panels). Per user we
// can LIST private-file metadata (name/size/modified) and DELETE a file -- and
// nothing else. There is deliberately NO way to open, download, preview, or edit
// a user's private file here: the privacy invariant (FR-7) holds for every tier,
// so this panel exposes no content affordance. Do not add a link, download icon,
// or row click handler to the file rows.
export default function MembersPanel({ scope }: { scope: ScopeRef }) {
  const t = useT(adminCopy);
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!scope.subsAccId) return;
    let cancelled = false;
    setUsers(null);
    setError(null);
    setExpanded(null);
    listSubscriptionUsers(scope.tenantId, scope.subsAccId)
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.tenantId, scope.subsAccId]);

  if (scope.kind !== "subscription" || !scope.subsAccId) {
    return (
      <p className="py-3 text-sm text-fg-muted">{t.members.selectSubscription}</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-fg-muted">
        {t.members.privacyNote}
      </p>

      {error && <Alert severity="error">{error}</Alert>}

      {users === null && !error ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : users && users.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">{t.members.none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {users?.map((u) => {
            // A user present under more than one agent is returned once per
            // agent (same accId), so identity is (role, accId) — key + expand on
            // that, and label the agent, otherwise the rows look like duplicates.
            const rowKey = `${u.role ?? ""}:${u.accId}`;
            const open = expanded === rowKey;
            return (
              <li key={rowKey} className="rounded-lg border border-brand/30 bg-elevated">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : rowKey)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  {open ? (
                    <ChevronDown size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  ) : (
                    <ChevronRight size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <User size={15} className="shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {u.name || u.email || u.accId}
                  </span>
                  {u.role && (
                    <span className="shrink-0 rounded border border-brand/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-fg-muted">
                      {u.role}
                    </span>
                  )}
                </button>
                {open && scope.subsAccId && (
                  <UserFiles
                    tenantId={scope.tenantId}
                    subsAccId={scope.subsAccId}
                    userAccId={u.accId}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function UserFiles({
  tenantId,
  subsAccId,
  userAccId,
}: {
  tenantId: string;
  subsAccId: string;
  userAccId: string;
}) {
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const tag = BCP47[useLocale().locale];
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = () => listUserFiles(tenantId, subsAccId, userAccId).then(setFiles);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    listUserFiles(tenantId, subsAccId, userAccId)
      .then((f) => {
        if (!cancelled) setFiles(f);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, subsAccId, userAccId]);

  async function onDelete(name: string) {
    setPendingDelete(null);
    setBusy(name);
    setError(null);
    try {
      await deleteUserFile(tenantId, subsAccId, userAccId, name);
      await refresh();
    } catch (e) {
      setError(errorText(err, e instanceof Error ? e.message : null));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-brand/20 px-3 py-2">
      {error && <Alert severity="error">{error}</Alert>}
      {files === null && !error ? (
        <div className="flex justify-center py-3">
          <Spinner size={18} />
        </div>
      ) : files && files.length === 0 ? (
        <p className="py-1 text-xs text-fg-muted">{t.members.noPrivateFiles}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {files?.map((f) => {
            const modified = formatModified(f.modifiedAt, tag);
            return (
              <li key={f.name} className="flex items-center gap-2 py-1">
                <FileText size={14} className="shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-fg" title={f.name}>
                  {f.name}
                </span>
                <Badge tone="neutral">{formatBytes(f.size)}</Badge>
                {modified && <span className="shrink-0 text-[11px] text-fg-muted">{modified}</span>}
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`${t.members.deletePrefix} ${f.name}`}
                  disabled={busy === f.name}
                  onClick={() => setPendingDelete(f.name)}
                >
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.members.deleteTitle}
        message={
          pendingDelete
            ? t.members.deleteMessage.replace("{name}", pendingDelete)
            : undefined
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
