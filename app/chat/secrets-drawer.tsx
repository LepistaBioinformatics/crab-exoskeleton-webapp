"use client";

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import { KeyRound, X } from "lucide-react";
import {
  listSecrets,
  setSecret,
  deleteSecret,
  SECRET_FORMATS,
  USER_SECRET_FORMATS,
  type SecretNames,
  type SecretFormat,
} from "@/lib/secrets";
import type { Workspace } from "./fragment";
import OwnModelsSection from "./own-models-section";
import SecretFormatGroup from "./secret-format-group";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

const backdrop = cva("fixed inset-0 z-40 bg-black/40 transition-opacity", {
  variants: { open: { true: "opacity-100", false: "pointer-events-none opacity-0" } },
});

const panel = cva(
  "fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[90vw] flex-col border-l border-brand bg-surface shadow-xl transition-transform",
  { variants: { open: { true: "translate-x-0", false: "translate-x-full" } } },
);

// The drawer is a stack of collapsible groups: the model first, then one group
// per secret sink.
//
// FILE is deliberately not writable. Its sink stopped reaching the container
// when the `.secrets` mount moved from the member's own store to the merged
// effective view (crab-shell-proxy c52e19a): that view is built from the dotenv,
// json and native sinks only, so a `file` secret is still stored, listed and
// deletable — and never delivered. Offering a form for it would store something
// nothing can read. Existing entries stay listed so they can be removed.
//
// NATIVE is not writable either, for a different reason: picoclaw's own slots
// are published by administrators (native-secrets-admin-only). Entries predating
// that rule stay listed and deletable, because they are the member's own data.
const WRITABLE: SecretFormat[] = USER_SECRET_FORMATS.filter((f) => f !== "file");

export default function SecretsDrawer({
  workspace,
  open,
  onClose,
  onRestartNeeded,
}: {
  workspace: Workspace;
  open: boolean;
  onClose: () => void;
  // Called after a write or delete. The proxy no longer force-restarts on a
  // member's own secret change (restart-control DEC-3) -- it leaves a notice --
  // so the screen has to be told to re-check, or the member would not see the
  // banner until the next poll.
  onRestartNeeded?: () => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const errs = useT(errorCopy);
  const [secrets, setSecrets] = useState<SecretNames | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Set after a successful write/delete so the drawer says, in place, that the
  // change is stored but not yet live. The restart banner behind the drawer says
  // the same thing and carries the button; this is the confirmation at the point
  // of action, so the member is not left wondering whether the save worked.
  const [savedNeedsRestart, setSavedNeedsRestart] = useState(false);

  const refresh = () => listSecrets(workspace).then(setSecrets);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSecrets(null);
    setLoadError(null);
    setSavedNeedsRestart(false);
    listSecrets(workspace)
      .then((s) => {
        if (!cancelled) setSecrets(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace.t, workspace.s, workspace.r]);

  // Returns whether the write landed, so the group can decide to clear its form.
  async function onSave(format: SecretFormat, name: string, value: string): Promise<boolean> {
    setBusy(name);
    setLoadError(null);
    try {
      await setSecret(workspace, { format, name, value });
      // Publish BEFORE refreshing: the secret is already stored, so a failed
      // list refresh must not swallow the fact that a restart is now needed.
      setSavedNeedsRestart(true);
      onRestartNeeded?.();
      await refresh();
      return true;
    } catch (err) {
      setLoadError(errorText(errs, err instanceof Error ? err.message : null));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(fmt: SecretFormat, secretName: string) {
    if (!window.confirm(t.secrets.deleteConfirm.replace("{name}", secretName))) return;
    setBusy(secretName);
    setLoadError(null);
    try {
      await deleteSecret(workspace, { format: fmt, name: secretName });
      setSavedNeedsRestart(true);
      onRestartNeeded?.();
      await refresh();
    } catch (err) {
      setLoadError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setBusy(null);
    }
  }

  // Every writable sink is always offered — an empty group is where a member
  // goes to add the first one. A read-only sink appears only when it HOLDS
  // something: an empty group with no form and nothing in it is pure noise.
  const groups = SECRET_FORMATS.filter(
    (f) => WRITABLE.includes(f) || (secrets?.[f]?.length ?? 0) > 0,
  );

  return (
    <>
      <div className={backdrop({ open })} onClick={onClose} aria-hidden />

      <aside className={panel({ open })} role="dialog" aria-label={t.secrets.title}>
        <div className="flex items-center gap-2 border-b border-brand/30 px-4 py-3">
          <KeyRound size={18} className="text-accent" aria-hidden />
          <h2 className="flex-1 font-display text-base font-semibold text-fg">{t.secrets.title}</h2>
          <IconButton variant="ghost" size="sm" aria-label={c.actions.close} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          <p className="mb-4 text-xs leading-relaxed text-fg-muted">
            {t.secrets.savedForBefore}
            <strong className="text-fg">{t.secrets.savedForYou}</strong>
            {t.secrets.savedForOn}
            <strong className="text-fg">
              {t.view.agentPrefix} {workspace.r}
            </strong>
            {t.secrets.savedForAfter}
            <strong className="text-fg">{t.secrets.restartsAgent}</strong>
            {t.secrets.restartsAfter}
          </p>

          {savedNeedsRestart && busy === null && (
            <div className="mb-3">
              <Alert severity="info">{t.secrets.savedNeedsRestart}</Alert>
            </div>
          )}

          {loadError && (
            <div className="mb-3">
              <Alert severity="error">{loadError}</Alert>
            </div>
          )}

          <div className="flex flex-col">
            {/* Which model is answering comes FIRST: it is the more urgent of the
                two questions this drawer answers, and a member who came here to
                fix a broken model should not scroll past four secret sinks.
                Mounted only while the drawer is open, so closing it does not
                leave a poll or a half-filled key field alive behind the
                backdrop. */}
            {open && (
              <OwnModelsSection
                workspace={workspace}
                onChanged={onRestartNeeded ?? (() => {})}
              />
            )}

            {secrets === null && !loadError ? (
              <div className="flex justify-center py-4">
                <Spinner size={20} />
              </div>
            ) : (
              groups.map((fmt) => {
                const copy = t.secrets.formats[fmt];
                return (
                  <SecretFormatGroup
                    key={fmt}
                    format={fmt}
                    title={copy.title}
                    hint={copy.hint}
                    // Only the sinks that need a caveat carry one, so the type is
                    // a union and the check has to be structural.
                    notice={"notice" in copy ? copy.notice : undefined}
                    names={secrets?.[fmt] ?? []}
                    writable={WRITABLE.includes(fmt)}
                    busy={busy}
                    onSave={onSave}
                    onDelete={onDelete}
                  />
                );
              })
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
