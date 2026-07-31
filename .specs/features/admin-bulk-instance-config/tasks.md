# admin-bulk-instance-config — Tasks (webapp)

**Spec**: `.specs/features/admin-bulk-instance-config/spec.md`
**Proxy design (contract)**: `crab-shell-proxy/.specs/features/admin-bulk-instance-config/design.md`
**Status**: Done (W1–W9)

## Progress

| Task | Status | Note |
| --- | --- | --- |
| W1 | ✅ | Section registered. Also needed `TAB_ICONS` + `shell.tabs` entries and the `SECTION_TABS` exact-equality assertion in `tabs.test.ts` — none were in the task's file list |
| W2 | ✅ | `TemplateCatalog.template` (not `agent`); `restart=now` sent explicitly (see spec Reconciliation) |
| W3 | ✅ | `previewCounts` sums `bucket.count`; `revisionsFor` excludes `path_conflict` so it agrees with the preview |
| W4 | ✅ | Three passthroughs on `proxyAdminJson`; no local validation; `by` never forwarded |
| W5–W7 | ✅ | Built as one component (same file, no commit boundary between them). All three checklists satisfied; `json-tree-view` not reusable as a viewer |
| W8 | ✅ | Mounted with `scope` un-folded (agent is a separate upstream parameter) |
| W9 | ✅ | 38 files / 483 tests green, `tsc` clean, `next build` clean, three routes registered |

Gate at close: `npx tsc --noEmit` clean · `npm test` 38 files / **483** passed
(baseline was 36 / 415) · `npx next build` clean.

---

## Test matrix and gates (derived, not assumed)

`.specs/codebase/TESTING.md` does not exist, so the matrix is derived from what
the suite actually contains (36 files, 415 tests):

| Code layer | Required tests | Evidence in repo | Parallel-safe |
| --- | --- | --- | --- |
| Pure decision modules (`app/admin/*-state.ts`, `app/admin/tabs.ts`, `lib/*.ts`) | unit (vitest, `environment: node`) | `instance-config-state.test.ts`, `agent-scope.test.ts`, `model-defaults-panel.test.ts` | yes |
| Presentational components with their own logic | component test (`*.test.tsx`) | `json-tree-view.test.tsx`, `confirm-dialog.test.tsx` | yes |
| **Admin panels** (`*-panel.tsx`) | **none** | No `*-panel.test.tsx` exists for any panel; `shared-secrets-panel`, `model-registry-panel`, `persona-panel` have none. The convention is to **extract the decisions into a `*-state.ts` module that IS tested** (`instance-config-state.ts` is exactly this) and cover the shell with `tsc` + `next build` | yes |
| BFF routes (`app/api/**/route.ts`) | none | No route has a test; they are passthroughs and the proxy owns the contract | yes |
| i18n dictionaries | parity only | `lib/i18n/parity.test.ts` | yes |

**This is not test deferral.** W3 exists precisely so the panel tasks have no
untested logic left in them: every decision the panel makes (value parsing,
preview counts, revisions map, outcome grouping, bucket ordering for display)
lives in W3 and is unit-tested there. A panel task that finds itself needing a
*new* decision must push it into `bulk-config-state.ts` and test it there.

| Gate | Command |
| --- | --- |
| quick | `npx tsc --noEmit && npm test -- <path/to/test>` |
| full | `npx tsc --noEmit && npm test && npx next build` |

Baseline: 36 files / 415 tests green on a clean HEAD. Any task's `Done when`
naming a test count means **≥ baseline + the new ones**, never fewer.

---

## Execution Plan

### Phase 1: foundation (parallel)

```
W1 [P] ──┐
W2 [P] ──┴──→ (phase 2)
```

W1 and W2 touch different files and neither depends on the other.

### Phase 2: logic and transport (parallel)

```
W2 ──┬──→ W3 [P]
     └──→ W4 [P]
```

### Phase 3: the panel (sequential — one file)

```
W3, W4 ──→ W5 ──→ W6 ──→ W7
```

No `[P]`: W5, W6 and W7 all write `app/admin/bulk-config-panel.tsx`.

### Phase 4: wiring and close-out (sequential)

```
W1, W7 ──→ W8 ──→ W9
```

---

## Task Breakdown

### W1: Register the section [P]

