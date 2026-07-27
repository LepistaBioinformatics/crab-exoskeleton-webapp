"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { listAgents, type ScopeRef } from "@/lib/admin";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

const selectClass =
  "h-9 w-full rounded-lg border border-brand bg-elevated px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

// Invite someone to this subscription (subscription-invitations FR-1). The form
// asks for an agent and an access level; both together resolve to the mycelium
// guest role id that actually grants access, because permission is a property of
// the role rather than of the guesting call.
//
// Reaching this panel already proves the caller administers the scope — the
// admin screen only lists scopes the proxy says they can manage — so there is no
// second gate here. Mycelium re-checks anyway and its status is surfaced.
export default function InviteMember({
  scope,
  onInvited,
}: {
  scope: ScopeRef;
  onInvited: () => void;
}) {
  const t = useT(adminCopy).invite;
  const levelLabel: Record<AccessLevel, string> = { read: t.read, write: t.write };
  const [roles, setRoles] = useState<GuestRole[] | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [agent, setAgent] = useState("");
  const [level, setLevel] = useState<AccessLevel>("write");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Roles change only when the gateway config does, so this is fetched once per
  // tenant and kept for the session.
  useEffect(() => {
    let cancelled = false;
    setRoles(null);
    setLoadError(null);
    Promise.all([listGuestRoles(scope.tenantId), listAgents()])
      .then(([r, a]) => {
        if (cancelled) return;
        setRoles(r);
        const keys = a.map((x) => x.key);
        setAgents(keys);
        setAgent((current) => current || keys[0] || "");
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
    try {
      const { alreadyInvited } = await inviteMember({
        tenantId: scope.tenantId,
        subsAccId: scope.subsAccId,
        roleId,
        email: email.trim(),
      });
      setNotice(
        alreadyInvited
          ? t.alreadyInvited.replace("{email}", email.trim())
          : t.invited
              .replace("{email}", email.trim())
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

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-elevated px-3 py-3">
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="text-sm font-semibold text-fg">{t.title}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          inputSize="sm"
          type="email"
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className={selectClass}
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          aria-label={t.agentAria}
        >
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
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

      <Button size="sm" variant="filled" onClick={submit} disabled={!canSubmit}>
        {submitting ? t.submitting : t.submit}
      </Button>
    </div>
  );
}
