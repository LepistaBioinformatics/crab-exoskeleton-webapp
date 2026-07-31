# STATE — crab-exoskeleton-webapp (+ crab-shell-proxy)

Persistent memory across sessions. Last updated: 2026-07-20.

## Completed this session

- **Subscription uninvite** — `features/subscription-uninvite`. The Members invite panel
  gained an Invite/Uninvite toggle over the same three fields, calling the DELETE route
  that already existed. Both verbs were already JSON-RPC; nothing moved off REST. The
  reason the operator had *no* uninvite affordance was a wire-shape bug:
  mycelium's `Parent<T,Id>` is **externally tagged** (`{"record": {...}}`), the webapp
  read it flat, so every roster label resolved to `"unknown"`, `parseRoleLabel` rejected
  it and the per-row revoke icon never rendered. `lib/invitations.ts` now reads the
  embedded record and prefers it over the tenant role list — which is also more robust,
  since `guestRoles.list` is refused to a TenantManager profile and truncates at
  mycelium's default page size of 10 (`/api/invitations/roles` now sends an explicit
  `pageSize`). Guest roles are global, not tenant-scoped.

- **Tenant brand avatar in sidebar** — `app/chat/workspace-nav.tsx` +
  `components/ui/avatar.tsx` (+ test). The tenant brand logo (mycelium tag
  `value:"brand"`, `meta.base64Logo`) shows as a small rounded-square avatar
  left of the tenant name; initials fallback. Spec: `features/tenant-avatar-sidebar`.
- **Conversation-tree dimming fix** — `app/chat/conversation-tree.tsx`. Dimming
  is now gated on `treeHovered` (cursor over the tree), not on `activeSessionId`
  (which falsely dimmed everything when a non-matching sid was set).
- **Per-user model management — BUILT THEN REMOVED (superseded).** Was
  implemented (per-user `/v1/model-catalog` + drawer `ModelManager`), but the
  user corrected the requirement: model management must be **admin-driven**, not
  self-service. All per-user model code was removed (proxy `model_catalog.go`,
  handlers, routes, interface methods; webapp `model-manager.tsx`,
  `lib/modelCatalog.ts`, `app/api/model-catalog/*`) and the drawer's native
  "Model API key" slot was dropped (native = web-provider only now). See the
  new design below.
- **Shared skills 404 → stopgap** — hid the "Shared skills" admin tab
  (`app/admin/admin-screen.tsx`). Proxy has no `/v1/admin/skills*` (only the
  global read-only `managed-skills` cascade). Spec: `features/shared-skills-management`.

## Debugging resolved this session

- **beta "401 api key invalid" (…b0ee)** — NOT the key/secrets change. beta's
  active model was `deepseek-vl2`, not served by `api.deepseek.com` (+ its
  model_list entry had empty `provider`). Fix: point beta at `deepseek-chat`.
  Each agent has its own `apiKeyEnv`; same key worked on alpha (deepseek-chat).
- **"Can't reach the gateway right now." on tool use** — front-side, not infra.
  BFF instrumentation showed the upstream SSE ends cleanly (`upstream ended
  cleanly: N chunks`); the proxy/gateway are fine (gatewayTimeout=60s, awc
  timeout is headers-only). Correlated with the agent thrashing on failing tools
  (`python3 not found`, `path escapes workspace`, `exec` missing `action`).
  Stopped reproducing after a rebuild; root cause on the front never fully
  captured. See TODO on instrumentation cleanup.

## DONE (runtime-unverified) — admin per-agent model management (the redo)

All phases A-D implemented. Proxy: build+vet clean, `httpapi` + new
`registered_models_test.go` (round-trip: add→list(no key)→apply-to-user
writes def+key+active→delete) pass. Webapp: tsc clean, 38 tests pass. NOT
runtime-verified (needs deploy of BOTH proxy + webapp; container restart/chown
path unexercised — sandbox has no Docker). Proxy: `internal/docker/registered_models.go`
(+ test), handlers in `internal/httpapi/admin.go`, routes/interface in
`handlers.go` — `GET/POST/DELETE /v1/admin/registered-models` +
`POST /v1/admin/registered-models/apply` (agent from the routed picoclaw
service; registry CRUD gated on `HasAdminPrivileges`, apply on
`AuthorizeUserManagement`). Webapp: `lib/registeredModels.ts`, BFF
`app/api/admin/registered-models/{route,apply/route}.ts`,
`proxyAdminJsonAgent` in `lib/adminProxy.ts`, admin UI
`app/admin/model-registry-panel.tsx` (now the "Model" tab). Old
`app/admin/model-panel.tsx` + `lib/adminModels.ts` (config.yaml override UI)
are now orphaned — left in place, candidates for later removal.

