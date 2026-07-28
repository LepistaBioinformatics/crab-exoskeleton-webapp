# admin-instance-config-editor — Specification (webapp)

**Status:** Shipped. See "Reconciliation" at the end for what changed during
implementation.
**Size:** Large (new BFF route pair, new panel surface, two editor modes)
**Companion spec:** `crab-shell-proxy/.specs/features/admin-instance-config-editor/spec.md`
owns the problem statement, the API contract, the FR-7 argument and the
authorization decision. This document covers the webapp slice and does not
restate them.

---

## What this side adds

An admin managing a subscription can open **one member instance's
`config.json`** from the Members panel and edit it in two interchangeable modes:

- **Raw** — the document as text, exactly what will be sent.
- **Tree** — a nested key/value form over the parsed document, so an admin can
  fix a value without hand-balancing braces.

"Instance" is one `(member, agent)` pair — the container the proxy keys as
`WorkspaceKey`. A member with grants on two agents has two instances, each with
its own `config.json`.

## Non-goals

- No template editor, no config history/diff, no schema-aware validation or
  completion (deferred in the proxy spec: DEFER-1, DEFER-2, DEFER-4).
- No new dependency. The tree editor is built from the existing primitives; no
  JSON-editor package, no code-mirror, no syntax highlighter.
- The editor does not reach any other file in the workspace.

---

## Requirements

### FR-1 — BFF routes

- **FR-1.1** `GET /api/admin/users/config?tenant_id=&subs_acc_id=&user_acc_id=&agent=`
  and `PUT` on the same path forward to the proxy's
  `/v1/admin/users/config`, using `proxyAdminJson` and the shared
  `requireSession` guard, exactly like the sibling `users/files` route.
- **FR-1.2** The routes live in their **own** file
  (`app/api/admin/users/config/route.ts`), not appended to
  `users/files/route.ts` — that file carries a standing "there is deliberately NO
  content route here and NO write/edit route … Do not add one" instruction which
  must stay literally true of it.
- **FR-1.3** The new file states why a `config.json` route is not the thing that
  instruction forbids, pointing at the proxy spec's FR-7 section.
- **FR-1.4** `agent` is **required** and forwarded verbatim; a missing one is a
  local `400 invalid_request` (the proxy rejects it too, but the BFF already
  validates its required parameters this way).
- **FR-1.5** `PUT` forwards the restart-policy parameters via the existing
  `restartParams`/`withRestart` helpers, unvalidated (the proxy owns the rules).
- **FR-1.6** Upstream statuses and error codes reach the client untouched
  (`proxyAdminJson` already normalizes `409`, `413`, `404` bodies), so the panel
  can distinguish `stale_revision`, `not_provisioned`, `invalid_json` and
  `too_large`.

### FR-2 — Client surface in the Members panel

- **FR-2.1** The expanded member row gains an **Instances** section above the
  existing private-files list: one row per agent workspace that member actually
  has. The rows come from the `listSubscriptionUsers` feed already loaded by the
  panel — the `(accId, role)` pairs — **not** from the merged roster's role
  labels, which include invitations with no workspace and lose the pairing.
- **FR-2.2** Each instance row shows the agent key and a single action:
  **Edit configuration**. It opens the editor for that `(user_acc_id, agent)`.
- **FR-2.3** The action is **not** attached to a file row, and no file row gains
  a click handler, link or download affordance. `members-panel.tsx`'s standing
  instruction about file rows stays in force and its comment is extended, not
  weakened, to say where the config action lives and why it is a different
  surface.
- **FR-2.4** A `404 not_provisioned` renders as "this member has never started
  this agent, so there is no configuration yet" — a state, not an error.

### FR-3 — The editor shell

- **FR-3.1** A modal (portal, backdrop, Escape to close), wide enough for a
  ~500-line document. It states which instance it is editing: member email/id and
  agent key.
- **FR-3.2** It opens on **Raw** when the document does not parse, and on **Tree**
  when it does. The broken case is the one this feature exists for, and the raw
  text is the only view that can show a syntax error.
- **FR-3.3** A mode switch (Raw / Tree). **Tree is disabled while the document
  does not parse**, with the parse error and its byte offset shown next to it.
