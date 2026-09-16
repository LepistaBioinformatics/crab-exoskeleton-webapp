"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, fieldControlClass, Ident } from "./field";
import {
  createSubscriptionAccount,
  deleteSubscriptionAccount,
  listSubscriptionAccounts,
  type SubscriptionAccountRow,
} from "@/lib/tenantAdmin";
import { adminCopy } from "@/lib/i18n/admin";
import { commonCopy } from "@/lib/i18n/common";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// The subscription accounts under one tenant.
//
// Creating one here is the moment a workspace comes into existence: the BFF calls
// `createSubscriptionAccount`, mycelium emits `subscriptionAccount.created`, and
// the proxy provisions the workspace off that webhook. Nothing in this panel can
// show that second half happening, which is exactly why the route comment names
// it -- a future edit that "simplifies" the create call would break provisioning
// silently.
export default function DirectoryAccountsPanel({ tenantId }: { tenantId: string }) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);

  // `null` is "not loaded" and holds a spinner; `[]` is "loaded, none there" and
  // renders the empty copy. Collapsing the two would show an empty state during
  // every fetch.
  const [accounts, setAccounts] = useState<SubscriptionAccountRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [term, setTerm] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SubscriptionAccountRow | null>(null);

  const refresh = useCallback(async () => {
    const out = await listSubscriptionAccounts(tenantId, term);
    setAccounts(out.accounts);
    setTruncated(out.truncated);
  }, [tenantId, term]);

  useEffect(() => {
    let cancelled = false;
    listSubscriptionAccounts(tenantId, term)
      .then((out) => {
        if (cancelled) return;
        setAccounts(out.accounts);
        setTruncated(out.truncated);
      })
      .catch((err: Error) => !cancelled && setError(errorText(e, err.message)));
    return () => {
      cancelled = true;
    };
  }, [tenantId, term, e]);

  async function run(key: string, work: () => Promise<void>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      setNotice(done);
      // Refetch, never an optimistic patch -- the house rule, and here it also
      // picks up flags the gateway may have changed alongside the one asked for.
      await refresh();
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : "unknown"));
    } finally {
      setBusy(null);
    }
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void run(
      "create",
      async () => {
        await createSubscriptionAccount({ tenantId, name: name.trim() });
        setName("");
      },
      t.directory.accountCreated,
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">
          {t.directory.accountsTitle}
        </h2>
        <p className="mt-1 max-w-[62ch] text-xs text-fg-muted">
          {t.directory.accountsIntro}
        </p>
      </div>

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}
      {truncated && <Alert severity="info">{t.directory.truncated}</Alert>}

      <form onSubmit={onCreate} className="flex max-w-md flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={t.directory.accountName} htmlFor="account-name">
            <Input
              id="account-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder={t.directory.accountNamePlaceholder}
              className={fieldControlClass()}
              disabled={busy !== null}
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy !== null || !name.trim()}>
          {t.directory.accountCreate}
        </Button>
      </form>

      <Field label={t.directory.search} htmlFor="account-search">
        <Input
          id="account-search"
          value={term}
          onChange={(ev) => setTerm(ev.target.value)}
          className={fieldControlClass()}
        />
      </Field>

      {accounts === null ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} />
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.directory.accountsNone}</p>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {accounts.map((account) => (
            <li key={account.id} className="flex min-h-11 flex-wrap items-center gap-2 p-3">
              <div className="min-w-48 flex-1">
                <p className="text-sm text-fg">{account.name}</p>
                <p className="text-xs text-fg-muted">
                  <Ident>{account.id}</Ident>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {account.isActive && <Badge>{t.directory.statusActive}</Badge>}
                {!account.isActive && <Badge>{t.directory.statusInactive}</Badge>}
                {account.isChecked && <Badge>{t.directory.statusApproved}</Badge>}
                {account.isArchived && <Badge>{t.directory.statusArchivedAcc}</Badge>}
              </div>
              {/* The status badges above are READ-ONLY. Activate/approve/archive and
                  their inverses were removed deliberately: the states are mycelium's
                  to manage, and a row of six toggles beside a delete button made the
                  destructive one just another control in the line. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="text"
                  className="text-blocked"
                  disabled={busy !== null}
                  onClick={() => setPendingDelete(account)}
                >
                  {t.directory.accountDelete}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={t.directory.accountDeleteTitle}
        message={t.directory.accountDeleteBody}
        confirmLabel={c.actions.delete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void run(
            `${target.id}:delete`,
            () => deleteSubscriptionAccount(target.id, tenantId),
            t.directory.accountDeleted,
          );
        }}
      />
    </div>
  );
}
