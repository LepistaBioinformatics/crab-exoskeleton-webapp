"use client";

import { FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldControlClass } from "./field";
import { createTenant } from "@/lib/tenantAdmin";
import { adminCopy } from "@/lib/i18n/admin";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// The tenants area with nothing selected: what a tenant is, and the form that
// makes one.
//
// The LIST is the column beside this, not a table in here -- selecting a tenant is
// navigation, and the column browser is what this screen uses for navigation. What
// is left for the panel is the one thing a column cannot do.
export default function DirectoryTenantsPanel({
  truncated,
  onCreated,
}: {
  truncated: boolean;
  onCreated: () => void;
}) {
  const t = useT(adminCopy);
  const e = useT(errorCopy);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await createTenant({ name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
      setNotice(t.directory.created);
      // The list lives in the column, so the screen refetches it -- this panel
      // cannot refresh something it does not own.
      onCreated();
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : "unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">
          {t.directory.tenantsTitle}
        </h2>
        <p className="mt-1 max-w-[62ch] text-xs text-fg-muted">{t.directory.tenantsIntro}</p>
        <p className="mt-1 max-w-[62ch] text-xs text-fg-muted">{t.directory.tenantsPick}</p>
      </div>

      {truncated && <Alert severity="info">{t.directory.truncated}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}

      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        <Field label={t.directory.createName} htmlFor="tenant-name">
          <Input
            id="tenant-name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder={t.directory.createNamePlaceholder}
            className={fieldControlClass()}
            disabled={busy}
          />
        </Field>
        <Field label={t.directory.createDescription} htmlFor="tenant-description">
          <Input
            id="tenant-description"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            placeholder={t.directory.createDescriptionPlaceholder}
            className={fieldControlClass()}
            disabled={busy}
          />
        </Field>
        {/* Stated on the form, because it decides who can edit the tenant after
            this and there is no other moment to say it. */}
        <p className="text-xs text-fg-muted">{t.directory.createOwnerNote}</p>
        <Button type="submit" disabled={busy || !name.trim()}>
          {t.directory.createSubmit}
        </Button>
      </form>
    </div>
  );
}