- **FR-3.4** Closing with unsaved changes asks for confirmation
  (`ConfirmDialog`, `danger` tone) — the edit cannot be recovered.
- **FR-3.5** Escape and backdrop click go through the same confirmation when
  dirty.
- **FR-3.6** Managed paths (the proxy's `managedPaths`) are rendered
  **read-only** in Tree mode with a lock marker and an explanation that the proxy
  owns them. The list comes from the response — the webapp never hardcodes its
  own copy.
- **FR-3.7** Redacted values (`redactedPaths`) are shown masked with an
  explanation that a credential was found in a legacy layout, that it is not
  displayed, and that the proxy will replace the whole `model_list` on save.

### FR-4 — Raw mode

- **FR-4.1** A monospace textarea holding the document text. Tab inserts two
  spaces rather than moving focus, since the field is a code editor.
- **FR-4.2** The text is validated on every change with `JSON.parse`. The result
  is shown as a status line: valid, or the parser message with the line/column
  derived from the error position. **Shipped without a debounce** — the parse is a
  `useMemo` over the text, and `JSON.parse` on a 12 KiB document is microseconds;
  a debounce would only delay the error an admin is typing towards.
- **FR-4.3** **Save is disabled while the text is not valid JSON, or is not a
  JSON object at the top level.** The proxy rejects both (its FR-2.2); blocking
  locally makes the reason immediate instead of a round-trip.
- **FR-4.4** A **Format** action reindents the document (2 spaces), available
  only while it parses.

### FR-5 — Tree mode

- **FR-5.1** The tree renders the parsed document: objects and arrays as
  collapsible nodes labelled with their key (or index) and child count, leaves as
  type-appropriate controls — text input for strings, a decimal-mode field for
  numbers, a toggle for booleans, and an explicit `null` marker.
- **FR-5.1.1** A number leaf holds the text being typed while it has focus and
  commits only a **complete** number, because `0.` and `-` are states an admin
  passes through on the way to `0.7` and `-1`. Coercing them lands on `0`, the
  re-render erases the keystroke, and a decimal becomes unreachable — the seeded
  template's `min_success_ratio: 0.7` is exactly that case. Blur commits whatever
  the draft amounts to. The field is `type="text"` with `inputMode="decimal"`: a
  native number input reports `""` for a partial value, throwing away the very
  keystrokes this preserves.
- **FR-5.2** Objects and arrays are **collapsed by default below the second
  level**. The seeded document has ~470 lines and 15 channel blocks; an
  all-expanded tree is unusable.
- **FR-5.3** Each leaf has a **type switcher** (string / number / boolean /
  null). Recovering from a wrong JSON type — `"max_tokens": "32768"` as a string
  — is a primary repair case and is impossible to express with a typed input
  alone.
- **FR-5.4** Objects support **add key** and **remove key**; arrays support
  **append item** and **remove item**. A new key is added as an empty string
  value and the admin retypes it via FR-5.3.
- **FR-5.5** Adding a key that already exists in that object is refused inline
  (it would silently overwrite a sibling).
- **FR-5.6** Managed paths render as read-only rows (FR-3.6): no input, no type
  switcher, no remove action, and an object on a managed path cannot have keys
  added under it.
- **FR-5.7** Every tree edit rewrites the canonical document text immediately
  (FR-6.1). A consequence, and it is deliberate: a tree edit **reformats** the
  whole document to 2-space indent. The alternative — a second source of truth
  and a merge between them — is how an editor loses an admin's change.
- **FR-5.8** A tree row is addressable for tests by its dotted path
  (`data-path="tools.exec.timeout_seconds"`).

### FR-6 — State model

- **FR-6.1** The **text** is the single source of truth. Tree mode derives its
  value from it on render and writes back a re-serialized document on every edit.
  Raw mode edits it directly. Switching modes therefore never loses an edit and
  never needs a merge.
- **FR-6.2** `revision` from the `GET` is held and sent with the `PUT`. A `409
  stale_revision` shows a specific message — "this configuration changed while
  you were editing" — with a **Reload** action, and never silently overwrites.
- **FR-6.3** After a successful `PUT`, the editor **replaces its state with the
  response body** (the proxy returns the post-materialization document). If any
  managed path differs from what was sent, it says so: the proxy re-established
  its own keys. Nothing is assumed to have saved as typed.
- **FR-6.4** `reapplied.ok === false` surfaces as a warning — the configuration
  was saved but the proxy could not re-apply the model resolution — with the
  detail from the response. The save is **not** presented as failed.
- **FR-6.5** Save is disabled while a request is in flight and while the
  document is unchanged.

### FR-7 — Restart delivery

- **FR-7.1** The editor offers the existing `RestartPolicySelect`
  (restart-control FR-8.1) so the admin chooses **Restart now** or **Notify the
  member**. `config.json` is read only at picoclaw boot
  (`gateway.hot_reload: false`), so a save with no bounce changes nothing yet —
  the chooser must be present, not implied.
- **FR-7.2** **Schedule is not offered** here. The proxy reduces this endpoint's
  policy with `bounceNow`, where `schedule` behaves as `notice`; offering it
  would promise a scheduled window the endpoint does not arm.
- **FR-7.3** The member-facing restart banner must phrase the new `config`
  reason. `restart-notice.tsx`'s reason copy is keyed by the proxy's enum and a
  missing key would render an empty banner.

### FR-8 — i18n

- **FR-8.1** All new copy goes in `lib/i18n/admin.ts` under a new
  `instanceConfig` key, in **both** locales, plus the `config` restart reason in
  the existing reason map.
- **FR-8.2** JSON syntax terms are not translated: key names from the document,
  the type names in the switcher (`string`, `number`, `boolean`, `null`) and the
  `JSON.parse` message are identifiers/verbatim parser output. The parity test's
  `SHARED` set is extended for the type names, with that reason.

### NFR

- **NFR-1** No new dependency (`package.json` unchanged).
- **NFR-2** The tree renders the seeded ~12 KiB / ~470-line document without a
  visible stall. FR-5.2's default-collapsed rule is what buys this; no
  virtualization.
- **NFR-3** Tree and raw parsing/serialization logic lives in a **pure module**
  with no React import, so it is unit-testable without mounting (the pattern
  `tabs.ts`, `format.ts` and `turn-store.ts` already follow).
- **NFR-4** Additive: no existing route, panel or component changes behaviour.
  `members-panel.tsx` gains a section; its file-row rules are untouched.

---

## Traceability

| ID | Verified by |
| --- | --- |
| FR-1.2 | File exists at `app/api/admin/users/config/route.ts`; `users/files/route.ts` unchanged |
| FR-1.4 | Route test: missing `agent` → 400 without an upstream call |
| FR-2.1 | Component test: two workspaces for one email render two instance rows |
| FR-2.3 | Component test: file rows still have no link/button beyond delete |
| FR-2.4 | Component test: `not_provisioned` renders the empty state, not an error |
| FR-3.2 | Component test: unparseable payload opens on Raw |
| FR-3.3 | Component test: Tree switch disabled + parse error shown while invalid |
| FR-3.4 | Component test: closing dirty opens the confirm dialog |
| FR-3.6 | Component test: a `managedPaths` row has no input and no remove action |
| FR-4.2 | Unit (pure module): parse errors map to line/column |
| FR-4.3 | Component test: Save disabled on invalid text and on a top-level array |
| FR-5.1 | Unit: value → tree node shape for each JSON type |
| FR-5.1.1 | Unit: `parseNumberDraft` holds back `0.`/`-`/`` and commits `0.7`/`-1`/`1e3`; a full decimal entry walked keystroke by keystroke |
| FR-5.3 | Unit: type switch string→number converts and re-serializes |
| FR-5.4 | Unit: add/remove key and append/remove item |
| FR-5.5 | Unit: duplicate key add is refused |
| FR-5.6 | Unit: a managed path is non-editable in the derived tree |
| FR-5.7 | Unit: a tree edit round-trips through the text and back |
| FR-6.1 | Component test: edit in Tree, switch to Raw, the edit is in the text |
| FR-6.2 | Component test: 409 shows the stale message + Reload, no retry |
| FR-6.3 | Component test: response body replaces state; a reverted managed path is announced |
| FR-6.4 | Component test: `reapplied.ok:false` renders a warning, not a failure |
| FR-7.1 | Component test: the policy select is present and its value reaches the request |
| FR-7.3 | Component test: `reason: "config"` renders non-empty banner copy |
| FR-8.1 | `parity.test.ts` (existing gate) |

---

## Reconciliation (what shipped)

Every FR is implemented. Six deviations, and one of them found a real bug.

**Component tests are not where the spec put them.** This repo's vitest config is
`environment: "node"` with no DOM and no testing-library, and the editor portals
to `<body>`, so it cannot be mounted in this suite at all — the same limit
`restart-notice.test.tsx` already documents about itself. Rather than change the
shared test environment for one feature, the coverage moved:

| Was going to be | Is |
| --- | --- |
| `instance-config-editor.test.tsx` | `instance-config-state.test.ts` — a new **pure** module holding the editor's decisions (`initialMode`, `canSave`, `outcomeFor`, `outcomeForError`, `insertTab`), 14 tests |
| Tree component tests | `json-tree-view.test.tsx` — `renderToStaticMarkup`, which works because the tree has no effects and no portal. Asserts the **first paint**, which is exactly where the read-only rules live |

FR-3.1, FR-3.4, FR-3.5, FR-4.1 and FR-4.4 (modal shell, dirty-close confirmation,
Escape/backdrop, the Tab handler's wiring, Format) are therefore verified by
`tsc` and the production build plus manual UAT, not by an automated test. That is
a real gap and it is the environment's, not the design's: closing it needs
jsdom + testing-library, which is its own change.

**The extraction was worth it independently.** `outcomeFor`'s ordering rule — a
failed re-apply outranks a reverted managed path, and both read as *saved* — is a
product decision, and it now has a test naming the reason instead of living
inside a JSX branch.

**`json-tree.tsx` had to be renamed `json-tree-view.tsx`.** `./json-tree`
resolves to the `.ts` file first, so the two modules the design named could not
coexist under one basename.

**`isManaged` became `isWithin`, and the rename caught a bug.** The tree's
redaction check was written as "this path equals a redacted entry, or an entry
starts with it" — which does not match `model_list[0].api_keys[0]`, the leaf that
actually holds the credential. The first render of the markup test printed
`sk-live-secret` into an editable input. Both the managed check and the redaction
check need the same containment rule (a path, or anything inside it), so they now
share one function. `json-tree-view.test.tsx`'s masking test is the regression
gate.

**FR-8.2's `SHARED` extension was unnecessary.** The JSON type names in the
switcher come from a literal array in the component (`string`/`number`/
`boolean`/`null` are JSON syntax, not copy), so they never entered the i18n
dictionaries and the parity test needed no exemption. All other new copy is in
both locales and `parity.test.ts` passes unchanged.

**`Alert` has only `error` and `info` severities.** The spec's "warning" states
(reapply-failed, and the saved/reverted notices) render as `info`; stale-revision
renders as `error`, because nothing was written. No new severity was added for
this feature.

**A decimal was unenterable in the tree, and is fixed (FR-5.1.1).** The first
implementation coerced a number leaf on every keystroke, so `0.` became `0` and
the re-render erased the point — `min_success_ratio: 0.7`, which is in the seeded
template, could not be typed at all. The fix is `parseNumberDraft` plus a
focus-scoped draft in the leaf; the pure test walks a full decimal entry
keystroke by keystroke. Raw mode was always a workaround for this, never a fix.

**FR-5.2 (refused writes are audited) was only half-shipped, and is now whole.**
The proxy's `adminInstanceKey` answers a 403 or a bad-parameter 400 and returns
before the audit line could be reached, so exactly the refusal an operator most
wants to see went unlogged — and FR-4.4 leans on that logging to justify the
authz tier. The handler now audits from its own refusal branches. See the proxy
spec's reconciliation.

**Verification.** `yarn tsc --noEmit` clean. `yarn vitest run`: **275 passed / 25
files**, including 27 `json-tree`, 14 `instance-config-state`, 8
`json-tree-view`, and `parity.test.ts`. `yarn build` succeeds with
`/api/admin/users/config` in the route manifest. `app/api/admin/users/files/route.ts`
has an empty diff, so its "do not add one" instruction is untouched; the only
deletions in `members-panel.tsx` are the lucide import line and the `<UserFiles>`
block being wrapped in a fragment.
