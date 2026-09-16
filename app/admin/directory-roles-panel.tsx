"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, fieldControlClass, Ident } from "./field";
import { listGuestRoles, type GuestRoleRow } from "@/lib/tenantAdmin";
import { permissionLevel } from "@/lib/invitations";
import { adminCopy } from "@/lib/i18n/admin";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// Guest roles, which in this stack are how an agent becomes grantable at all: a
// role's NAME is the agent key the gateway routes on, and its permission is the
// access level.
//
// READ-ONLY, DELIBERATELY. Roles are declared in the mycelium gateway's config and
// propagated into the database when the gateway boots, by a routine that CREATES
// and never updates and that matches on `(slug, permission)`. Anything written
// here would either be a role no route references, or a divergence the next boot
// turns into two rows with the grants on the wrong one. The config file is where a
// role is added, renamed or removed; this screen reports what that produced.
//
// Global, not per-tenant: `guestManager.guestRoles.list` takes no tenant, which is
// why this is a sibling of the tenant list rather than a section inside a tenant.
export default function DirectoryRolesPanel() {
  const t = useT(adminCopy);
  const e = useT(errorCopy);

  // `null` is "not loaded" and holds a spinner; `[]` is "loaded, none there".
  const [roles, setRoles] = useState<GuestRoleRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listGuestRoles(term)
      .then((out) => {
        if (cancelled) return;
        setRoles(out.roles);
        setTruncated(out.truncated);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(errorText(e, err.message));
        // Settle the state, or the spinner never clears on a failed fetch.
        setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [term, e]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-fg">
          {t.directory.rolesTitle}
        </h2>
        <p className="mt-1 max-w-[62ch] text-xs text-fg-muted">{t.directory.rolesIntro}</p>
      </div>

      {/* Said on the screen, not only in the code: an admin who cannot find a
          create button should learn where roles come from instead of concluding
          the screen is broken. */}
      <Alert severity="info">{t.directory.rolesReadOnly}</Alert>

      {error && <Alert severity="error">{error}</Alert>}
      {truncated && <Alert severity="info">{t.directory.truncated}</Alert>}

      <Field label={t.directory.search} htmlFor="role-search">
        <Input
          id="role-search"
          value={term}
          onChange={(ev) => setTerm(ev.target.value)}
          className={fieldControlClass()}
        />
      </Field>

      {roles === null ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} />
        </div>
      ) : roles.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.directory.rolesNone}</p>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {roles.map((role) => {
            // A permission arrives as the integer discriminant OR its string form,
            // depending on the endpoint. `permissionLevel` normalizes both, matching
            // exactly rather than by substring.
            const level = permissionLevel(role.permission);
            return (
              <li key={role.id} className="flex min-h-11 flex-wrap items-center gap-2 p-3">
                <div className="min-w-48 flex-1">
                  {/* The name IS the agent key, so it renders verbatim. */}
                  <p className="text-sm text-fg">
                    <Ident>{role.name}</Ident>
                  </p>
                  {role.description && (
                    <p className="text-xs text-fg-muted">{role.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {level && (
                    <Badge>{level === "write" ? t.directory.write : t.directory.read}</Badge>
                  )}
                  {role.system && <Badge>{t.directory.roleSystem}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
