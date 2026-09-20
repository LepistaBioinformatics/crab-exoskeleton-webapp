"use client";

import { DEFAULT_POLICY, type RestartPolicy } from "@/lib/restartPolicy";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  catalogHarness,
  displayBuckets,
  groupOutcomes,
  inspectionKey,
  clampValue,
  isManagedKey,
  isTunableKey,
  keyListRows,
  keySections,
  parseValueInput,
  prettyJson,
  previewCounts,
  revisionsFor,
  type KeyListRow,
  type KeySection,
} from "./bulk-config-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { Field, fieldControlClass } from "./field";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
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
      true: "border-dashed border-rule bg-elevated/40",
      false: "border-rule bg-elevated",
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

// ONE KEY in the left column.
//
// `min-h-11` is the 44px touch target on every row at every width, the same rule
// column-view.tsx states: a list whose row height changes between a phone and a desktop
// reads as two different lists.
//
// The `free` variant is the row that offers the FILTER TEXT ITSELF. Dashed, because it
// is not a row of the catalog and must not be read as one -- it is the affordance that
// keeps "the catalog SUGGESTS, it is not a whitelist" true now that the picker is a
// list rather than a text field.
const keyRow = cva(
  [
    "flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ],
  {
    variants: {
      state: {
        // The fill was measured once already for column-view: bg-accent/15 on a dark
        // background is indistinguishable from bg-elevated, so a selection drawn that
        // way is a selection nobody can see.
        current: "bg-accent text-accent-fg",
        idle: "text-fg hover:bg-elevated/60",
      },
      free: { true: "border border-dashed border-rule", false: "" },
    },
    defaultVariants: { state: "idle", free: false },
  },
);

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

  // The filter over the list, which is ALSO the way in for a key the catalog does not
  // carry (keyListRows appends it as a row). Deliberately not the selection: typing
  // narrows what is on offer, clicking is what picks.
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
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

  // Every inspection this panel has already paid for, keyed by `inspectionKey`.
  //
  // Selecting a key now READS it, so browsing a list of sixteen would otherwise be
  // sixteen round trips and going back to one already seen would be another. A ref
  // rather than state: nothing renders from the map itself, only from the inspection
  // that was put back into state, and a re-render on every write would be noise.
  //
  // An apply DROPS its entry (see onSubmit). The inspection described the state before
  // the write, and restoring it from here would hand the admin a view the write has
  // already invalidated -- the same reason the live one is discarded.
  const cache = useRef(new Map<string, ScopeConfigInspection>());

  // Bulk editing is subscription-level (proxy DEC-1): a tenant sweep crosses
  // subscriptions that may be administered by different people, so there is no
  // tenant form of the request to send.
  const isSubscription = scope.kind === "subscription";
  const identity = inspectionKey(scope, agent, selectedKey.trim());
  const live = inspection !== null && inspectedIdentity === identity ? inspection : null;
  // Derived, not state: the catalog and the selection are both already here, so a
  // second copy could only disagree with them.
  //
  // The CATALOG's answer, which is a guess about a key the catalog may not carry.
  // Once an inspection lands the proxy's own answer replaces it (see `managedNow`):
  // this one exists to shape the screen before the read comes back, and to be right
  // about the rows the picker actually offered.
  const managedPicked = isManagedKey(catalog, selectedKey);
  const tunablePicked = isTunableKey(catalog, selectedKey);

  useEffect(() => {
    setCatalog(null);
    setCatalogError(null);
    // The future target belongs to the catalog that was on screen when it was chosen.
    // Switching agent can switch harness, and a "template" left selected across that
    // switch would send a template write for an agent whose catalog says there is no
    // template — with no revision to gate it.
    setFutureTarget("none");
    // And so does the selection. A key of the agent that was on screen need not exist
    // in the next agent's document, and leaving it selected would fire a read for it
    // the moment the new catalog lands.
    setSelectedKey("");
    setFilter("");
    setResult(null);
    setValueText("");
    if (!isSubscription) return;
    let cancelled = false;
    listConfigKeys(scope, agent)
      .then((c) => !cancelled && setCatalog(c))
      .catch((e: Error) => !cancelled && setCatalogError(e.message));
    return () => {
      cancelled = true;
    };
  }, [isSubscription, scope.kind, scope.tenantId, scope.subsAccId, agent]);

  // Selecting a key READS it. The owner asked for the detail to be there on the click
  // rather than behind a second one, and the cache above is what makes that affordable.
  //
  // Keyed on `identity`, which IS the (scope, agent, key) tuple this inspection would
  // belong to — depending on the parts separately would be the same condition written
  // twice. An apply clears the inspection without changing the identity, so it does NOT
  // re-fire: the panel offers "Read again" instead, which is the rule that a spent
  // inspection is not silently replaced.
  useEffect(() => {
    const key = selectedKey.trim();
    // EVERY path that issues no request clears the flag, because one of them has to.
    // The previous run's cleanup sets `cancelled`, which skips its own `.finally` --
    // correct, since an answer for a key that is no longer selected must not touch this
    // state -- so the run that replaces it is the only thing left that can. A read still
    // in flight when the selection lands on a CACHED key is the case that stranded the
    // panel: "Reading..." over values that were right there, and the re-read button that
    // would have fixed it disabled by that same flag. The other two early returns end up
    // requesting again anyway, and are written the same way rather than relying on it.
    if (!isSubscription || key === "") {
      setInspecting(false);
      return;
    }
    const cached = cache.current.get(identity);
    if (cached) {
      setInspection(cached);
      setInspectedIdentity(identity);
      setInspecting(false);
      return;
    }
    let cancelled = false;
    setInspecting(true);
    setInspectError(null);
    inspectConfigKey(scope, agent, key)
      .then((insp) => {
        if (cancelled) return;
        cache.current.set(identity, insp);
        setInspection(insp);
        setInspectedIdentity(identity);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setInspection(null);
        setInspectError(errorText(errs, err.message));
      })
      .finally(() => !cancelled && setInspecting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, isSubscription]);

  if (!isSubscription) {
    return <Alert severity="info">{t.bulkConfig.subscriptionOnly}</Alert>;
  }

  // The explicit re-read. It bypasses the cache in both directions — it asks the proxy
  // even when an entry exists, and it replaces that entry — because the only reasons to
  // press it are that the inspection is spent (an apply just ran) or that the admin
  // believes it is stale. Serving either from memory would be the opposite of what was
  // asked.
  async function onInspect() {
    const key = selectedKey.trim();
    if (!key) return;
    setInspecting(true);
    setInspectError(null);
    setResult(null);
    try {
      const insp = await inspectConfigKey(scope, agent, key);
      const id = inspectionKey(scope, agent, key);
      cache.current.set(id, insp);
      setInspection(insp);
      setInspectedIdentity(id);
    } catch (err) {
      setInspection(null);
      setInspectError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setInspecting(false);
    }
  }

  // Picking a key from the list. Everything the previous key's inspection fed — the
  // value typed against it, the errors it raised, the results of applying it — goes
  // with it. A value typed for one key sitting in the form under another is the one
  // mistake this screen must not make.
  function onPick(key: string) {
    if (key === selectedKey) return;
    setSelectedKey(key);
    setValueText("");
    setSubmitError(null);
    setInspectError(null);
    setResult(null);
    setInspection(null);
    setInspectedIdentity(null);
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
          key: selectedKey.trim(),
          value: parsed.value,
          revisions: revisionsFor(live),
          alsoTemplate: futureSend === "template",
          templateRevision: futureSend === "template" ? catalog?.templateRevision : undefined,
          alsoSubscription: futureSend === "subscription",
        },
        bulkPolicy(restartPolicy),
      );
      setResult(res);
      // The inspection described the state BEFORE this write, so it is spent. The
      // admin reads again rather than acting on a view that is now historical — and
      // the cached copy goes with it, or selecting away and back would restore exactly
      // the view this write invalidated.
      cache.current.delete(inspectionKey(scope, agent, selectedKey.trim()));
      setInspection(null);
      setInspectedIdentity(null);
    } catch (err) {
      setSubmitError(errorText(errs, err instanceof Error ? err.message : null));
    } finally {
      setSubmitting(false);
    }
  }

  // Whether there is a template document to write into at all. Unknown while the
  // catalog loads, which is the state the option's existing `disabled` already covers.
  const templateOffered = catalog === null || catalog.templateWritable;
  // Never send a write the catalog says has no target. The effect above already resets
  // the choice when the catalog reloads, but the reset and the submit are two different
  // renders and only one of them reaches the proxy.
  const futureSend = futureTarget === "template" && !templateOffered ? "none" : futureTarget;
  const parsed = parseValueInput(valueText);
  const preview = live && parsed.ok ? previewCounts(live, parsed.value) : null;
  const grouped = result ? groupOutcomes(result) : null;
  // Counted off the OUTCOMES, not result.summary. The summary is a loose
  // string->number map the proxy may omit, and lib/scopeConfig.ts defaults a
  // missing one to {} — reading it would let the restart sentence say "nothing
  // changed" directly under a list of three changed members.
  const appliedCount =
    grouped?.groups.find((g) => g.kind === "applied")?.instances.length ?? 0;

  // Rebuilt on every keystroke. The list is sixteen rows and the filter is a substring
  // test, so there is nothing here a memo would save that it would not cost in a stale
  // reference to the catalog.
  const rows = keyListRows(catalog, filter);
  // The catalog's own matches, separated from the row that offers the typed path: the
  // "nothing matched" line is a statement about the DOCUMENT, and the free row would
  // make it never true.
  const catalogRows = rows.filter((r) => !r.free);
  const sections = keySections(rows);
  const harness = catalogHarness(catalog);

  // WHO SAYS THE KEY IS MANAGED. The proxy, once it has answered; the catalog until
  // then. The two agree for every row the picker offered, and only the proxy can be
  // right about a path typed by hand — which is exactly the case where being wrong
  // means offering a write that can only 400.
  const managedNow = live ? live.managed : managedPicked;
  // Whether there is anything to submit. A managed key is read, never written, and a
  // scope with no instances has nothing to write TO -- in both cases the form would be
  // a control whose only outcome is a refusal.
  const editable = live !== null && live.total > 0 && !managedNow;

  return (
    // TWO PANELS from `lg`, ONE below it. The breakpoint is lg rather than md because
    // this panel is already the right-hand side of the admin browser's own split: at md
    // the sections column is still drawn beside it, and splitting the remainder again
    // leaves two columns too narrow for a dotted path to survive in either.
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      {/* THE KEYS. `max-lg:hidden` once something is selected is the mobile half of
          master-detail: one column, the list until a key is picked, then the detail in
          its place with a way back. Same shape the column browser uses one level up. */}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 lg:w-72 lg:shrink-0 lg:border-r lg:border-rule lg:pr-4",
          selectedKey && "max-lg:hidden",
        )}
      >
        {/* The filter is ALSO the field for a key the catalog does not carry, which is
            why it keeps the example path as its placeholder: typing a whole dotted path
            here is a supported use, not a misuse of a search box. */}
        <Field label={t.bulkConfig.keyLabel} job={t.bulkConfig.keyJob} htmlFor="bc-key">
          <input
            id="bc-key"
            autoComplete="off"
            className={fieldControlClass(true)}
            placeholder={t.bulkConfig.keyPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Field>

        {catalogError ? (
          <Alert severity="error">{errorText(errs, catalogError)}</Alert>
        ) : catalog === null ? (
          <div className="flex justify-center py-2">
            <Spinner size={16} />
          </div>
        ) : (
          <>
            {harness && (
              <p className="text-xs leading-relaxed text-fg-muted">
                {t.bulkConfig.catalogHarness.replace("{h}", harness)}
              </p>
            )}

            {/* Said when the DOCUMENT has nothing matching, which the free row would
                otherwise hide — it is always there, so an empty list never happens and
                the admin would read "use this path" with no idea the catalog was
                searched at all. */}
            {catalogRows.length === 0 && filter.trim() !== "" && (
              <p className="text-xs leading-relaxed text-fg-muted">
                {t.bulkConfig.keyNoMatch.replace("{q}", filter.trim())}
              </p>
            )}

            {/* TWO GROUPS, each said once over its own heading, rather than the same
                sentence repeated down every managed row. In a ganglion catalog most
                rows are the proxy's, so the per-row subtitle was a dozen copies of one
                fact competing with the dotted path that is the row's actual content.
                Managed keys are still LISTED rather than hidden — an admin looking for
                one finds it, reads why it is not theirs to set, and can still open it
                to see what their members hold. */}
            <div className="flex max-h-[20rem] min-h-0 flex-col gap-3 overflow-y-auto lg:max-h-[52dvh]">
              {sections.map((section) => (
                <section key={section.kind} className="flex flex-col gap-1">
                  <h3 className="font-display text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                    {sectionTitle(t, section)}
                  </h3>
                  <p className="text-[11px] leading-relaxed text-fg-muted">
                    {sectionJob(t, section)}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {section.rows.map((r) => (
                      <li key={`${r.free ? "typed:" : ""}${r.key}`}>
                        <button
                          type="button"
                          onClick={() => onPick(r.key)}
                          aria-current={r.key === selectedKey ? "true" : undefined}
                          className={keyRow({
                            state: r.key === selectedKey ? "current" : "idle",
                            free: r.free,
                          })}
                        >
                          <span className="w-full truncate font-mono text-[12.5px]" title={r.key}>
                            {r.free ? t.bulkConfig.keyUseTyped.replace("{k}", r.key) : r.key}
                          </span>
                          {/* What the heading cannot say, because it is true of some
                              rows in the group and not others: the free row is a
                              proposal rather than a catalog entry, and a tunable row
                              is one the document does not hold yet. */}
                          {(r.free || r.tunable) && (
                            <span
                              className={cn(
                                "w-full truncate text-[11px] leading-tight",
                                r.key === selectedKey ? "text-accent-fg/80" : "text-fg-muted",
                              )}
                            >
                              {r.free ? t.bulkConfig.keyUseTypedJob : t.bulkConfig.tunableSuffix}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Said once, beside the list it is about. An agent whose configuration has
                no template file has it GENERATED instead, per member, on every ensure —
                so a key here is a key the next start may replace, and an admin reading
                only the row labels would not learn that from a list where most rows are
                flagged managed and a few are not. It belongs on THIS side because it is
                about the document the list came from; futureTemplateAbsent, which is
                about the write, stays with the fieldset in the detail. Disclosure, like
                DEC-4: it changes what the admin knows, not what the screen lets them
                do. */}
            {!catalog.templateWritable && (
              <p className="text-xs leading-relaxed text-fg-muted">{t.bulkConfig.generatedDoc}</p>
            )}
          </>
        )}
      </div>

      {/* THE KEY. Everything the panel knows about the one that is selected.

          BOUNDED FROM `lg`, and the bound is the point. This column used to grow with
          whatever it held -- a distribution over forty members, each bucket printing a
          whole configuration value -- and pushed the value field, the restart sentence
          and the Apply button off the bottom of the window. An admin then scrolled the
          PAGE to reach a control they had been looking at a moment earlier. So the
          column takes a viewport-relative ceiling, the part that grows scrolls inside
          it, and the controls sit in a bar that does not move. Below `lg` there is no
          ceiling: a phone has one column, the page scroll is the only scroll it has,
          and nesting a second one there is how a pane stops being reachable at all. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3 lg:max-h-[72dvh]",
          !selectedKey && "max-lg:hidden",
        )}
      >
        {!selectedKey ? (
          // Only ever seen from `lg` up: below it this whole column is hidden until
          // something is selected, and the list is what fills the screen instead.
          <PanelEmpty
            icon={SlidersHorizontal}
            title={t.bulkConfig.detailEmptyTitle}
            body={t.bulkConfig.detailEmptyBody}
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* The way back, and the only one a phone has: at this width the list is
                  not on screen to click. Gone from `lg`, where both columns are. */}
              <button
                type="button"
                onClick={() => onPick("")}
                className="flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-sm text-fg-muted transition-colors hover:text-fg lg:hidden"
              >
                <ArrowLeft size={16} aria-hidden />
                {t.bulkConfig.backToKeys}
              </button>
              <span
                className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg"
                title={selectedKey}
              >
                {selectedKey}
              </span>
              {/* Offered for a managed key too, now that one has something to read.
                  It used to be hidden there because a managed key produced nothing but
                  a refusal; it produces the preview instead, and a preview an admin
                  cannot refresh is a preview they have to reload the page to trust. */}
              <Button type="button" variant="outlined" disabled={inspecting} onClick={onInspect}>
                {inspecting
                  ? t.bulkConfig.inspecting
                  : live
                    ? t.bulkConfig.reinspect
                    : t.bulkConfig.inspect}
              </Button>
            </div>

            {/* Why the form below is absent. It is a statement about the WRITE, which
                is what the proxy refuses; the read underneath it is served, which is
                why this no longer reads as a dead end. */}
            {managedNow && (
              <Alert severity="info" className="shrink-0">
                {t.bulkConfig.managedPicked}
              </Alert>
            )}

            {/* A key the catalog offers although the generated document does not hold
                it. Two things follow that nothing else on the screen says: an empty
                distribution here means the harness's own default is in force rather
                than that something is wrong, and the write lands beside the document
                rather than in it, so it takes effect when the workspace next starts. */}
            {tunablePicked && !managedNow && (
              <Alert severity="info" className="shrink-0">
                {t.bulkConfig.tunablePicked}
              </Alert>
            )}

            {inspectError && (
              <Alert severity="error" className="shrink-0">
                {inspectError}
              </Alert>
            )}

            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
              {/* EVERYTHING THAT GROWS. The histogram grows with the membership, the
                  outcome list grows with it again, and the value field grows with
                  whatever is typed into it -- none of them has a bound this panel can
                  state, so they share one scroller and the bar below keeps its place.
                  `lg:` only, for the reason on the column itself. */}
              <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
                {live && <Distribution inspection={live} />}

                {editable && (
                  <>
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
                      <legend className="mb-1 font-display text-xs font-medium text-fg-muted">
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
                      )
                        // REMOVED rather than disabled when the catalog reports no template, and
                        // that is not a retreat from DEC-4. DEC-4 is about not gating a reachable
                        // write behind a tier — the sentence beside it stays the control for the
                        // write that EXISTS. This one does not exist: there is no document for it
                        // to land in, so a disabled radio would advertise an action the proxy
                        // could only refuse, and the admin would read a stale-revision error for
                        // a write that was never made. The sentence under the fieldset says so
                        // instead, which is the same disclosure the option's own "reach" line is.
                        .filter(([value]) => value !== "template" || templateOffered)
                        .map(([value, label, reach, disabled]) => (
                          <label key={value} className="flex items-start gap-2 text-[13px] text-fg">
                            <input
                              type="radio"
                              name="bc-future"
                              className="mt-0.5"
                              value={value}
                              checked={futureSend === value}
                              disabled={disabled}
                              onChange={() => setFutureTarget(value)}
                            />
                            <span>
                              {label}
                              <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                                {reach}
                              </span>
                            </span>
                          </label>
                        ))}
                      {!templateOffered && (
                        <p className="text-xs leading-relaxed text-fg-muted">
                          {t.bulkConfig.futureTemplateAbsent}
                        </p>
                      )}
                    </fieldset>
                  </>
                )}

                {grouped && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 bg-accent" aria-hidden />
                      <span className="font-display text-xs font-medium text-fg-muted">
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

              {/* THE BAR THAT DOES NOT MOVE. The restart sentence is here rather than
                  above with the fields it qualifies, and deliberately: it is the one
                  place the screen does not obey the shared restart control, and a
                  disclosure an admin has to scroll to find is a disclosure the screen
                  is not really making. Shown only when the two actually disagree. */}
              {editable && (
                <div className="flex shrink-0 flex-col gap-2 border-t border-rule pt-3">
                  {restartPolicy.mode === "now" && (
                    <p className="text-xs leading-relaxed text-fg-muted">
                      {t.bulkConfig.noticeOverride}
                    </p>
                  )}

                  {submitError && <Alert severity="error">{submitError}</Alert>}

                  <Button type="submit" variant="filled" disabled={submitting || inspecting}>
                    {submitting ? t.bulkConfig.applying : t.bulkConfig.apply}
                  </Button>
                </div>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// The two headings, and the sentence under each. Said once over a group rather than
// once per row: see keySections.
function sectionTitle(t: typeof adminCopy.en, section: KeySection): string {
  return section.kind === "managed" ? t.bulkConfig.sectionManaged : t.bulkConfig.sectionEditable;
}

function sectionJob(t: typeof adminCopy.en, section: KeySection): string {
  return section.kind === "managed"
    ? t.bulkConfig.sectionManagedJob
    : t.bulkConfig.sectionEditableJob;
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
        <span className="font-display text-xs font-medium text-fg-muted">
          {t.bulkConfig.distribution}
        </span>
      </div>

      {buckets.map((b, i) => (
        <div key={`${b.state}-${i}`} className={bucketCard({ excluded: b.state !== "value" })}>
          <div className="mb-1 flex items-start gap-2">
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
  const t = useT(adminCopy);
  const [open, setOpen] = useState(false);
  const full = prettyJson(value);
  // Collapsed by default, and the default is the whole reason this exists. A bucket
  // holding one member's entire configuration value prints dozens of lines, and a
  // distribution is one of these per DISTINCT value — so the panel's height was set by
  // the longest thing anybody happened to have. Cut to a fixed number of lines, the
  // histogram is a histogram again and the reading is opt-in per bucket.
  const { head, hidden } = clampValue(full);
  const text = open ? full : head;
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
      <pre className="w-full min-w-0 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-fg">
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
      {/* Offered only when something is hidden, so it never invites a click that
          reveals nothing (clampValue counts, it does not estimate). The collapsed
          label carries the COUNT: "12 more lines" tells an admin whether expanding is
          worth it, and "show more" does not. */}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-accent underline-offset-2 hover:underline"
        >
          {open ? t.bulkConfig.valueShowLess : t.bulkConfig.valueShowMore.replace("{n}", String(hidden))}
        </button>
      )}
    </div>
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
