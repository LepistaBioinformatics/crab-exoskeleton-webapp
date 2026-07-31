"use client";

import { useEffect, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, FileText, Trash2, User, UserMinus } from "lucide-react";
import {
  listSubscriptionUsers,
  listUserFiles,
  deleteUserFile,
  type ScopeRef,
  type UserRef,
  type FileMeta,
  type InstanceRef,
} from "@/lib/admin";
import {
  listGuestRoles,
  listGuests,
  mergeRoster,
  revokeMember,
  type GuestRole,
  type GuestUser,
  type RoleGrant,
} from "@/lib/invitations";
import InviteMember from "./invite-member";
import InstanceConfigEditor from "./instance-config-editor";
import { formatBytes, formatModified } from "./format";
import { Button } from "@/components/ui/button";
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
//
// The Instances section is a DIFFERENT surface and is not an exception to that.
// config.json is proxy-materialized provisioning state at the workspace root --
// the proxy seeds it and rewrites six of its paths -- not member-authored
// content, and it never appears in the file list below (which is the uploads
// dir). It is reached from an instance row, never from a file row. See
// admin-instance-config-editor's spec.
export default function MembersPanel({ scope }: { scope: ScopeRef }) {
  const t = useT(adminCopy);
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [guests, setGuests] = useState<GuestUser[]>([]);
  const [roles, setRoles] = useState<GuestRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingRevoke, setPendingRevoke] = useState<
    { email: string; grant: RoleGrant } | null
  >(null);
  // The config editor is mounted once at panel level rather than per row, so two
  // instances can never be open at the same time.
  const [editing, setEditing] = useState<(InstanceRef & { label: string }) | null>(null);

  useEffect(() => {
    if (!scope.subsAccId) return;
    let cancelled = false;
    // Only blank the list when there is nothing to show yet. Nulling it on every
    // `reload` bump made a successful invite or revoke flash the whole roster
    // away behind a spinner instead of refreshing in place.
    setUsers((prev) => (reload === 0 ? null : prev));
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

  // Revokes by the role id the grant carried out of mycelium's own guest row. It
  // is deliberately NOT re-derived from the badge text: that round-trip depended
  // on the label having been built from `roles`, which is no longer always true,
  // and a failed re-resolution would have made this button do nothing at all.
  async function revoke(email: string, roleId: string) {
    if (!scope.subsAccId) return;
    try {
      await revokeMember({
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId,
        roleId,
        email,
      });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.roster.revokeFailed);
    }
  }

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

      {scope.subsAccId && (
        <InviteMember scope={scope} onInvited={() => setReload((n) => n + 1)} />
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={t.roster.revokeTitle}
        // Say what revoking does NOT do. The same panel can delete a member's
        // files, so an admin could reasonably assume this does both.
        message={
          pendingRevoke
            ? t.roster.revokeMessage
                .replace("{email}", pendingRevoke.email)
                .replace(
                  "{level}",
                  pendingRevoke.grant.level ? t.invite[pendingRevoke.grant.level] : "",
                )
                .replace("{agent}", pendingRevoke.grant.agentKey)
            : undefined
        }
        confirmLabel={t.roster.revoke}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          if (pendingRevoke?.grant.roleId) {
            void revoke(pendingRevoke.email, pendingRevoke.grant.roleId);
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
        <p className="py-3 text-sm text-fg-muted">{t.roster.noneYet}</p>
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
                      <span className="shrink-0 text-[11px] text-fg-muted">
                        {t.roster.notYetActive}
                      </span>
                    </div>
                  )}

                  {entry.roles.map((grant) => {
                    return (
                      <span key={grant.label} className="flex shrink-0 items-center gap-0.5">
                        <Badge>{grant.label}</Badge>
                        {grant.roleId && (
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label={t.roster.revokeAria
                        .replace("{role}", grant.label)
                        .replace("{email}", entry.email)}
                            onClick={() => setPendingRevoke({ email: entry.email, grant })}
                          >
                            <UserMinus size={14} aria-hidden />
                          </IconButton>
                        )}
                      </span>
                    );
                  })}
                </div>

                {open && entry.accId && scope.subsAccId && (
                  <>
                    {/* Instances come from the WORKSPACE feed, not from the
                        merged roster's role labels: those include invitations
                        with no workspace yet, and collapsing to one accId per
                        email loses the (accId, role) pairing an instance is. */}
                    <UserInstances
                      instances={(users ?? []).filter((u) => u.accId === entry.accId)}
                      onEdit={(agent) =>
                        setEditing({
                          tenantId: scope.tenantId,
                          subsAccId: scope.subsAccId as string,
                          userAccId: entry.accId as string,
                          agent,
                          label: entry.email,
                        })
                      }
                    />
                    <UserFiles
                      tenantId={scope.tenantId}
                      subsAccId={scope.subsAccId}
                      userAccId={entry.accId}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <InstanceConfigEditor
          instance={{
            tenantId: editing.tenantId,
            subsAccId: editing.subsAccId,
            userAccId: editing.userAccId,
            agent: editing.agent,
          }}
          memberLabel={editing.label}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// One row per agent this member has a workspace under -- one container, one
// config.json. A member with grants on two agents has two instances, and each
// can be broken independently.
function UserInstances({
  instances,
  onEdit,
}: {
  instances: UserRef[];
  onEdit: (agent: string) => void;
}) {
  const t = useT(adminCopy);
  const agents = instances.map((i) => i.role).filter((r): r is string => Boolean(r));

  return (
    <div className="border-t border-brand/20 px-3 py-2">
      <span className="text-[11px] font-medium text-fg-muted">{t.members.instancesHeading}</span>
      {/* Says outright that editing an instance's configuration is not opening the
          member's files. The two live in the same expanded row, and the privacy
          rule at the top of this panel is worth restating exactly where an admin
          might otherwise read the new action as an exception to it. */}
      <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
        {t.members.instancesNote}
      </p>
      {agents.length === 0 ? (
        <p className="py-1 text-xs text-fg-muted">{t.members.noInstances}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {agents.map((agent) => (
            <li key={agent} className="flex items-center gap-2 py-0.5">
              <Boxes size={14} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs text-fg">{agent}</span>
              <Button variant="text" size="sm" onClick={() => onEdit(agent)}>
                {t.members.editConfig}
              </Button>
            </li>
          ))}
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
