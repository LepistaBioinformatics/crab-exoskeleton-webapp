"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Trash2, User, UserMinus } from "lucide-react";
import {
  listSubscriptionUsers,
  listUserFiles,
  deleteUserFile,
  type ScopeRef,
  type UserRef,
  type FileMeta,
} from "@/lib/admin";
import {
  listGuestRoles,
  listGuests,
  mergeRoster,
  revokeMember,
  resolveRoleId,
  permissionLevel,
  type GuestRole,
  type GuestUser,
  type AccessLevel,
} from "@/lib/invitations";
import InviteMember from "./invite-member";
import { formatBytes, formatModified } from "./format";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Members of the subscription selected in the rail (the scope is owned by the
// admin screen, same as the shared-files / shared-secrets panels). Per user we
// can LIST private-file metadata (name/size/modified) and DELETE a file -- and
// nothing else. There is deliberately NO way to open, download, preview, or edit
// a user's private file here: the privacy invariant (FR-7) holds for every tier,
// so this panel exposes no content affordance. Do not add a link, download icon,
// or row click handler to the file rows.
export default function MembersPanel({ scope }: { scope: ScopeRef }) {
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [guests, setGuests] = useState<GuestUser[]>([]);
  const [roles, setRoles] = useState<GuestRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingRevoke, setPendingRevoke] = useState<
    { email: string; agentKey: string; level: AccessLevel } | null
  >(null);

  useEffect(() => {
    if (!scope.subsAccId) return;
    let cancelled = false;
    setUsers(null);
    setError(null);
    setExpanded(null);
    // Two feeds, two questions: who was INVITED (mycelium guests) and who has
    // actually USED the agent (a workspace on disk). Only the workspace feed is
    // load-bearing for the file rows below, so a guest-list failure degrades to
    // "no invitations shown" instead of blanking the panel.
    listSubscriptionUsers(scope.tenantId, scope.subsAccId)
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    Promise.all([
      listGuests(scope.tenantId, scope.subsAccId),
      listGuestRoles(scope.tenantId),
    ])
      .then(([g, r]) => {
        if (cancelled) return;
        setGuests(g);
        setRoles(r);
      })
      .catch(() => {
        if (!cancelled) {
          setGuests([]);
          setRoles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scope.tenantId, scope.subsAccId, reload]);

  const roster = mergeRoster(guests, users ?? [], roles);

  async function revoke(email: string, agentKey: string, level: AccessLevel) {
    if (!scope.subsAccId) return;
    const roleId = resolveRoleId(roles, agentKey, level);
    if (!roleId) return;
    try {
      await revokeMember({
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId,
        roleId,
        email,
      });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke access.");
    }
  }

  if (scope.kind !== "subscription" || !scope.subsAccId) {
    return (
      <p className="py-3 text-sm text-fg-muted">Select a subscription to see its members.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-fg-muted">
        You can list and delete a member&apos;s private files, but never open or edit their contents
        — a member&apos;s private content never leaves their workspace (FR-7).
      </p>

      {error && <Alert severity="error">{error}</Alert>}

      {scope.subsAccId && (
        <InviteMember scope={scope} onInvited={() => setReload((n) => n + 1)} />
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Revoke access?"
        // Say what revoking does NOT do. The same panel can delete a member's
        // files, so an admin could reasonably assume this does both.
        message={
          pendingRevoke
            ? `${pendingRevoke.email} will lose ${pendingRevoke.level} access to ${pendingRevoke.agentKey}. Their workspace and files are kept — deleting those is a separate action.`
            : undefined
        }
        confirmLabel="Revoke"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          if (pendingRevoke) {
            void revoke(pendingRevoke.email, pendingRevoke.agentKey, pendingRevoke.level);
          }
          setPendingRevoke(null);
        }}
      />

      {/* ONE roster, not two lists (FR-2.2). Invited-but-never-used and
          active-with-a-workspace are two states of the same person; two tables
          would make the normal first state look like an inconsistency. Only a
          person with a workspace expands — there are no files before one. */}
      {users === null && !error ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : roster.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">
          Nobody has access to this subscription yet. Invite someone above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {roster.map((entry) => {
            const open = expanded === entry.email;
            return (
              <li key={entry.email} className="rounded-lg border border-brand/30 bg-elevated">
                <div className="flex items-center gap-2 px-3 py-2">
                  {entry.accId ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : entry.email)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown size={15} className="shrink-0 text-fg-muted" aria-hidden />
                      ) : (
                        <ChevronRight size={15} className="shrink-0 text-fg-muted" aria-hidden />
                      )}
                      <User size={15} className="shrink-0 text-fg-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{entry.email}</span>
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 pl-[21px]">
                      <User size={15} className="shrink-0 text-fg-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{entry.email}</span>
                      <span className="shrink-0 text-[11px] text-fg-muted">not yet active</span>
                    </div>
                  )}

                  {entry.roles.map((r) => {
                    const parsed = parseRoleLabel(r);
                    return (
                      <span key={r} className="flex shrink-0 items-center gap-0.5">
                        <Badge>{r}</Badge>
                        {parsed && (
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label={`Revoke ${r} from ${entry.email}`}
                            onClick={() => setPendingRevoke({ email: entry.email, ...parsed })}
                          >
                            <UserMinus size={14} aria-hidden />
                          </IconButton>
                        )}
                      </span>
                    );
                  })}
                </div>

                {open && entry.accId && scope.subsAccId && (
                  <UserFiles
                    tenantId={scope.tenantId}
                    subsAccId={scope.subsAccId}
                    userAccId={entry.accId}
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
      setError(e instanceof Error ? e.message : "Delete failed.");
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
        <p className="py-1 text-xs text-fg-muted">No private files.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {files?.map((f) => {
            const modified = formatModified(f.modifiedAt);
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
                  aria-label={`Delete ${f.name}`}
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
        title="Delete member's file?"
        message={
          pendingDelete
            ? `"${pendingDelete}" will be permanently removed from this member's private workspace.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// Roster labels are rendered as "alpha (write)"; parse one back into the pair a
// revoke needs. A label with no level came from the workspace feed alone (the
// person has a workspace but no matching guest row), and there is no guest
// record to revoke, so it offers no button.
function parseRoleLabel(label: string): { agentKey: string; level: AccessLevel } | null {
  const m = /^(.+) \((read|write)\)$/.exec(label);
  if (!m) return null;
  return { agentKey: m[1], level: m[2] as AccessLevel };
}