### Original design (superseded by the above)

Confirmed design (replaces the removed per-user feature):
- **Admin registers a new model (definition + secret/key), per agent** — e.g. a
  glm for alpha, a deepseek for beta. Per-agent, global (all subs/users of that
  agent). Keys live **on disk** in a secured per-agent file (departs from the
  env-only design — user confirmed OK).
- **Admin assigns a model to individual users**, one by one, from the admin
  "Model" screen (user list). Admin-only; NO self-service.
- Built ON TOP of the existing model-override subsystem (`/v1/admin/model`,
  `ModelPanel`, `reapplyModel` already applies model+key to a user's container
  on select).

Confirmed decisions: (1) keys on disk — yes; (2) per-agent global — yes;
(3) make admin model routes **agent-aware** (today `/v1/admin/*` is alpha-only
via ADMIN_BASE=`/picoclaw-alpha`) — yes; (4) remove all per-user drawer model
management incl. the native model-key field — done.

Build plan (Phase A done):
- **A (DONE):** remove the rejected per-user model code + drawer model-key slot.
- **B (todo):** proxy per-agent registered-models store (definition + key) +
  agent-aware admin CRUD endpoints; feed `SelectableModels`/`FindModel`/
  `resolveModel` so registered models are selectable and reapply carries the key.
- **C (todo):** make admin model routes agent-aware (route per `picoclaw-<agent>`).
- **D (todo):** admin UI — register model per agent + the (agent-aware) per-user
  assignment panel.

## Fixes after the redo (2026-07-20)

- **Models tab "Request path does not match any service"** — the mycelium
  gateway allowlists downstream paths per service in
  `fungi/mycelium/config.base.toml` (`[[picoclaw-<agent>.path]]`). The new
  `/v1/admin/registered-models` + `/v1/admin/registered-models/apply` weren't
  listed. Added them for **both** picoclaw-alpha and picoclaw-beta (GET/POST/
  DELETE and POST respectively). REQUIRES a **gateway reload** to take effect.
- **Members tab showed users twice** — `ListSubscriptionUsers` globs
  `agents/<role>/users/<u>`, so a user with a workspace under both alpha and
  beta returns twice (same accId, different `role`). The webapp keyed rows +
  the expand state by `accId` only → key collision + opening one expanded both,
  with no agent shown. Fixed: `UserRef` now carries `role`; `members-panel.tsx`
  keys/expands by `(role, accId)` and shows an agent badge; the registry panel's
  assignment list filters to the selected agent's users.

## Deploy needed for the model feature to work end-to-end
gateway (new allowlist paths) + proxy (registry endpoints) + webapp (UI/fixes).

## Decisions

