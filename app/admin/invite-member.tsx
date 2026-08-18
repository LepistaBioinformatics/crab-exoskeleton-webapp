"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import type { ScopeRef } from "@/lib/admin";
import {
  availableLevels,
  inviteMember,
  isValidEmail,
  listGuestRoles,
  resolveRoleId,
  type AccessLevel,
  type GuestRole,
} from "@/lib/invitations";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

const selectClass =
  "h-9 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// Invite someone to this subscription. An agent and an access level together resolve to
// the mycelium guest role id, because permission is a property of the role rather than of
// the guesting call.
//
// IT ONLY INVITES. It used to carry an Invite/Uninvite switch, which asked the admin to
// retype an address, an agent and a level that the roster row below already knows — and the
// roster row carries its own revoke, so the two could disagree about what was being
// removed. Removing access lives there, in the box that opens under the person's name.
//
// THE AGENT IS NOT ASKED FOR HERE ANY MORE. It arrives from the context the admin chose
// at the gate, and this form has no control of its own for it.
//
// That control was the mechanism behind the reported failure. A mycelium guest role's
// NAME IS THE AGENT KEY (lib/invitations.ts) — the gateway declares
// `protectedByRoles = [{ name = "alpha" }]` and mycelium creates those roles at boot —
// so this `<select>`, three fields deep in a form, was what decided which agent a person
// was granted access to. Meanwhile the navigation around it named no agent at all. Two
// agent selections on one screen, and the one that mattered was the invisible one.
//
// Resolving the role from (agent, level) rather than from a roster label is also what
// makes this reachable at all: a label only parses back into that pair when the guest
// row's role could be named, and this path never depends on that.
//
// Reaching this panel already proves the caller administers the scope — the
// admin screen only lists scopes the proxy says they can manage — so there is no
// second gate here. Mycelium re-checks anyway and its status is surfaced.
export default function InviteMember({
  scope,
  agent,
  tenantLabel,
  scopeLabel,
  onInvited,
}: {
  scope: ScopeRef;
  /** The agent named in the context bar. The only agent this form can address. */
  agent: string;
  /** Both names, for the confirmation — which has to say WHERE, not only who and what. */
  tenantLabel: string;
  scopeLabel: string;
  onInvited: () => void;
}) {
  const t = useT(adminCopy).invite;
  const levelLabel: Record<AccessLevel, string> = { read: t.read, write: t.write };
  const [roles, setRoles] = useState<GuestRole[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<AccessLevel>("write");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Roles change only when the gateway config does, so this is fetched once per
  // tenant and kept for the session. The agent list is no longer fetched here at all —
  // the screen already resolved one, and a second fetch could only produce a second,
  // disagreeing answer.
  useEffect(() => {
    let cancelled = false;
    setRoles(null);
    setLoadError(null);
    listGuestRoles(scope.tenantId)
      .then((r) => {
        if (!cancelled) setRoles(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.tenantId]);

  // Only offer levels the gateway actually declared for this agent: a config
  // with no write path has no write role to grant, and offering it would produce
  // an invite that cannot be sent.
  const levels = useMemo(
    () => (roles && agent ? availableLevels(roles, agent) : []),
    [roles, agent],
  );

  useEffect(() => {
    if (levels.length && !levels.includes(level)) setLevel(levels[0]);
  }, [levels, level]);

  const roleId = roles && agent ? resolveRoleId(roles, agent, level) : null;
  const emailOk = isValidEmail(email);
  const canSubmit = !!roleId && emailOk && !!scope.subsAccId && !submitting;

  async function submit() {
    if (!roleId || !scope.subsAccId) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const address = email.trim();
    try {
      const { alreadyInvited } = await inviteMember({
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId,
        roleId,
        email: address,
      });
      setNotice(
        alreadyInvited
          ? t.alreadyInvited.replace("{email}", address)
          : t.invited
              .replace("{email}", address)
              .replace("{agent}", agent)
              .replace("{level}", levelLabel[level]),
      );
      setEmail("");
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (roles === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size={18} />
      </div>
    );
  }

  const buttonLabel = submitting ? t.submitting : t.submit;

  // Inviting reaches another person, and was reported landing in the wrong place. The
  // dialog is the moment the target is spelled out in full — tenant, subscription, agent,
  // level — rather than read off chrome the admin has stopped seeing.
  function activate() {
    setConfirming(true);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-elevated px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <UserPlus size={16} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="text-sm font-semibold text-fg">{t.title}</span>
      </div>

      {/* Two fields, not three. The agent came out; the level stays, because read vs.
          write is a genuine per-invitation choice and is not carried by the context. */}
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <Input
          inputSize="sm"
          type="email"
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className={selectClass}
          value={level}
          onChange={(e) => setLevel(e.target.value as AccessLevel)}
          aria-label={t.accessAria}
          disabled={levels.length === 0}
        >
          {levels.map((l) => (
            <option key={l} value={l}>
              {levelLabel[l]}
            </option>
          ))}
        </select>
      </div>

      {email && !emailOk && (
        <p className="text-xs text-fg-muted">{t.waitingEmail}</p>
      )}
      {agent && levels.length === 0 && (
        <p className="text-xs text-fg-muted">{t.noRole.replace("{agent}", agent)}</p>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}

      {/* It says, in words, which tenant and which subscription this lands in. */}
      <ConfirmDialog
        open={confirming}
        title={t.confirmTitle}
        message={t.confirmMessage
          .replace("{email}", email.trim())
          .replace("{level}", levelLabel[level])
          .replace("{agent}", agent)}
        detail={t.confirmDetail
          .replace("{tenant}", tenantLabel)
          .replace("{subscription}", scopeLabel)}
        confirmLabel={t.confirm}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void submit();
        }}
      />

      <Button size="sm" variant="filled" onClick={activate} disabled={!canSubmit}>
        {buttonLabel}
      </Button>
    </div>
  );
}
