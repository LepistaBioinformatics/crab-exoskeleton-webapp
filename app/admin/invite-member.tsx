"use client";

import { useEffect, useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import { UserMinus, UserPlus } from "lucide-react";
import { listAgents, type ScopeRef } from "@/lib/admin";
import {
  availableLevels,
  inviteMember,
  isValidEmail,
  listGuestRoles,
  resolveRoleId,
  revokeMember,
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

// The two directions of the same relation, so they share one set of fields
// instead of appearing as two panels asking for the same three things. Mirrors
// the mode switch on the admin shell rather than inventing a second idiom.
const actionButton = cva(
  "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
  {
    variants: {
      active: {
        true: "bg-accent text-accent-fg",
        false: "text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

type InviteAction = "invite" | "uninvite";

// Invite someone to this subscription, or take that invitation back
// (subscription-invitations FR-1, subscription-uninvite FR-1). The form asks for
// an agent and an access level; both together resolve to the mycelium guest role
// id, because permission is a property of the role rather than of the guesting
// call — which is equally true of ungusting, so uninvite needs the same pair and
// reuses the same three inputs.
//
// Resolving the role from the form rather than from a roster label is also what
// makes this reachable at all: a label only parses back into (agent, level) when
// the guest row's role could be named, and this path never depends on that.
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

  const [action, setAction] = useState<InviteAction>("invite");
  const [email, setEmail] = useState("");
  const [agent, setAgent] = useState("");
  const [level, setLevel] = useState<AccessLevel>("write");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  // Switching direction drops the previous result: an "Invited …" notice still on
  // screen under a Remove button reads as a report on what is about to happen.
  function chooseAction(next: InviteAction) {
    setAction(next);
    setError(null);
    setNotice(null);
  }

  async function submit() {
    if (!roleId || !scope.subsAccId) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const address = email.trim();
    try {
      if (action === "invite") {
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
      } else {
        // Whether that address was ever invited to this role is mycelium's
        // answer, not something worth pre-checking against a roster the panel
        // may have loaded before the change.
        await revokeMember({
          tenantId: scope.tenantId,
          subsAccId: scope.subsAccId,
          roleId,
          email: address,
        });
        setNotice(
          t.uninvited
            .replace("{email}", address)
            .replace("{agent}", agent)
            .replace("{level}", levelLabel[level]),
        );
      }
      setEmail("");
      onInvited();
    } catch (e) {
      const fallback = action === "invite" ? t.failed : t.uninviteFailed;
      setError(e instanceof Error ? e.message : fallback);
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

  const uninviting = action === "uninvite";
  const buttonLabel = uninviting
    ? submitting
      ? t.uninviting
      : t.uninviteSubmit
    : submitting
      ? t.submitting
      : t.submit;

  function activate() {
    if (uninviting) setConfirming(true);
    else void submit();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-elevated px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {uninviting ? (
          <UserMinus size={16} className="shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <UserPlus size={16} className="shrink-0 text-fg-muted" aria-hidden />
        )}
        <span className="text-sm font-semibold text-fg">
          {uninviting ? t.uninviteTitle : t.title}
        </span>
        <div
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-brand/40 p-0.5"
          role="group"
          aria-label={t.actionAria}
        >
          <button
            type="button"
            className={actionButton({ active: !uninviting })}
            aria-pressed={!uninviting}
            onClick={() => chooseAction("invite")}
          >
            {t.actionInvite}
          </button>
          <button
            type="button"
            className={actionButton({ active: uninviting })}
            aria-pressed={uninviting}
            onClick={() => chooseAction("uninvite")}
          >
            {t.actionUninvite}
          </button>
        </div>
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
        <p className="text-xs text-fg-muted">
          {(uninviting ? t.noRoleUninvite : t.noRole).replace("{agent}", agent)}
        </p>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}

      {/* Removing access reaches another person and cannot be undone from here,
          so it is confirmed. Inviting is additive and fires directly. */}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={t.uninviteConfirmTitle}
        message={t.uninviteConfirmMessage
          .replace("{email}", email.trim())
          .replace("{level}", levelLabel[level])
          .replace("{agent}", agent)}
        detail={t.uninviteConfirmDetail}
        confirmLabel={t.uninviteConfirm}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void submit();
        }}
      />

      <Button
        size="sm"
        variant={uninviting ? "outlined" : "filled"}
        onClick={activate}
        disabled={!canSubmit}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