- **DEC (model mgmt):** picoclaw's real model catalog lives in each agent's
  **template `config.json` `model_list`** (global per agent), NOT the proxy
  `config.yaml` `SelectableModels` (which is ~1 pinned model). Model management
  is **per-user** (edits the user's own config.json) — Q2=user. UI can **define
  new models** (Q1=b), not just set keys.
- **DEC (native secrets scope-gate): REVERTED.** Restricting native secrets to
  scope-admins was architecturally incompatible: native secrets are **per-user
  only** and never cascade from a scope (`syncEffectiveSecrets`). Blocking them
  stranded a normal user's invalid model key. Reverted to per-user BYOK.
- **DEC (avatar/dimming/model UI):** confirmed with the user via questions;
  model UI lives inside the per-user secrets drawer.

## DONE (runtime-unverified) — shared skills backend (Option A)

Chosen **A** (per-scope subsystem). Proxy: `internal/config/config.go`
(TenantSharedSkillsDir/SubscriptionSharedSkillsDir/EffectiveSkillsDir),
`internal/docker/skills.go` (store: name+frontmatter validation, doc, zip with
hardening, archive, delete; cascade `syncEffectiveSkills`/
`SyncEffectiveSkillsForScope`), `create()` mounts the merged EffectiveSkillsDir
RO at the global skills root + scaffold dirs, handlers in `admin.go`
(GET/POST/DELETE /v1/admin/skills + /doc + /archive) with SyncEffectiveSkills +
RestartScope on write. Unit-tested (skills_test.go: validation, frontmatter,
doc round-trip, zip good + traversal/no-SKILL.md/bad-frontmatter rejects,
archive, delete). Gateway already had the /v1/admin/skills* paths. Webapp UI
(shared-skills-panel + lib/adminSkills + BFF) already existed; the admin
"Shared skills" tab was re-enabled. Deploy proxy + webapp to verify the live
cascade/mount.

## Cleanup — removed native from the shared-secrets admin panel

`WriteSharedSecret` (proxy) only accepts dotenv/json, so the panel's native
format (web + model) always 400'd and scope-native never cascades; model keys
are owned by the registry now. Removed the native format from
`shared-secrets-panel.tsx` (dropdown → dotenv/json/file). The per-user drawer
keeps native/web (works per-user).
- **Model management runtime verification** — blocked on a real deploy (sandbox
  has no Docker daemon; can't chown; docker-integration tests fail on
  `chown operation not permitted`, pre-existing/environmental).

## TODO

- Deploy BOTH crab-shell-proxy and crab-exoskeleton-webapp to verify model
  management end-to-end (endpoints 404 until the proxy is rebuilt).
- **Remove temp debug instrumentation** once "can't reach gateway" is confirmed
  gone: `console.error("[chat] send/stream turn failed", …)` in
  `app/chat/chat-view.tsx`, and the `[chat] upstream …` TransformStream logging
  in `app/api/chat/[instance]/route.ts`. (The `catch {}` → `catch(err)` change is
  worth keeping as hygiene.)
- Decide shared skills A vs B, then implement the proxy backend and un-hide the
  admin tab (remove the now-unused `Wrench` import in `admin-screen.tsx`).
- Investigate the agent tool-thrashing (persona/skills vs the minimal picoclaw
  container: `python3` missing, workspace isolation, `exec` schema mismatch).

## Quick tasks

- **001 — expired session routed to onboarding** (2026-07-30, done, runtime-unverified).
  `myceliumRpc` resolves non-2xx instead of throwing, so `hasAccount` read a 401
  as "no account" and `/chat` sent expired sessions to `/onboarding`. Added an
  `"expired"` status (401 on either beginners RPC) → `redirect("/signin")` in both
  `/chat` and `/onboarding`. See `.specs/quick/001-expired-session-routes-to-onboarding/`.

## DONE (visually unverified) — pre-auth theme + sign-in URL state (2026-07-30)

`.specs/features/pre-auth-theme-and-signin-url-state/spec.md`. Three fixes on
`/signin`: it now follows `prefers-color-scheme` (light block scoped to
`.backdrop`, so the landing keeps its committed dark), the code step lives in the
URL (`?step=code&email=`) so a reload no longer drops the user back to the e-mail
form, and the "Back to home" link is not rendered under `START_AT_SIGNIN`. The
route split into a server page (reads the flag, provides the Suspense boundary)
plus `signin-form.tsx`. Behaviour verified against the served production build;
the light *rendering* was never looked at — no headless browser here.

**Decision:** no theme selector. The user was offered a light/dark/system switcher
(cookie-persisted like the locale) and chose OS-follow only, and chose to leave
the landing dark. Onboarding needed no change — it was already token-based.

## Quick tasks (cont.)

- **002 — expired session hardening** (2026-07-30, done). Closes both of 001's
  deferred ideas: `getSession()` now reads the token's `exp` (tolerantly — an
  unreadable token stays live), and the middleware checks expiry *and* deletes the
  dead cookie on the redirect, which a Server Component cannot do. `/` with an
  expired cookie renders the landing instead of bouncing via `/chat`. Verified
  against the served production build with crafted cookies.
  See `.specs/quick/002-expired-session-hardening/`.
- **003 — persona writes go upstream as urlencoded** (2026-07-30, done). The
  Identity tab's 400 (`"tenant_id" is required and must be a UUID`) is a
  crab-shell-proxy defect (`ParseForm` on a multipart body); the BFF now sends
  urlencoded, which the **already deployed** proxy reads, so Identity works without
  waiting for a proxy deploy. The proxy fix accepts both encodings so deploy order
  cannot break it again. See `.specs/quick/003-persona-urlencoded-upstream/` and
  `crab-shell-proxy/.specs/features/persona-injection/multipart-parse-fix-report.md`.

## Deferred ideas

_Both entries here (JWT `exp` validation, clearing the stale cookie) were
implemented in quick task 002._

## Known limitations / latent issues

- **`agents.defaults.model_name` owned by two systems:** per-user
  `SelectCatalogModel` vs the model-override subsystem (`reapplyModel` ←
  config.yaml `SelectableModels`). Admin override-panel actions can overwrite a
  user's UI model selection. Tolerable for Q2=user; documented, not reconciled.
- **Scope-level native secrets are inert** — written but never cascaded to
  containers (only dotenv/json cascade). The shared-secrets admin panel's native
  format (incl. model) does nothing at scope level.

## Preferences (working style)

- Talk to the user in **pt-BR**; repo artifacts (code, specs) stay English.
- Follow systematic-debugging: root cause before fixes; the user pushed back
  correctly when a hypothesis was assumed rather than verified.
- Don't build speculative subsystems without a confirmed design decision.
