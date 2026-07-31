# admin-bulk-instance-config (webapp slice) — Specification

**Status:** Draft
**Proxy spec:** `crab-shell-proxy/.specs/features/admin-bulk-instance-config/spec.md`
(authoritative for the contract; FR-7 there is the origin of this document)
**Proxy design:** `crab-shell-proxy/.specs/features/admin-bulk-instance-config/design.md`

---

## Problem Statement

The admin screen can edit **one** member's `config.json` (the raw + tree editor in
the Members panel). A setting that is really a policy — "this subscription may use
Brave search" — therefore costs one manual edit per member, and there is nowhere
to see whether the setting is even consistent across the subscription today.

This slice is the screen for the proxy's three new bulk endpoints: pick a key, see
how it varies, change it everywhere that differs.

## Goals

- [ ] A new agent section that shows the **distribution** of one `config.json` key
      across the selected subscription's instances of the selected agent.
- [ ] A change is submitted once, with a preview stating exactly how many
      instances it will touch and how many already match.
- [ ] The two things that are easy to get wrong on screen are impossible to miss:
      an instance whose config is **unreadable**, and the fact that the
      **template** checkbox reaches every subscription on that agent.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Rollback UI | Proxy DEC-6 — the MVP writes the record; reverting is re-applying the old value here |
| Reading the migration records | No endpoint exposes them; they are recovery data read from the host |
| Repairing an unreadable instance | The existing per-member raw editor does that. This panel names the instance and stops |
| Tenant-scope bulk edit | Proxy DEC-1. The panel requires a subscription |
| Several keys per action | Proxy DEFER-1 |
| Hermes agents | `config.json` is picoclaw's file; the section is picoclaw-only |

---

## User Stories

### P1: See the distribution before changing anything ⭐ MVP

**User Story**: As a subscription admin, I want to pick a key and see which
members hold which value, so that I know what a change would touch.

**Acceptance Criteria**:

1. WHEN an agent and a **subscription** are selected THEN the section SHALL offer
   a key picker populated from `GET /keys` (the agent template's leaf paths), with
   `managed` entries shown disabled and labelled as proxy-owned.
2. WHEN the admin needs a key the template lacks THEN the section SHALL accept a
   hand-typed dotted path.
3. WHEN a key is chosen THEN the section SHALL render one group per bucket from
   `GET /inspect`: the value (as JSON), the count, and the member list.
4. WHEN a bucket's state is `absent`, `path_conflict` or `unreadable` THEN it
   SHALL be rendered visually apart from value buckets and SHALL NOT be presented
   as holding a value.
5. WHEN the proxy answers `400 managed_path` or `400 invalid_key` THEN the message
   SHALL appear on the key field, not as a page-level failure.
6. WHEN the subscription has no provisioned instances of that agent THEN the
   section SHALL say so and SHALL NOT render the apply form.

**Independent Test**: With two members differing on
`agents.defaults.max_tokens`, the panel shows two value buckets with the right
counts and member emails.

---

### P2: Apply to everything that differs ⭐ MVP

**User Story**: As a subscription admin, I want to set the key once and have it
land on every instance that differs.

**Acceptance Criteria**:

1. WHEN the admin enters a new value THEN the form SHALL accept **JSON** (so
   `true`, `42`, `"text"` and `null` are distinguishable) and SHALL reject
   unparseable input before submitting.
2. WHEN a valid value is entered THEN the preview SHALL state, from the inspect
   data already loaded, how many instances will change, how many already match,
   and how many are excluded (`absent` counts as *will change*;
   `unreadable`/`path_conflict` as excluded).
3. WHEN the admin submits THEN the request SHALL carry the `revisions` map built
   from the inspect response, so the proxy's staleness check has something to
   compare (proxy FR-3.4).
4. WHEN the response returns THEN the result SHALL be rendered per outcome
   (`applied` / `unchanged` / `stale` / `path_conflict` / `unreadable` / `error`),
   naming the members in each — a partially applied batch is the normal case, not
   an error state.
5. WHEN any outcome is `stale` THEN the section SHALL prompt a re-inspect rather
   than offering to retry blindly.
6. WHEN an outcome carries `reapplied.ok: false` THEN that instance SHALL show a
   warning, and the save SHALL still read as successful.
7. WHEN the admin saves THEN an incoming policy of `now` SHALL be sent as
   `notice`, and the panel SHALL say so on screen whenever the two disagree.
   The shared restart control is initialised to `now` and cannot distinguish "the
   admin chose an immediate bounce" from "nobody touched it"; here those are not
   equally cheap, since `now` takes every changed member's agent down at once.
   **Consequence, accepted deliberately:** an immediate bounce cannot be requested
   from this tab at all — the scope-wide restart action is where it lives. The
   disclosure sentence is what keeps the control from quietly disagreeing with the
   request. Only the instances that changed are ever notified (proxy DEC-8).
8. WHEN the result is shown THEN the restart wording SHALL reflect the `applied`
   count, not the total — "N members will pick this up on restart", never "the
   subscription is restarting".

**Independent Test**: Three instances, two differing; the preview says "2 will
change, 1 already matches", and the result lists two `applied` and one
`unchanged`.

---

### P3: The template checkbox, with its reach stated ⭐ MVP

**User Story**: As an admin, I want to mark a change as durable so members
provisioned later inherit it — and to know what else that affects.

**Acceptance Criteria**:

1. WHEN the admin ticks "also apply to the agent template" THEN the request SHALL
   carry `alsoTemplate: true` and the `templateRevision` from `GET /keys`.
2. WHEN the checkbox is rendered THEN a sentence stating that the template seeds
   **every subscription**, and every agent sharing that template, SHALL be visible
   next to it — not in a tooltip and not behind a hover. Proxy DEC-4 makes this
   disclosure the control, since no higher tier gates it. The catalog response
   names the template (`template`, not `agent`) precisely because the two can
   differ.
3. WHEN the response reports `template.ok: false` THEN the instance results SHALL
   still read as applied and the template failure SHALL be shown separately.
4. WHEN the checkbox is not ticked THEN `alsoTemplate` SHALL be absent from the
   request.

**Independent Test**: Ticking the box sends `alsoTemplate: true` with a
`templateRevision`; the disclosure sentence is present in the DOM without
interaction.

---

## Edge Cases

- WHEN the selected scope is a **tenant** THEN the section SHALL explain that bulk
  editing is subscription-level and SHALL NOT render the form (proxy DEC-1).
- WHEN no agent is selected THEN the section SHALL not render — every request is
  per-agent.
- WHEN the selected agent is not a picoclaw agent THEN the section SHALL be
  **absent** from the tab list rather than present-and-explaining-itself, matching
  `agent-scope.ts`'s existing rule for `model` and `persona`.
- WHEN the admin switches agent or scope mid-flow THEN the loaded inspection and
  the pending value SHALL be discarded — a `revisions` map from another scope must
  never be submitted.
- WHEN `GET /inspect` is in flight THEN the apply control SHALL be disabled: the
  `revisions` map is what makes the write safe.
- WHEN a value bucket holds a large object THEN it SHALL be rendered as scrollable
  JSON, and the panel SHALL NOT grow the page horizontally.

---

## Requirements

### FR-1 — Section wiring

- **FR-1.1** Add `config` to `TAB_KEYS` and `SECTION_TABS` (`app/admin/tabs.ts`)
  and to `PICOCLAW_ONLY` (`app/admin/agent-scope.ts`). `CONTENT_TABS` derives
  itself from `SECTION_TABS`, so hermes drops the section with no second edit.
- **FR-1.2** `parseTab`/`resolveAgentTab` need no change; the existing
  "unrecognized falls back to the agent's first section" rule covers `?tab=config`
  on a hermes agent.
- **FR-1.3** Dispatch the panel in `app/admin/admin-screen.tsx` beside the
  existing sections, passing the resolved `ScopeRef` and agent.

### FR-2 — BFF routes

- **FR-2.1** `app/api/admin/scope-config/keys/route.ts` (GET),
  `.../inspect/route.ts` (GET), `.../route.ts` (PUT) — thin passthroughs built on
  `lib/adminProxy.ts` (`requireSession`, `forwardAdmin`/`proxyAdminJsonAgent`,
  `restartParams`, `withRestart`).
- **FR-2.2** The PUT forwards the restart params on the query string, where the
  proxy reads them — the same split `app/api/admin/persona/route.ts` uses.
- **FR-2.3** No validation is duplicated in the BFF beyond what a passthrough
  needs. The proxy is the gate (its FR-6); a second copy of the managed-path rule
  would drift from `ManagedConfigPaths`.
- **FR-2.4** Each route carries the comment the proxy's FR-6.3 requires: this is
  proxy-materialized provisioning state, not member-authored content, so it is not
  an `admin-shared-content` FR-7 violation.

### FR-3 — Panel

- **FR-3.1** `app/admin/bulk-config-panel.tsx`. Client component, same shape as
  `shared-secrets-panel.tsx`: load → form → result list.
- **FR-3.2** State: selected key, typed key, parsed new value, inspection,
  submitting, result. The inspection is keyed by scope+agent+key and discarded
  when any of the three changes (edge case above).
- **FR-3.3** No inline conditional or interpolated `className`. Variants go
  through `class-variance-authority`, as the existing panels do.
- **FR-3.4** Bucket JSON renders inside an `overflow-x: auto` container.

### FR-4 — Types and fetchers

- **FR-4.1** `lib/scopeConfig.ts` — the TS mirrors of the proxy's response types
  (`ScopeConfigInspection`, `ConfigKeyBucket`, `TemplateCatalog`,
  `ScopeConfigResult`) plus `listConfigKeys`, `inspectConfigKey`,
  `applyConfigKey`.
- **FR-4.2** Values are typed `unknown`, not `any` or `string`: a config value is
  arbitrary JSON and the panel must not coerce it.
- **FR-4.3** Errors surface through the existing `errorText`/`errorCopy` path so
  the proxy's `managed_path` / `invalid_key` / `stale_revision` codes get real
  sentences.

### FR-5 — i18n

- **FR-5.1** All copy in `lib/i18n/admin.ts`, both `en` and `pt-BR`.
- **FR-5.2** `lib/i18n/parity.test.ts` is the gate — it already fails on a key
  present in one locale only.

### NFR

- **NFR-1** No new dependency.
- **NFR-2** `npx tsc --noEmit`, `npm test` and `npx next build` all clean.
- **NFR-3** Additive: no existing panel, route or tab behaviour changes. The
  `tabs.ts` / `agent-scope.ts` edits are additions to existing arrays.

---

## Requirement Traceability

| ID | Story | Maps to proxy ID | Status |
| --- | --- | --- | --- |
| WBULK-01 | P1: section wired, picoclaw-only, subscription-only | BULK-24 | Pending |
| WBULK-02 | P1: key picker from template + typed path | BULK-01, BULK-02 | Pending |
| WBULK-03 | P1: buckets with counts and members | BULK-03 | Pending |
| WBULK-04 | P1: non-value buckets rendered apart | BULK-04, BULK-05 | Pending |
| WBULK-05 | P1: key-level error placement | BULK-06 | Pending |
| WBULK-06 | P2: JSON value input, rejected before submit | BULK-07 | Pending |
| WBULK-07 | P2: preview counts | BULK-07 | Pending |
| WBULK-08 | P2: revisions map submitted | BULK-10 | Pending |
| WBULK-09 | P2: per-outcome result rendering | BULK-11 | Pending |
| WBULK-10 | P2: restart-policy control, `notice` default, wording keyed to `applied` | BULK-12, BULK-12b | Pending |
| WBULK-11 | P3: template checkbox + revision | BULK-20 | Pending |
| WBULK-12 | P3: disclosure sentence, not a tooltip | BULK-21 | Pending |
| WBULK-13 | FR-5: both locales, parity green | — | Pending |

**Coverage:** 13 total, 13 implemented (W1–W8), verified by
`app/admin/agent-scope.test.ts`, `app/admin/tabs.test.ts`,
`lib/scopeConfig.test.ts`, `app/admin/bulk-config-state.test.ts` and
`lib/i18n/parity.test.ts`, plus `tsc --noEmit` and `next build` for the panel and
the BFF routes (the layers this repo does not unit-test — see the matrix in
`tasks.md`).

---

## Reconciliation (what shipped, and what the design got wrong)

Six things differ from the plan. All were found by implementing it.

**Post-ship capability: future members can be scoped to ONE subscription.** The
template was the only lever on members created later, and it seeds every
subscription running that agent — so "make this my subscription's default" could not
be said. The proxy gained a seed overlay at
`tenants/<t>/subscriptions/<s>/shared/agents/<agent>/config-overlay.json`, applied in
`provision` on a FRESH seed only.

It is a seed, not a policy: an existing member is never revisited, so an admin who
tuned one instance by hand keeps it. Native secrets and persona re-apply on every
ensure; this deliberately does not, because it exists to scope the template's reach
and the template is a seed. `TestProvisionLeavesAReturningMemberAlone` is the gate.

The panel's `alsoTemplate` checkbox became a three-way choice — existing members
only / also this subscription's future members / also every future member of this
agent. One control rather than two booleans: "both" is expressible on the wire but
exotic, and two submits cover it. The template option still needs the catalog (its
write is revision-checked); the scoped option has no revision, because the proxy
upserts one key and two admins scoping different keys never collide.

Side effect worth naming: an overlay migration record carries tenant AND
subscription, which is what a template record structurally cannot. The empty
tenant/subscription in a template record was accurate, not missing data — this is
the path that can fill them.

**Post-ship refinement: the value field is multiline, and the key field is
searchable.** Two asked for after the JSON display change, both the same defect in
mirror image.

The value was a one-line `<input>`, so an object was as unwritable as it had been
unreadable. It is now a `Textarea` (`rows={4}`, `resize-y` overriding the
primitive's `resize-none` — `cn` is tailwind-merge, last wins). `fieldControlClass(true)`
already carried `font-mono`, so no new styling.

The key picker was a `<select>` that could not be searched: an admin had to scroll
a template's full leaf list. It is now a `<datalist>` on the key field itself, so
typing filters the suggestions and a path the template does not carry stays
typeable. The two controls were already redundant — the select's only job was to
fill that same input.

That swap would have SILENTLY DROPPED a guard, which is the part worth recording:
the `<select>` disabled its managed options, and a datalist option cannot be
disabled. `isManagedKey` (tested) now answers the narrower question the catalog can
answer — "is this exact key one the template already marked as owned?" — the field
states why, and Inspect is blocked. It is deliberately not a copy of the proxy's
rule, which refuses three relations (equal, under, prefix-of) and stays the
authority; a key the catalog has never heard of is not flagged, because a
hand-typed path the template lacks is legitimate.

Orphans removed with their cause: `selectClass` and `bulkConfig.fromTemplate` (both
locales; `persona.fromTemplate` is a different key and stays).

**Post-ship refinement (asked for after W9): the distribution renders indented,
highlighted JSON.** The first version printed `canonicalJson` — the compact
comparison form — which is one unreadable line for anything but a scalar, so "what
each member has now" could not actually be read. `prettyJson` was added BESIDE
`canonicalJson` rather than replacing it: the compact form is the bucket key and
the equality test behind set-if-different, so it has to stay byte-stable. A test
asserts the two sort keys identically, which is what guarantees the value shown in
a bucket is the value the bucket was keyed by. Colouring reuses the raw config
editor's `tokenize` + `roleClass`, so one value looks the same in both screens, and
`json-tokens`' contiguous-cover property (tested by its own `cover()` helper) is
what makes slicing tokens reproduce the text exactly. The bucket row moved from
`items-center` to `items-start` so the instance count aligns to the value's first
line.

**DEC-9 did not reach the UI, and fixing it costs a capability.** The proxy
defaults an ABSENT `restart=` to `notice`, but the webapp's shared restart control
always carries a value and is initialised to `now` — so the API default protected
non-UI callers only, and an admin who never touched the selector would have
bounced every changed member at once. The panel now downgrades an incoming `now`
to `notice` (`bulkPolicy`), which means **an immediate bounce cannot be requested
from this tab**; the scope-wide restart action is where it lives. This is the one
place the screen deliberately does not do what a visible control says, so the
panel states it next to the submit button whenever the two disagree. Chosen by the
product owner over the two alternatives (honour the control and accept the unsafe
default; or give this panel its own selector, at the cost of two restart controls
on one screen).

**The restart sentence read `result.summary`, which the proxy may omit.** With a
missing summary the panel would have printed "nothing changed, so no container is
restarted" directly under a list of three changed members. It now counts the
`applied` group's instances — the same reason `groupOutcomes` derives `hasStale`
from the outcomes rather than the summary.

**`restart=now` had to be sent explicitly, and the first version of the client got
it backwards.** `policyParams` omits the parameter for mode `now` — "absent means
now" — which is correct for every other admin endpoint because the proxy's shared
`parsePolicyFields` defaults to `now`. This endpoint defaults an absent parameter
to `notice` (proxy DEC-9). So relying on the omission would have sent the admin's
explicit "now" and produced a notice: the UI would have said one thing and the
proxy done another. `lib/scopeConfig.ts` now emits `restart=now` explicitly via
`bulkPolicyURL`, and a test pins both the explicit choice and the default policy.
A test asserting the old behaviour ("emits no restart parameters by default, which
the proxy reads as now") was replaced — its comment stated a false claim about the
proxy contract.

**`json-tree-view` could not be reused to display a bucket value.** The design
named it, but it is an *editor* (`onChange`, `onEdit`, `onRemove`, `managed`
paths) built for a whole document. A bucket value is usually a scalar. Values
render as canonical JSON in a mono `<pre>` inside an `overflow-x-auto` box, which
is what FR-3.4 actually asked for.

**`previewCounts` had to sum `bucket.count`, not count buckets.** `total` and
`count` are INSTANCE counts and the view is a histogram, so the
`willChange + alreadyMatch + excluded === total` invariant only holds when the
per-bucket instance count is accumulated. The mixed test fixture therefore
includes a bucket with `count > 1`, asserted, so the sum check cannot pass
vacuously.

**Registering the section left a blank tab button for one step.** Adding `config`
to `SECTION_TABS` makes `admin-screen.tsx` render a button for it immediately, but
`TAB_ICONS` and `shell.tabs` are `Record<string, …>` lookups — so a missing icon
and label are invisible to `tsc`. Both were added with the section rather than
with the panel. `app/admin/tabs.test.ts` also pins `SECTION_TABS` by exact
equality and had to grow the new entry; that file was outside the task's stated
file list, which is why it went red first.

---

## Success Criteria

- [ ] An admin can answer "is `tools.web.brave.enabled` consistent across this
      subscription?" without opening a single member.
- [ ] Turning it on everywhere is one submit, and the count in the preview matches
      the count in the result.
- [ ] A member with a corrupt `config.json` is named on screen and excluded, and
      the other members still change.
- [ ] The template checkbox's cross-subscription reach is readable without
      hovering anything.