**What**: Add `config` to the tab vocabulary as a picoclaw-only section.
**Where**: `app/admin/tabs.ts`, `app/admin/agent-scope.ts`,
`app/admin/agent-scope.test.ts` (modify)
**Depends on**: None
**Reuses**: `SECTION_TABS`, `PICOCLAW_ONLY`, `CONTENT_TABS` (derives itself)
**Requirement**: WBULK-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `config` present in `TAB_KEYS`, `SECTION_TABS` and `PICOCLAW_ONLY`
- [ ] `agentTabs` returns `config` for a picoclaw agent and **not** for a hermes
      agent or the legacy store — asserted in `agent-scope.test.ts`
- [ ] `resolveAgentTab("config", <hermes agent>)` falls back to that agent's first
      section, no new branch needed
- [ ] `CONTENT_TABS` is not edited by hand
- [ ] Gate: `npx tsc --noEmit && npm test -- app/admin/agent-scope.test.ts`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(admin): register the bulk config section`

---

### W2: Types and fetchers [P]

**What**: `lib/scopeConfig.ts` — TS mirrors of the proxy's response types and the
three fetchers.
**Where**: `lib/scopeConfig.ts` (new), `lib/scopeConfig.test.ts` (new)
**Depends on**: None
**Reuses**: the fetch/error shape of `lib/models.ts` and `lib/secrets.ts`
**Requirement**: WBULK-02, WBULK-08, WBULK-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `ScopeConfigInspection`, `ConfigKeyBucket`, `ConfigKeyInstance`,
      `TemplateCatalog`, `TemplateKey`, `ScopeConfigResult`, `BucketState` exported
- [ ] Config values typed `unknown` — not `any`, not `string` (spec FR-4.2)
- [ ] `listConfigKeys`, `inspectConfigKey`, `applyConfigKey` build the documented
      query strings and, for the PUT, pass the restart policy through
- [ ] A malformed response coerces to a safe empty shape rather than throwing,
      the way `parseSecretNames` does in `lib/secrets.ts`
- [ ] Gate: `npx tsc --noEmit && npm test -- lib/scopeConfig.test.ts`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(admin): add scope config client and types`

---

### W3: The panel's decisions, as a pure module [P]

**What**: `bulk-config-state.ts` — every decision the panel makes, testable
without a DOM.
**Where**: `app/admin/bulk-config-state.ts` (new),
`app/admin/bulk-config-state.test.ts` (new)
**Depends on**: W2
**Reuses**: `parseDocument` / `JsonValue` (`app/admin/json-tree.ts`), and the
shape of `instance-config-state.ts`
**Requirement**: WBULK-03, WBULK-04, WBULK-06, WBULK-07, WBULK-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `parseValueInput(text)` returns a discriminated result so `true`, `42`,
      `"text"` and `null` are each distinguishable from a parse failure
- [ ] `previewCounts(inspection, newValue)` returns `{willChange, alreadyMatch,
      excluded}` where `absent` counts as **willChange** and
      `unreadable`/`path_conflict` as **excluded**
- [ ] `revisionsFor(inspection)` includes value buckets and `absent` (those
      instances are writable) and excludes **both** `unreadable` **and**
      `path_conflict`. Excluding `path_conflict` is what keeps `previewCounts`
      honest: it counts those instances as *excluded*, and an admin cannot resolve
      a conflict from this screen anyway. Sending them would make the preview say
      "excluded" and the result say "attempted and failed" — a test asserts the two
      functions agree on the same instance set
- [ ] `displayBuckets(inspection)` keeps the proxy's order and never reshuffles
      between two identical inputs
- [ ] `groupOutcomes(result)` groups by outcome with a stable order, and reports
      whether any outcome is `stale` (which drives the re-inspect prompt)
- [ ] `inspectionKey(scope, agent, key)` — the identity the panel discards on, so
      a `revisions` map from another scope can never be submitted
