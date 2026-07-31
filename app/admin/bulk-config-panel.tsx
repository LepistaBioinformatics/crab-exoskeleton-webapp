"use client";

import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import { type ScopeRef } from "@/lib/admin";
import {
  applyConfigKey,
  inspectConfigKey,
  listConfigKeys,
  type ConfigKeyBucket,
  type ScopeConfigInspection,
  type ScopeConfigResult,
  type TemplateCatalog,
} from "@/lib/scopeConfig";
import {
  displayBuckets,
  groupOutcomes,
  inspectionKey,
  isManagedKey,
  parseValueInput,
  prettyJson,
  previewCounts,
  revisionsFor,
} from "./bulk-config-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { Field, fieldControlClass } from "./field";
import { SYNTAX_ROLE, tokenize } from "./json-tokens";
import { roleClass } from "@/lib/syntax-theme";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

// One config.json key, across every instance of one agent in one subscription
// (admin-bulk-instance-config).
//
// The READ half is the reason this screen exists. A bulk write with no view of
// what each member currently holds is a blind overwrite, so the distribution
// comes first and the value field only appears once it has been read. The
// per-instance revisions that make the write safe come from that same read —
// which is also why an inspection is discarded the moment the scope, agent or key
// changes underneath it (see `identity` below).

// A bucket that holds no value is not one more thing someone has — it is an
// instance the change cannot touch. Dashed and dimmed so the difference is
// visible before the label is read.
const bucketCard = cva("rounded-lg border px-3 py-2", {
  variants: {
    excluded: {
      true: "border-dashed border-brand/30 bg-elevated/40",
      false: "border-brand/30 bg-elevated",
    },
  },
  defaultVariants: { excluded: false },
});

// bulkPolicy downgrades "now" to "notice" for this panel, and it is the one place
// the screen deliberately does not do what the shared restart control says.
//
// The control is shared by every panel and initialised to "now", so it cannot tell
// "the admin chose an immediate bounce" from "nobody touched it". Here those two
// are not equally cheap: "now" means every changed member of the subscription
// loses its running agent at once, from one click. So an incoming "now" is read as
// UNSPECIFIED and the safer mode is sent — matching the proxy, which defaults an
// absent parameter to notice on this endpoint alone (DEC-9).
//
// The cost is real and must stay visible: an admin cannot request an immediate
// bounce from this tab, and the panel says so next to the submit button rather
// than letting the control quietly disagree with the request. An immediate bounce
// is still available from the scope-wide restart action.
function bulkPolicy(policy: RestartPolicy): RestartPolicy {
  if (policy.mode !== "now") return policy;
  return { mode: "notice", note: policy.note };
}

