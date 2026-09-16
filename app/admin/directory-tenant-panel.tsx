"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Field, fieldControlClass, Ident } from "./field";
import {
  deleteTenant,
  saveTenantBrand,
  updateTenant,
  type TenantRow,
} from "@/lib/tenantAdmin";
import { encodeBrandLogo, isWithinBrandLimit } from "@/lib/brandImage";
import { adminCopy } from "@/lib/i18n/admin";
import { commonCopy } from "@/lib/i18n/common";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// One tenant: its identity, its status, its logo, and its removal.
//
// EVERYTHING HERE RENDERS FROM THE ROW THE LIST ALREADY RETURNED. There is no
// fetch-one call, and that is not an optimisation: `tenantManager.tenant.get`
// refuses a staff caller who does not own the tenant, which is precisely the
// caller this screen exists for. The list attaches owners and tags to every row,
// so the detail view has what it needs -- including the brand tag and its id.
export default function DirectoryTenantPanel({
  tenant,
  onChanged,
}: {
  tenant: TenantRow;
  onChanged: () => void;
}) {
  const t = useT(adminCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);

  const [name, setName] = useState(tenant.name);
  const [description, setDescription] = useState(tenant.description ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logo, setLogo] = useState<string | null>(tenant.brandLogo ?? null);

  // Selecting a different tenant reuses this component, so the draft fields have
  // to follow the row rather than keep the previous tenant's text.
  useEffect(() => {
    setName(tenant.name);
    setDescription(tenant.description ?? "");
    setLogo(tenant.brandLogo ?? null);
    setError(null);
    setNotice(null);
  }, [tenant.id, tenant.name, tenant.description, tenant.brandLogo]);

  async function run(key: string, work: () => Promise<void>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      setNotice(done);
      onChanged();
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : "unknown"));
    } finally {
      setBusy(null);
    }
  }

  function onRename(event: FormEvent) {
    event.preventDefault();
    void run(
      "rename",
      () =>
        updateTenant(tenant.id, {
          action: "rename",
          name: name.trim() || undefined,
          description: description.trim() || undefined,
        }),
      t.directory.renamed,
    );
  }

  async function onPickLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!file.type.startsWith("image/")) {
      setError(t.directory.brandNotImage);
      return;
    }
    setBusy("logo");
    try {
      const encoded = await encodeBrandLogo(file);
      if (!isWithinBrandLimit(encoded)) {
        setError(t.directory.brandTooLarge);
        return;
      }
      setLogo(encoded);
    } catch {
      setError(errorText(e, "unknown"));
    } finally {
      setBusy(null);
    }
  }

  function onSaveLogo() {
    if (!logo) return;
    void run(
      "saveLogo",
      () =>
        // THE WHOLE META MAP, every time. A tag write replaces it rather than
        // merging, so re-sending what the tag already carried is what keeps the
        // colour from disappearing along with the logo change.
        saveTenantBrand(tenant.id, {
          tagId: tenant.brandTagId ?? null,
          meta: {
            ...(tenant.brandColor ? { primaryColor: tenant.brandColor } : {}),
            base64Logo: logo,
          },
        }),
      t.directory.brandSaved,
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold text-fg">
            {t.directory.overviewTitle}
          </h2>
          {tenant.verified && <Badge>{t.directory.verifiedBadge}</Badge>}
          {tenant.archived && <Badge>{t.directory.archivedBadge}</Badge>}
        </div>
        <p className="text-xs text-fg-muted">
          {t.directory.idLabel}: <Ident>{tenant.id}</Ident>
        </p>
        {/* Ownership is knowable here because the list returns the owner ids, and
            the caller's own id is compared server-side. Saying it up front beats
            a refusal that arrives worded as a malformed request. */}
        <p className="max-w-[62ch] text-xs text-fg-muted">
          {tenant.ownedByCaller ? t.directory.ownedByYou : t.directory.notOwnedByYou}
        </p>
      </section>

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}

      <form onSubmit={onRename} className="max-w-md space-y-3">
        <Field label={t.directory.createName} htmlFor="tenant-rename">
          <Input
            id="tenant-rename"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            className={fieldControlClass()}
            disabled={busy !== null}
          />
        </Field>
        <Field label={t.directory.createDescription} htmlFor="tenant-redescribe">
          <Input
            id="tenant-redescribe"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            className={fieldControlClass()}
            disabled={busy !== null}
          />
        </Field>
        <Button type="submit" disabled={busy !== null || !name.trim()}>
          {t.directory.renameSubmit}
        </Button>
      </form>

      <section className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          disabled={busy !== null}
          onClick={() =>
            void run(
              "archive",
              () => updateTenant(tenant.id, { action: "archive" }),
              t.directory.archiveDone,
            )
          }
        >
          {tenant.archived ? t.directory.unarchive : t.directory.archive}
        </Button>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-fg">
            {t.directory.brandTitle}
          </h3>
          <p className="mt-1 max-w-[62ch] text-xs text-fg-muted">
            {t.directory.brandIntro}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="size-12 rounded-lg border border-rule object-cover"
            />
          ) : (
            <p className="text-xs text-fg-muted">{t.directory.brandNone}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={fieldControlClass() + " inline-flex w-auto cursor-pointer items-center px-3"}>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onPickLogo}
              disabled={busy !== null}
            />
            {t.directory.brandPick}
          </label>
          <Button
            variant="outlined"
            disabled={busy !== null || !logo || logo === tenant.brandLogo}
            onClick={onSaveLogo}
          >
            {t.directory.brandSave}
          </Button>
        </div>
      </section>

      <section>
        <Button
          variant="outlined"
          className="border-blocked text-blocked"
          disabled={busy !== null}
          onClick={() => setConfirmDelete(true)}
        >
          {t.directory.deleteTenant}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title={t.directory.deleteTenantTitle}
        message={t.directory.deleteTenantBody}
        confirmLabel={c.actions.delete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void run("delete", () => deleteTenant(tenant.id), t.directory.deleted);
        }}
      />
    </div>
  );
}