- [ ] Gate: `npx tsc --noEmit && npm test -- app/admin/bulk-config-state.test.ts`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(admin): add bulk config panel decisions module`

---

### W4: BFF routes [P]

**What**: Three passthrough routes.
**Where**: `app/api/admin/scope-config/keys/route.ts`,
`app/api/admin/scope-config/inspect/route.ts`,
`app/api/admin/scope-config/route.ts` (all new)
**Depends on**: W2
**Reuses**: `requireSession`, `forwardAdmin` / `proxyAdminJsonAgent`,
`restartParams`, `withRestart` (`lib/adminProxy.ts`)
**Requirement**: spec FR-2

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `GET` keys and inspect, `PUT` apply, each forwarding the bearer and the
      documented query parameters
- [ ] The PUT forwards restart params on the **query string** (`withRestart`),
      matching `app/api/admin/persona/route.ts`
- [ ] No validation duplicated from the proxy — in particular no local copy of the
      managed-path rule (spec FR-2.3)
- [ ] Each file carries the FR-7 distinction comment (proxy-materialized
      provisioning state, not member-authored content), as its per-instance
      sibling route does
- [ ] Gate: `npx tsc --noEmit && npx next build`

**Tests**: none (matrix: BFF passthroughs) · **Gate**: build
**Commit**: `feat(admin): add scope config BFF routes`

---

### W5: Panel — key picker and the distribution view

**What**: The panel shell, key selection, and bucket rendering.
**Where**: `app/admin/bulk-config-panel.tsx` (new), `lib/i18n/admin.ts` (modify)
**Depends on**: W3, W4
**Reuses**: `shared-secrets-panel.tsx`'s load→form→list shape, `Field` +
`fieldControlClass` (`app/admin/field.tsx`), `Alert`, `Spinner`, `Badge`,
`json-tree-view.tsx` for rendering a bucket's value
**Requirement**: WBULK-01 … WBULK-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Renders the tenant-scope explanation and **no form** when
      `scope.kind !== "subscription"`
- [ ] Key picker populated from `listConfigKeys`, `managed` entries disabled and
      labelled proxy-owned
- [ ] A hand-typed dotted path is accepted and inspected
- [ ] One group per bucket: value (via `json-tree-view`), count, member list
- [ ] `absent`, `path_conflict` and `unreadable` groups are visually apart and
      show no value
- [ ] `managed_path` / `invalid_key` surface on the key field, not page level
- [ ] Zero instances → the empty-state sentence, no form
- [ ] Bucket values scroll inside `overflow-x: auto`; the page never scrolls
      horizontally
- [ ] No inline conditional or interpolated `className` — variants via `cva`
- [ ] Copy in both locales; `npm test -- lib/i18n/parity.test.ts` green
- [ ] Gate: `npx tsc --noEmit && npm test && npx next build`

**Tests**: none (matrix: panels; logic lives in W3) · **Gate**: full
**Commit**: `feat(admin): show how one config key varies across a subscription`

---

### W6: Panel — value input, preview and result

**What**: The apply half.
**Where**: `app/admin/bulk-config-panel.tsx` (modify), `lib/i18n/admin.ts` (modify)
**Depends on**: W5
**Reuses**: `previewCounts` / `revisionsFor` / `groupOutcomes` from W3,
`lib/restartPolicy.ts`'s `RestartPolicy` prop convention (as
`model-registry-panel.tsx` takes it)
**Requirement**: WBULK-06 … WBULK-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] JSON value input; unparseable input blocks submit with an inline message
- [ ] Preview states will-change / already-match / excluded from W3's counts
- [ ] Submit sends the `revisions` map from W3
- [ ] Apply control disabled while an inspection is in flight
- [ ] Switching agent, scope or key discards the inspection and the pending value
      (`inspectionKey`)
- [ ] Result rendered per outcome with member names; a partial batch does not read
      as an error
- [ ] Any `stale` outcome prompts a re-inspect rather than a blind retry
- [ ] `reapplied.ok:false` shows a per-instance warning and the save still reads
      as successful
- [ ] Restart policy applied through the `restartPolicy` prop, with this panel's
      own default selection set to **`notice`** — the proxy defaults an absent
      parameter the same way for this endpoint (proxy DEC-9), so the two agree
- [ ] Restart wording keyed to the `applied` count, never to the total: only the
      changed instances are restarted or notified (proxy DEC-8)
- [ ] Copy in both locales; parity green
- [ ] Gate: `npx tsc --noEmit && npm test && npx next build`

**Tests**: none (matrix: panels; logic lives in W3) · **Gate**: full
**Commit**: `feat(admin): apply one config key across a subscription`

---

### W7: Panel — the template checkbox and its disclosure

**What**: `alsoTemplate` with the cross-subscription sentence.
**Where**: `app/admin/bulk-config-panel.tsx` (modify), `lib/i18n/admin.ts` (modify)
**Depends on**: W6
**Reuses**: `templateRevision` from `listConfigKeys`
**Requirement**: WBULK-11, WBULK-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Ticking it sends `alsoTemplate: true` **and** `templateRevision`
- [ ] Unticked → `alsoTemplate` absent from the body
- [ ] The sentence "the template seeds every subscription running this agent" is
      rendered **next to** the checkbox — not a `title`, not a tooltip, not behind
      a hover. Proxy DEC-4 makes this the control, so a code comment says so and
      forbids softening it
- [ ] `template.ok:false` shown separately from the instance results, which still
      read as applied
- [ ] Copy in both locales; parity green
- [ ] Gate: `npx tsc --noEmit && npm test && npx next build`

**Tests**: none (matrix: panels) · **Gate**: full
**Commit**: `feat(admin): allow a bulk config change to update the agent template`

---

### W8: Wire the section into the admin screen

**What**: Dispatch the panel for `?tab=config`.
**Where**: `app/admin/admin-screen.tsx` (modify)
**Depends on**: W1, W7
**Reuses**: the existing section dispatch and `restartPolicy` plumbing
**Requirement**: WBULK-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `?tab=config` on a picoclaw agent renders the panel with the resolved
      `ScopeRef`, agent and `restartPolicy`
- [ ] The scope-reach sentence in the header reads correctly for the new section
      (it is not the `model` case, so the `reaches … through <agent>` branch
      applies)
- [ ] No change to `parseTab`, `resolveMode` or the scope rail
- [ ] Gate: `npx tsc --noEmit && npm test && npx next build`

**Tests**: none (matrix: screen shell) · **Gate**: full
**Commit**: `feat(admin): mount the bulk config section`

---

### W9: Close-out

**What**: Full gate and traceability.
**Where**: `.specs/features/admin-bulk-instance-config/spec.md` (status column)
**Depends on**: W8
**Requirement**: spec NFR-2, NFR-3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` — **≥ 415** tests pass, all files green, i18n parity included
- [ ] `npx next build` passes
- [ ] Every WBULK-xx row names what verifies it (a W3 test, or the panel task
      whose `Done when` covers it)