export default function BulkConfigPanel({
  scope,
  agent,
  restartPolicy = DEFAULT_POLICY,
}: {
  scope: ScopeRef;
  agent: string;
  /**
   * How the bounce of every CHANGED workspace is delivered. Only the instances
   * this apply actually wrote are restarted or notified — an instance that
   * already matched is not touched (proxy DEC-8).
   */
  restartPolicy?: RestartPolicy;
}) {
  const t = useT(adminCopy);
  const errs = useT(errorCopy);

  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [keyText, setKeyText] = useState("");
  const [inspection, setInspection] = useState<ScopeConfigInspection | null>(null);
  // The identity the loaded inspection belongs to. Compared against the live one
  // rather than cleared from an effect: derived state cannot lag a render, and a
  // `revisions` map from another scope must never reach the wire.
  const [inspectedIdentity, setInspectedIdentity] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [valueText, setValueText] = useState("");
  // Which population the change seeds, beyond the existing members the apply
  // already covers. A single target rather than two booleans: "both" is meaningful
  // on the wire but exotic in practice (scope this subscription AND every other one
  // on the agent), and two submits express it. One control that says who is affected
  // beats two that have to be read together.
  const [futureTarget, setFutureTarget] = useState<"none" | "subscription" | "template">("none");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ScopeConfigResult | null>(null);

  // Bulk editing is subscription-level (proxy DEC-1): a tenant sweep crosses
  // subscriptions that may be administered by different people, so there is no
  // tenant form of the request to send.
  const isSubscription = scope.kind === "subscription";
  const identity = inspectionKey(scope, agent, keyText.trim());
  const live = inspection !== null && inspectedIdentity === identity ? inspection : null;

  useEffect(() => {
    setCatalog(null);
    setCatalogError(null);
    if (!isSubscription) return;
    let cancelled = false;
    listConfigKeys(scope, agent)
      .then((c) => !cancelled && setCatalog(c))
      .catch((e: Error) => !cancelled && setCatalogError(e.message));
    return () => {
      cancelled = true;
    };
  }, [isSubscription, scope.kind, scope.tenantId, scope.subsAccId, agent]);

  if (!isSubscription) {
    return <Alert severity="info">{t.bulkConfig.subscriptionOnly}</Alert>;
  }

  async function onInspect() {
    const key = keyText.trim();
    if (!key) return;
    setInspecting(true);
    setInspectError(null);
    setResult(null);
    try {
      const insp = await inspectConfigKey(scope, agent, key);
      setInspection(insp);
      setInspectedIdentity(inspectionKey(scope, agent, key));
    } catch (err) {
      setInspection(null);
      setInspectError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setInspecting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!live) return;

    const parsed = parseValueInput(valueText);
    if (!parsed.ok) {
      setSubmitError(
        parsed.error === "required" ? t.bulkConfig.valueRequired : t.bulkConfig.valueInvalidJson,
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await applyConfigKey(
        scope,
        agent,
        {
          key: keyText.trim(),
          value: parsed.value,
          revisions: revisionsFor(live),
          alsoTemplate: futureTarget === "template",
          templateRevision: futureTarget === "template" ? catalog?.templateRevision : undefined,
          alsoSubscription: futureTarget === "subscription",
        },
        bulkPolicy(restartPolicy),
      );
      setResult(res);
      // The inspection described the state BEFORE this write, so it is spent. The
      // admin reads again rather than acting on a view that is now historical.
      setInspection(null);
      setInspectedIdentity(null);
    } catch (err) {
      setSubmitError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setSubmitting(false);
    }
  }

  // Derived, not state: the catalog and the typed key are both already here, so a
  // second copy could only disagree with them.
  const managedPicked = isManagedKey(catalog, keyText);
  const parsed = parseValueInput(valueText);
  const preview = live && parsed.ok ? previewCounts(live, parsed.value) : null;
  const grouped = result ? groupOutcomes(result) : null;
  // Counted off the OUTCOMES, not result.summary. The summary is a loose
  // string->number map the proxy may omit, and lib/scopeConfig.ts defaults a
  // missing one to {} — reading it would let the restart sentence say "nothing
  // changed" directly under a list of three changed members.
  const appliedCount =
    grouped?.groups.find((g) => g.kind === "applied")?.instances.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-fg-muted">{t.bulkConfig.keyJob}</p>

      <Field
        label={t.bulkConfig.keyLabel}
        job={t.bulkConfig.keyJob}
        htmlFor="bc-key"
        consequence={managedPicked ? t.bulkConfig.managedPicked : undefined}
      >
        {/* One field, with the template's keys as native suggestions: typing filters
            them, and a path the template does not carry stays typeable. This
            replaced a separate <select>, whose only job was to fill this same input
            and which could not be searched at all. */}
        <input
          id="bc-key"
          list="bc-key-options"
          autoComplete="off"
          className={fieldControlClass(true)}
          placeholder={t.bulkConfig.keyPlaceholder}
          value={keyText}
          onChange={(e) => setKeyText(e.target.value)}
        />
      </Field>

      {/* The catalog SUGGESTS; it is not the only way in. A key the template does
          not carry — a newer picoclaw's field, or one a previous repair added —
          stays reachable by typing it.

          Managed keys are listed rather than hidden, so an admin looking for one
          finds it instead of hunting. A datalist option cannot be disabled the way
          the old <select> option was, so the guard moved to isManagedKey: the field
          says why, and Inspect is blocked. */}
      {catalogError ? (
        <Alert severity="error">{errorText(errs, catalogError)}</Alert>
      ) : catalog === null ? (
        <div className="flex justify-center py-2">
          <Spinner size={16} />
        </div>
      ) : (
        <datalist id="bc-key-options">
          {catalog.keys.map((k) => (
            <option key={k.key} value={k.key} label={k.managed ? t.bulkConfig.managedSuffix : undefined} />
          ))}
        </datalist>
      )}

      <div>
        <Button
          type="button"
          variant="outlined"
          disabled={inspecting || !keyText.trim() || managedPicked}
          onClick={onInspect}
        >
          {inspecting ? t.bulkConfig.inspecting : live ? t.bulkConfig.reinspect : t.bulkConfig.inspect}
        </Button>
      </div>

      {inspectError && <Alert severity="error">{inspectError}</Alert>}

      {live && <Distribution inspection={live} />}

      {live && live.total > 0 && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field
            label={t.bulkConfig.valueLabel}
            job={t.bulkConfig.valueJob}
            htmlFor="bc-value"
            consequence={
              preview
                ? [
                    t.bulkConfig.previewWillChange.replace("{n}", String(preview.willChange)),
                    t.bulkConfig.previewAlreadyMatch.replace("{n}", String(preview.alreadyMatch)),
                    t.bulkConfig.previewExcluded.replace("{n}", String(preview.excluded)),
                  ].join(" · ")
                : undefined
            }
          >
            {/* A textarea, not an input: the value is JSON, and an object or array
                typed into one line is as unreadable to write as it was to read.
                fieldControlClass(true) already carries font-mono; resize-y overrides
                the primitive's resize-none (cn is tailwind-merge, last wins). */}
            <Textarea
              id="bc-value"
              rows={4}
              spellCheck={false}
              className={cn(fieldControlClass(true), "resize-y leading-relaxed")}
              placeholder={t.bulkConfig.valuePlaceholder}
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
            />
          </Field>

          {/* WHO ELSE this reaches. The apply above covers existing members; these
              are the two ways to reach members created LATER, and they differ only
              in population — one subscription, or every subscription on the agent.
              Presenting them as one choice is what makes that difference legible.

              DEC-4 controls the template option by DISCLOSURE, not by authority: no
              higher tier gates it, so the sentence beside it IS the control. Never a
              title attribute, never a tooltip, and it must not be softened into one.

              The template option needs the catalog: its write is revision-checked
              and the revision comes from the catalog, so offering it after a failed
              load would send a request the proxy can only refuse — and the admin
              would read a stale-revision message for what was a load failure. The
              scoped option has no revision, so it stays available. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t.bulkConfig.futureLabel}
            </legend>
            {(
              [
                ["none", t.bulkConfig.futureNone, t.bulkConfig.futureNoneReach, false],
                [
                  "subscription",
                  t.bulkConfig.futureSubscription,
                  t.bulkConfig.futureSubscriptionReach,
                  false,
                ],
                [
                  "template",
                  t.bulkConfig.futureTemplate,
                  t.bulkConfig.futureTemplateReach,
                  catalog === null,
                ],
              ] as const
            ).map(([value, label, reach, disabled]) => (
              <label key={value} className="flex items-start gap-2 text-[13px] text-fg">
                <input
                  type="radio"
                  name="bc-future"
                  className="mt-0.5"
                  value={value}
                  checked={futureTarget === value}
                  disabled={disabled}
                  onChange={() => setFutureTarget(value)}
                />
                <span>
                  {label}
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{reach}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {/* Said out loud, because this is the one place the screen does not obey
              the restart control above it (see bulkPolicy). Shown only when the two
              actually disagree. */}
          {restartPolicy.mode === "now" && (
            <p className="text-xs leading-relaxed text-fg-muted">{t.bulkConfig.noticeOverride}</p>
          )}

          {submitError && <Alert severity="error">{submitError}</Alert>}

          <Button type="submit" variant="filled" disabled={submitting || inspecting}>
            {submitting ? t.bulkConfig.applying : t.bulkConfig.apply}
          </Button>
        </form>
      )}

      {grouped && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t.bulkConfig.resultTitle}
            </span>
          </div>

          {/* `info`, not `error`: nothing failed. Those instances were skipped
              precisely so a change the admin has not seen is not overwritten, and
              the next step is to read again. */}
          {grouped.hasStale && <Alert severity="info">{t.bulkConfig.stalePrompt}</Alert>}

          {grouped.groups.map((g) => (
            <div key={g.kind} className={bucketCard({ excluded: g.kind !== "applied" })}>
              <div className="mb-1 flex items-start gap-2">
                <Badge tone="neutral">{outcomeLabel(t, g.kind)}</Badge>
                <span className="text-xs text-fg-muted">
                  {t.bulkConfig.instancesCount.replace("{n}", String(g.instances.length))}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.instances.map((o) => (
                  <li key={o.userAccId} className="text-xs text-fg">
                    <span className="font-mono">{o.email || o.userAccId}</span>
                    {o.detail ? <span className="text-fg-muted"> — {o.detail}</span> : null}
                    {o.reapplied && !o.reapplied.ok ? (
                      <span className="text-fg-muted"> — {t.bulkConfig.reapplyWarning}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-xs text-fg-muted">
            {appliedCount > 0
              ? t.bulkConfig.restartNote.replace("{n}", String(appliedCount))
              : t.bulkConfig.restartNoteNone}
          </p>

          {result?.subscription &&
            (result.subscription.ok ? (
              <Alert severity="info">{t.bulkConfig.scopedApplied}</Alert>
            ) : (
              <Alert severity="error">
                {t.bulkConfig.scopedFailed} {result.subscription.detail}
              </Alert>
            ))}

          {result?.template &&
            (result.template.ok ? (
              <Alert severity="info">{t.bulkConfig.templateApplied}</Alert>
            ) : (
              <Alert severity="error">
                {t.bulkConfig.templateFailed} {result.template.detail}
              </Alert>
            ))}
        </div>
      )}
    </div>
  );
}

function outcomeLabel(t: typeof adminCopy.en, kind: string): string {
  switch (kind) {
    case "applied":
      return t.bulkConfig.outcomeApplied;
    case "unchanged":
      return t.bulkConfig.outcomeUnchanged;
    case "stale":
      return t.bulkConfig.outcomeStale;
    case "path_conflict":
      return t.bulkConfig.outcomePathConflict;
    case "unreadable":
      return t.bulkConfig.outcomeUnreadable;
    default:
      return t.bulkConfig.outcomeError;
  }
}

// The distribution is a histogram: instances holding the same value collapse into
// one bucket, and the three ways of holding NO value stay apart because each
// implies a different decision — a missing key gets created, a blocked path and an
// unreadable document cannot be touched from here at all.
function Distribution({ inspection }: { inspection: ScopeConfigInspection }) {
  const t = useT(adminCopy);
  const buckets = displayBuckets(inspection);

  if (inspection.total === 0) {
    return <Alert severity="info">{t.bulkConfig.noInstances}</Alert>;
  }

  const hasExcluded = buckets.some(
    (b) => b.state === "path_conflict" || b.state === "unreadable",
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t.bulkConfig.distribution}
        </span>
      </div>

      {buckets.map((b, i) => (
        <div key={`${b.state}-${i}`} className={bucketCard({ excluded: b.state !== "value" })}>
          <div className="mb-1 flex items-center gap-2">
            {b.state === "value" ? (
              <JsonValueView value={b.value} />
            ) : (
              <Badge tone="neutral">{stateLabel(t, b.state)}</Badge>
            )}
            <span className="shrink-0 text-xs text-fg-muted">
              {t.bulkConfig.instancesCount.replace("{n}", String(b.count))}
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {b.instances.map((inst) => (
              <li key={inst.userAccId} className="text-xs text-fg">
                <span className="font-mono">{inst.email || inst.userAccId}</span>
                {inst.detail ? <span className="text-fg-muted"> — {inst.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hasExcluded && <p className="text-xs text-fg-muted">{t.bulkConfig.excludedNote}</p>}
    </div>
  );
}

// A read-only, syntax-highlighted JSON view of one bucket's value.
//
// Indented rather than compact: the compact form is the bucket KEY (canonicalJson),
// and for anything but a scalar it is a single unreadable line the admin has to
// scroll sideways. "What each member has now" only answers the question if the
// value can be read.
//
// Colouring reuses the raw config editor's tokenizer and the shared theme instead
// of styling here, so one value looks the same in both screens. json-tokens
// guarantees the tokens are a contiguous, non-overlapping cover of the text, which
// is what makes slicing them in order reproduce the input exactly — no character
// dropped, none reordered.
function JsonValueView({ value }: { value: unknown }) {
  const text = prettyJson(value);
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-fg">
      {tokens.map((token, i) => {
        const slice = text.slice(token.start, token.end);
        const cls = roleClass(SYNTAX_ROLE[token.kind]);
        return cls ? (
          <span key={i} className={cls}>
            {slice}
          </span>
        ) : (
          slice
        );
      })}
    </pre>
  );
}

function stateLabel(t: typeof adminCopy.en, state: ConfigKeyBucket["state"]): string {
  switch (state) {
    case "absent":
      return t.bulkConfig.stateAbsent;
    case "path_conflict":
      return t.bulkConfig.statePathConflict;
    default:
      return t.bulkConfig.stateUnreadable;
  }
}
