"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  clearModelPolicy,
  getModelPolicy,
  listAdminUserModels,
  policyChoice,
  setAdminUserModelEnabled,
  setModelPolicy,
  type AdminUserModel,
  UNSET_POLICY,
  type ModelPolicy,
  type PolicyChoice,
} from "@/lib/adminUserModels";
import type { ScopeRef } from "@/lib/admin";
import type { Instance } from "@/lib/mycelium";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { Accordion } from "@/components/ui/accordion";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";
import { errorCopy, errorText } from "@/lib/i18n/errors";

// The administrator's half of user-owned-models, under the Model tab: what
// members registered for themselves, and whether they may at this scope.
//
// Read plus two switches, never an edit. An administrator turning one off drops
// that member back to the organisation's model; changing somebody else's
// endpoint or key is not an authority this screen grants, and no response it
// reads carries a key.

const selectClass = "h-9 rounded-lg border border-brand bg-surface px-2 text-xs text-fg";

export default function UserModelsPanel({
  scope,
  target,
}: {
  scope: ScopeRef;
  target: Instance;
}) {
  const t = useT(adminCopy).userModels;
  const errs = useT(errorCopy);

  const [models, setModels] = useState<AdminUserModel[] | null>(null);
  const [policy, setPolicy] = useState<ModelPolicy>(UNSET_POLICY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The listing is per SUBSCRIPTION: a personal model belongs to an account, and
  // the subscription roster is the only authority on which accounts are here.
  const subsAccId = scope.kind === "subscription" ? scope.subsAccId : undefined;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, list] = await Promise.all([
        getModelPolicy(target, scope),
        subsAccId
          ? listAdminUserModels(target, scope.tenantId, subsAccId)
          : Promise.resolve<AdminUserModel[]>([]),
      ]);
      setPolicy(p);
      setModels(list);
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
      setModels([]);
    }
    // errs is a dictionary object rebuilt per render; including it would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, scope.kind, scope.tenantId, subsAccId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
    } finally {
      setBusy(false);
    }
  }

  // One handler for both switches: each names its own field, so releasing one to
  // inheritance never touches the other.
  function onPolicy(field: "user_models" | "custom_endpoint", choice: PolicyChoice) {
    void mutate(() =>
      choice === "inherit"
        ? clearModelPolicy(target, scope, field)
        : setModelPolicy(
            target,
            scope,
            field === "user_models"
              ? { userModels: choice === "allow" }
              : { customEndpoint: choice === "allow" },
          ),
    );
  }

  const current = policyChoice(policy.userModels);
  const currentEndpoint = policyChoice(policy.customEndpoint);

  // The closed section already answers the question an administrator opens it
  // for: are personal models allowed here, and how many exist.
  const summary =
    current === "block"
      ? t.summaryBlocked
      : models === null
        ? "…"
        : t.summaryCount.replace("{n}", String(models.length));

  return (
    <Accordion title={t.title} summary={summary} hint={t.hint} defaultOpen={false}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-muted">{t.policyLabel}</span>
          <select
            className={selectClass}
            value={current}
            disabled={busy}
            onChange={(e) => onPolicy("user_models", e.target.value as PolicyChoice)}
          >
            {/* "Inherit" is its own option, not the absence of one: unset here and
                deliberately allowed here are different facts, and only the first
                follows a wider level when that level changes. */}
            <option value="inherit">{t.policyInherit}</option>
            <option value="allow">{t.policyAllow}</option>
            <option value="block">{t.policyBlock}</option>
          </select>
          <span className="text-[11px] leading-relaxed text-fg-muted">{t.policyHint}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-muted">{t.endpointLabel}</span>
          <select
            className={selectClass}
            value={currentEndpoint}
            disabled={busy}
            onChange={(e) => onPolicy("custom_endpoint", e.target.value as PolicyChoice)}
          >
            {/* This one INHERITS to "blocked", the opposite of the switch above:
                picking a provider chooses among endpoints the instance ships,
                while typing one aims the proxy's outbound request wherever the
                member likes. So the option says where inheriting lands. */}
            <option value="inherit">{t.endpointInherit}</option>
            <option value="allow">{t.endpointAllow}</option>
            <option value="block">{t.endpointBlock}</option>
          </select>
          <span className="text-[11px] leading-relaxed text-fg-muted">{t.endpointHint}</span>
        </div>

        {error && <Alert severity="error">{error}</Alert>}

        {scope.kind !== "subscription" ? (
          // A tenant selection cannot list members: the roster is per
          // subscription. The policy control above still applies at this level.
          <p className="text-[11px] leading-relaxed text-fg-muted">{t.selectSubscription}</p>
        ) : models === null ? (
          <div className="flex justify-center py-3">
            <Spinner size={18} />
          </div>
        ) : models.length === 0 ? (
          <PanelEmpty icon={Users} title={t.empty} body={t.emptyHint} />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {models.map((m) => (
              <li
                key={`${m.owner_acc_id}/${m.slug}`}
                className="flex flex-col gap-1 rounded-lg border border-brand/30 bg-elevated px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-fg">
                    {m.label || m.slug}
                  </span>
                  {!m.enabled && <Badge tone="neutral">{t.disabled}</Badge>}
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      mutate(() =>
                        setAdminUserModelEnabled(target, scope.tenantId, subsAccId!, m, !m.enabled),
                      )
                    }
                  >
                    {m.enabled ? t.disable : t.enable}
                  </Button>
                </div>
                <span className="truncate font-mono text-[11px] text-fg-muted">
                  {m.provider} · {m.model} · {m.api_base}
                </span>
                <span className="text-[11px] text-fg-muted">
                  {t.owner.replace("{id}", m.owner_acc_id)} ·{" "}
                  {!m.last_test
                    ? t.neverTested
                    : m.last_test.ok
                      ? t.lastTestOk.replace("{ms}", String(m.last_test.latency_ms))
                      : t.lastTestFailed}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Accordion>
  );
}