- [ ] `git diff` shows no weakened assertion in any pre-existing test

**Tests**: none (verification task) · **Gate**: full
**Commit**: `test(admin): close bulk config traceability`

---

## Validation

### Check 1 — Task granularity

| Task | Scope | Status |
| --- | --- | --- |
| W1 | 2 array additions + its test | ✅ granular |
| W2 | 1 module (types + 3 fetchers) | ✅ cohesive |
| W3 | 1 module of pure functions | ✅ cohesive |
| W4 | 3 passthrough routes, one concept | ✅ cohesive |
| W5 | 1 component, read half | ✅ granular |
| W6 | same component, write half | ✅ granular |
| W7 | same component, 1 control | ✅ granular |
| W8 | 1 file, 1 dispatch | ✅ granular |
| W9 | verification only | ✅ granular |

### Check 2 — Diagram / definition cross-check

| Task | `Depends on` (body) | Diagram arrows | Status |
| --- | --- | --- | --- |
| W1 | None | root | ✅ |
| W2 | None | root | ✅ |
| W3 | W2 | W2 → W3 | ✅ |
| W4 | W2 | W2 → W4 | ✅ |
| W5 | W3, W4 | W3 → W5, W4 → W5 | ✅ |
| W6 | W5 | W5 → W6 | ✅ |
| W7 | W6 | W6 → W7 | ✅ |
| W8 | W1, W7 | W1 → W8, W7 → W8 | ✅ |
| W9 | W8 | W8 → W9 | ✅ |

**Parallel check**: W1 ∥ W2 touch disjoint files. W3 ∥ W4 touch disjoint files and
neither depends on the other. No `[P]` pair shares a file. ✅

### Check 3 — Test co-location

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| W1 | pure module (`tabs.ts`, `agent-scope.ts`) | unit | unit | ✅ |
| W2 | `lib/*.ts` module | unit | unit | ✅ |
| W3 | pure decision module | unit | unit | ✅ |
| W4 | BFF passthrough | none | none | ✅ |
| W5 | admin panel | none (logic in W3) | none | ✅ |
| W6 | admin panel | none (logic in W3) | none | ✅ |
| W7 | admin panel | none (logic in W3) | none | ✅ |
| W8 | screen shell | none | none | ✅ |
| W9 | no code | none | none | ✅ |

Every `none` traces to a matrix row backed by evidence in the repo, and the panel
rows are backed by W3 carrying the logic — not by "tested in another task".

---

## Cross-repo note

W2's types and W4's routes are written **against the proxy design's documented
contract**, not against a running proxy. The two repos can therefore be built in
parallel; the integration check (panel against a rebuilt proxy) is the one thing
neither repo's gate can prove, and it belongs to whoever deploys them.
