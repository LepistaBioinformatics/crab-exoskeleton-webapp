# STATE — crab-exoskeleton-webapp (+ crab-shell-proxy)

Persistent memory across sessions. Last updated: 2026-07-20.

## Completed this session

- **Thinking vs. answer in the transcript** — `features/thinking-vs-answer-messages`.
  The live stream separates the agent's narration from its answer
  (`pico/turn.go:172` → `x_crab_progress`); history did not, so on reload the
  narration came back as ordinary messages. Measured on the real durable
  transcripts: **200 of 304 assistant messages are narration**, and 82 entries
  carry a `reasoning_content` the proxy was discarding (52 of them have empty
  content and were dropped whole). Proxy now marks `kind:"step"` and forwards
  `reasoning`; the webapp collapses consecutive steps into one "N passos" block
  and puts reasoning behind its own disclosure.
  **Safety floor found by measuring:** demoting every tool-call frame blanks
  7 of 112 turns — a model can put its whole reply in the frame that also carried
  a call. `keepAnswerlessTurns` only demotes while the turn still has a plain
  answer.

- **METHOD — the `data/` volume is readable after all.** It is root-owned, but the
  picoclaw containers are running, so `docker exec crabshell-<agent>-<hash>` gets
  at `/data/.picoclaw/workspace/sessions` (and `durable/`, which is what
  `history.Read` prefers). Two rounds this session guessed at transcript shape
  because this was assumed impossible. Pipe to an aggregate-only script rather
  than reading conversation text.

- **CORRECTION — the empty-message filter fixed nothing observed.** Round 1
  attributed the transcript gaps to whitespace-only turns. Measured: zero
  whitespace-only entries in 1,239, zero of 416 served messages would render
  blank. The code is harmless and correct at the boundary, but the gaps are the
  narration bands, not blank content. `features/chat-empty-message-filter` is
  amended.

- **`/rename` wrote to the wrong column** — `features/rename-command-sets-alias`.
  It called `renameConversation` (`PUT /api/conversations/:id` `{title}`), which
  overwrites the title DERIVED from the first message — the sidebar's primary
  line. It now calls `setAlias`; no argument clears the alias. This also explains
  a symptom that looked like missing UI: the two-line title+alias rendering has
  been in `history-sidebar.tsx:421-431` and `conversation-tree.tsx:349-351` since
  July, but never had an alias to show, because the obvious way to name a chat
  wrote to `title`. The sidebar's pencil "Rename" was deliberately left editing
  the title (user's call), so two affordances say "rename" and write to different
  columns.

- **Blank messages opened tall gaps in the transcript** —
  `features/chat-empty-message-filter`. `history.go:341` meant to drop blank
  turns but compared `Content != ""`, so a whitespace-only turn was served;
  the client renders one PADDED band per message with only the content
  conditional, so it became 3–5rem of nothing — and it also counted as a
  neighbour, mis-sizing the padding of the real messages around it. Filtered at
  the BFF (`app/api/chat/[instance]/history/route.ts`), which is the single
  choke point for chat-view, history-cache, canvas-timeline and the content
  filter; the proxy predicate is now `strings.TrimSpace(...) != ""` (needs a
  redeploy, so the BFF filter stays). Attachment-only messages survive — the
  `[anexo: …]` ref keeps the content non-blank.

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

  Preferring the embedded record forced a second change: `RosterEntry.roles` is now
  `RoleGrant[]` carrying the `roleId`, and `parseRoleLabel` is gone. Recovering
  `(agent, level)` from the badge text and re-resolving it was safe only while the label
  came from the same `roles` array; once it can come from the guest row instead, a role
  absent from that array still renders a button that re-resolves to null and silently
  does nothing. Revoke now uses the id mycelium put on the grant.

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

## DONE (visually unverified) — consistent sidebar empty states (2026-08-07)

`features/sidebar-empty-states`. The knowledge graph's four sub-tabs each rendered
a different "nothing here" treatment; counting across both sidebars found **13
hand-rolled branches in three alignments, three type scales and two structures** —
plus one that painted a blank pane (Search before a query). All now go through
`components/ui/panel-empty.tsx`: icon + title + next-step sentence, anchored at the
top of its container.

**The one design call that did not survive being looked at:** the map pane owns its
whole height, so it shipped with an `align="fill"` variant that centred its message
vertically. Against the other three sub-tabs that read as a fourth inconsistency,
not as fitting a taller pane. User called it; the variant is gone entirely and the
component has no variants at all now. Worth remembering the shape of the mistake —
"this container is different, so its content should be too" is what produced the
divergence this feature existed to undo.

Load-bearing detail: **"empty" and "a filter hid everything" stayed separate states
everywhere** (map, files, tasks, conversations, workspaces). Collapsing them would
have been a regression dressed as a cleanup — the scheduled-tasks code already
carried a comment saying that claiming "no scheduled tasks" while a filter hides
them "would be a lie about the workspace rather than a statement about the filter".

15 new en/pt copy pairs; `parity.test.ts` is the gate that made each pt string a
real translation. `app/chat/empty-states.test.tsx` asserts every effect-free branch
emits `data-empty-state`, and *names in a comment* the branches it cannot reach
under `environment: "node"` — a test that silently skipped them would read as
coverage.

**Two bugs the copy change created, both fixed.** Naming a control in an empty
state makes that control's visibility load-bearing:

- The type-filter hint says "Choose All above". The chip row rendered only when
  `types.length > 1`, and the filter survives re-fetches — so an agent archiving or
  merging entities between visits could leave a member filtered, chipless, and
  instructed to click something not on screen. Guard widened to
  `types.length > 1 || typeFilter`.
- The new Search idle prompt co-rendered with a failed search's error Alert (a
  failure leaves `hits` null), telling the member to type a term as if nothing had
  been attempted. Now `&& !error`.

**Not verified visually.** No browser tooling was available in the implementing
session, and "these look inconsistent" is the entire premise. See T09 in
`features/sidebar-empty-states/tasks.md` for the eight states to walk and the dev
server command.

**Method note:** `yarn lint` (`next lint`) is deprecated and unconfigured here — it
opens an interactive setup prompt and gates nothing. `npx tsc --noEmit` has a
baseline of 4 errors in untouched test files. Any future gate has to be
"still 4", not "zero".

## DONE (visually unverified) — backoffice admin shell (2026-08-18)

`features/backoffice-admin-shell`. The ask was a backoffice layout — main menus on
the left, `Agents` and `Members` merged, the selected target made obvious, mobile
usable. Reading the code first found that the layout was the smaller half of it.

**Two root causes, both in `admin-screen.tsx`, both invisible by design.**

- `listScopes().then(...)` ended with `setSelected(s[0])`. The screen picked a
  tenant, told nobody, and the only evidence was a tonal highlight on a tree node
  that scrolled away. That is "admins registering people under the wrong tenant".
  Gone: `selected === null` is now a first-class state and nothing renders behind
  it — including when the caller manages exactly one scope.
- `invite-member.tsx:75` carried its OWN agent `<select>`, while the `Members` mode
  above it named no agent at all. A mycelium guest role's NAME IS THE AGENT KEY
  (`lib/invitations.ts`), so that buried control was what decided who got access to
  what. Two agent selections on one screen, and the one that mattered was the
  invisible one. That is "…and even the wrong agent". The control is deleted; the
  form takes the context's agent, and submitting now confirms tenant › subscription
  › agent › level in words.

**What merged is the selection, not the scoping rules.** `agent-first-admin` R1.3
split Members out because a roster belongs to a subscription whatever agents it
runs — still true, still enforced: the roster is not filtered by the agent, and the
context bar says so. What that spec left passive was the selection itself.

**New:** `admin-nav.ts` (pure: rail items, gate step, `?scope=` encode/resolve),
`admin-shell.tsx`, `nav-rail.tsx`, `scope-gate.tsx`, `context-bar.tsx`,
`restart-chrome.tsx`. **Gone:** the mode bar, the section tab strip, the resizable
scope rail with its `onMouseDown`-only `role="separator"` handle (a live a11y wart
retired rather than ported), and the per-section restart `Accordion`.

**The restart policy is chrome now**, added mid-flight by the user: one mount point
in the sticky context bar, on every breakpoint. A rail-on-desktop / bar-on-mobile
split was written and rejected — the rail collapses to icons that cannot state
"at 2026-07-27 18:00" at a glance, which is the one thing it has to do.
`sectionNeedsDelivery` in `tabs.ts` is the single answer to "does this section
deliver", and it gates the invalid-policy block too — otherwise a half-typed
schedule would lock Files, which never needed a policy.

**METHOD — two STATE.md facts were stale and are corrected here:**

- The `tsc --noEmit` baseline is **5 errors across 4 untouched test files**
  (`canvas-activity`, `conversation-bursts`, `history-cache`, `scheduled-tasks`),
  not 4. Any future gate is "still 5", not "zero".
- **`yarn build` works.** The recorded `EACCES` on a root-owned `.next/` did not
  reproduce: there was no `.next/` and the cwd is writable. The build was run and
  passed (48.9s), so it IS available as a gate — it is the only one that compiles
  the client tree the way Next will.

Suite: **1095 passing, 83 files** (was 1063/78). New: `admin-nav.test.ts`,
`nav-rail.test.tsx`, `members-panel.test.tsx`, plus two jsdom ones —
`invite-member.test.tsx` (the form only exists after the roles feed lands) and
`members-instances.test.tsx` (instance rows likewise). Rewritten: `tabs.test.ts`.
Extended: `agent-scope.test.ts`.

**Three defects caught in review of the built shell, all mobile/tablet, all fixed:**
the collapsed rail carried no section rows at all — and collapsed is the DEFAULT below
`lg`, with the tab strip gone, so every section was unreachable; a blanket `onClick` on
the rail's scroll container closed the drawer and pulled focus off the footer's language
control mid-use; and the sticky context bar had no height ceiling, so a half-typed
schedule force-expanded the delivery form over the whole phone viewport with no way to
collapse it. `nav-rail.test.tsx` covers the first.

**Not verified visually.** No browser tooling in this session, and this is a layout
change. The walk to do is listed at the end of
`features/backoffice-admin-shell/spec.md` — eight steps, the load-bearing ones being
the phone drawer, the sticky context bar at the bottom of a long section, and
keyboard-only travel from rail to gate to context controls.

## Empty-state UX — staff with no manageable scope (2026-08-18)

Reported as two bugs: the admin button missing from `/chat` for a staff user, and `/admin`
showing nothing but Branding. **One condition, and neither symptom was a regression** —
`admin-link.tsx` and `app/api/admin/scopes/route.ts` were untouched by the backoffice
refactor, and the branding-only fallback is `agent-first-admin` R1.5.

`GET /api/admin/scopes` returns `[]`. The proxy (`handleAdminScopes`) builds scopes from
exactly two sources, and this account satisfies neither:

1. **The staff branch reads the DISK, not mycelium.** `ListTenants()` is
   `dirNames(<data root>/tenants)`, and that directory does not exist on the mounted data
   root — it holds only `managed-skills/` and `model-registry.db`. `dirNames` returns an
   empty slice for a missing directory rather than an error, so staff contributes nothing
   even though mycelium has the "Innovation" tenant with two subscriptions.
2. **The grants are not management roles.** The `LicensedResources` branch matches
   `tenant-owner`, `tenant-manager`, `subscriptions-manager`. Both candidate accounts hold
   only `alpha` / `beta` / `hermes-glm` — guest roles NAMED AFTER AGENTS, which is by
   design (the role name is the agent key) and is not authority over a workspace.

Branding still appeared because it goes through a different gate entirely:
`isInstanceAdmin` reads `isStaff`/`isManager` off the mycelium profile via RPC.

**Two fixes, both UX (the user chose this scope; the role grant and the proxy's
disk-vs-mycelium design were declined for now):**

- **`admin-link.tsx` was a real bug, not just missing copy.** It is the ONLY entry to
  `/admin` — nothing else links there — and it probed the scopes alone. A caller with
  branding rights and no scope therefore had an admin screen with something on it for
  them and no way to reach it. It now probes both authorities, independently, each
  failing closed.
- **`/admin` names the branding-only state.** A console offering one item the caller did
  not ask for is indistinguishable from a broken one. The rule is `brandingOnly()` in
  `admin-nav.ts` with a truth table; the copy says what a management role is and that an
  agent-named guest role is not one.

**Method note:** a second agent is working in this same tree (`app/chat/chat-shell.tsx`,
`fragment.ts`, `turn-store.ts`, `lib/i18n/chat.ts`, plus new `api/chat/[instance]/running/`
and `dock-segments.test.ts`). Ruled out as a cause by `git diff` on the files involved.
Also confirmed `/home/sgeliasp/thirdparty-projects` is a bind mount of
`/mnt/external/thirdparty-projects` — same device and inode — so the image built from the
path compose uses does contain edits made through the other path.

Suite: **1185 passing, 90 files** (the jump beyond this feature's own tests includes the
other agent's). `tsc` at the 5-error baseline; `yarn build` clean. **Not verified in a
browser** — neither the notice nor the restored link has been seen rendered.

## Admin as a column browser (2026-08-18)

`features/admin-column-browser`. The user rejected the backoffice shell shipped earlier the
same day: the sidebar was confusing and so was the selected-scope display. The verdict was
right, and the reason is worth keeping — **that design MOVED the confusion rather than
removing it**:

- the hierarchy was drawn in two grammars at once (a rail nesting sections by indentation,
  a `ScopeTree` nesting subscriptions by disclosure);
- one region meant different things at different times (the rail's body was a step list,
  then a section list, with nothing outside it saying which);
- and the context bar existed *because* the navigation did not show the path — which is
  the original defect wearing a fix's clothes.

**Now: Miller columns.** Column *n* lists the children of the row selected in column
*n−1*. Root (`Branding`, `Agents`) → agents → tenants → subscriptions → sections → panel.
`Branding` is a LEAF — the user's own correction — so it opens no column and its panel
takes the whole area. The panel is pinned right; the column strip scrolls and takes the
slack while no section is chosen, with one line naming the next click.

**One bit, one meaning.** A row is a branch or a leaf, and that single flag drives both the
chevron and `aria-expanded`. A draft had subscription rows as "leaves with respect to
scope, branches in the strip" — two axes with one glyph to render them, which is the exact
fault the feature exists to remove. Caught in review before implementation.

**The signature, and the only place emphasis is spent:** a selected row in a column that is
no longer the active one is drawn quieter than the active column's. It encodes the
difference between where you are and how you got here — and not knowing what was selected
is the bug this screen has now been rebuilt twice to fix.

**Mobile is the same model, not a second layout.** One tree of columns; CSS decides. Above
`md` a scrolling strip, below it a track exactly as wide as its panes, sliding one at a
time — `app/chat/unified-sidebar.tsx`'s idiom, `armed` rule included. The pane is DERIVED
(`resolvePane`, mirroring `sidebar-panel-state.ts`) with one override for "back was
pressed", and back does not deselect: browsing is not unpicking.

**A bug caught while building:** the panel was briefly both a pane of the track and the
pinned element, which mounts it TWICE — two copies of its state and of every fetch it
makes. On a phone the panel now replaces the track instead of sliding in beside it.

**New:** `columns.ts` (the whole navigation as data, 22 truth-table tests),
`column-view.tsx`, `column-browser.tsx`, `panel-header.tsx`. **Deleted:** `nav-rail.tsx`,
`scope-gate.tsx`, `context-bar.tsx`, `scope-tree.tsx`, `agent-gate.tsx`, `admin-shell.tsx`,
`gateStep`, and four orphaned copy blocks in both locales. No trees remain in the admin
screen.

The visual system is untouched — same tokens, same type scale, `cva` throughout. The brief
pinned the direction and the brief wins; the work here was structural.

**Found, not fixed (pre-existing):** `app/admin/scope-select.tsx` was already dead code at
HEAD — nothing imported it before this work either. It is the only remaining reader of the
`admin.scope.*` copy block, which is why that block survives. Left alone as out of scope.

**VERIFIED IN A BROWSER — the first of the three admin designs that was.** Method, since
`/admin` needs a session and none of the three previous layouts was ever seen rendered: a
throwaway `app/admin-preview/` route driving the REAL model and components against fixture
data, screenshotted with headless chromium at 1440×900 and 390×844, then deleted. The
route was unauthenticated because `middleware.ts` gates only `/chat` and `/onboarding` —
`/admin`'s own gate is in its server component. Two traps: snap chromium cannot write
outside `$HOME`, and `next dev` bound :3001 because the compose container already held
:3000, so the first two screenshots were of the CONTAINER's older build.

**Three defects the gate could not see, all found in the screenshots and fixed:**

- **The signature did not exist on screen.** `bg-accent/15` for the current row against
  `bg-elevated` for the trail is, on a dark background, the same colour twice — the one
  distinction this design spends emphasis on rendered as no distinction at all. Now a
  filled `bg-accent` / `text-accent-fg`, the way Finder fills the active column's row.
- **The panel was strangled.** `md:shrink-0` on the strip guaranteed the COLUMNS their
  width and gave the panel the remainder: five columns left ~240px for a JSON editor. The
  strip shrinks and scrolls now; the panel holds `md:min-w-[26rem]`.
- **The strip clipped the root column mid-row.** At 13rem, five columns plus that minimum
  overflowed 1440px by a hair. Columns are 12rem — a measured number, not a chosen one —
  with `snap-x`/`snap-start` so a deeper path or a narrower window can never stop the
  scroll on half a column.

Also confirmed rendered: the mobile track (one pane, correct column, back control naming
its destination), the path line that only exists below `md`, chevrons on branches only,
and the legacy entry drawn subordinate.

Suite: **1218 passing, 92 files**. `tsc` at the 5-error baseline; `yarn build` clean.

**Still unverified:** everything behind a real session — the panels themselves, and the
walk against live data. The seven-step list is at the end of
`features/admin-column-browser/spec.md`.

## Admin path as a breadcrumb (2026-08-18)

`features/admin-breadcrumb-nav`, amending `admin-column-browser` the same day. The
complaint: five columns at 12rem consume ~1000px before the panel — where the work happens
— gets any, and four of those five show a question already answered.

**An answered level leaves the strip and becomes a breadcrumb segment.** Only the column
whose question is still open is drawn, so once the path is complete there is no column at
all and the panel takes the full width. Clicking a segment opens that level's siblings in a
dropdown anchored to it: changing one level costs one click and leaves the panel behind it
alone, instead of re-walking every level after it.

**The property that makes it work, and it is tested:** `buildColumns` opens column *n* only
once *n−1* is answered, so at most one column can lack a selection and it is always the
last. `splitColumns` is total over that.

**Which is why the mobile pane model could be DELETED rather than adapted.** `Pane`,
`deepestPane`, `resolvePane`, `paneIndex`, the track with its `--track-w`/`--track-x`
custom properties, the `armed` transition and the back control all existed to choose which
of several panes was on screen. With at most one column and one panel — never both, since a
path with an open column has no section selected — there is no choice left to make. One
layout serves both breakpoints now, and the breadcrumb is the way back on both.

**The signature moved rather than disappearing.** `admin-column-browser` spent its emphasis
on current-vs-trail row tones so the path stayed readable across the columns. The breadcrumb
IS the path now, so `trail` was deleted and the emphasis went to the trailing segment. The
single column widened 12rem → 14rem, since the truncation that forced 12rem was five
columns competing for width.

**A wrong assertion of mine, worth remembering:** `ALL_AGENTS` is the string `"all"`, which
is a substring of the store's own label "Shared by all agents". A test asserting the
sentinel is never rendered fails on the label. Assert the segment's text instead.

**Two corrections after the user ran it, both reported from the real screen:**

- **The dropdown did nothing.** The bar carried `overflow-x-auto`, and per the CSS overflow
  spec a non-`visible` value on one axis forces the other off `visible` too — so the bar
  clipped its own absolutely-positioned menu vertically. State changed, menu rendered,
  nothing visible. Portalled to `<body>` now, positioned from the segment's rect, with the
  outside-click check covering the portal as well as the bar (checking only the bar closes
  on mousedown over the menu's own item and swallows the choosing click).
- **The sections level went back to being a sidebar.** The breadcrumb stops at the
  subscription. Agent, tenant and subscription are decided once and worked under; the
  section is switched all day, and a list used that often does not belong behind a click.

**Method note, and the real lesson:** every breadcrumb test was a static render. Nine of
them passed against a control that was completely inert, because none ever opened it.
`breadcrumb-interaction.test.tsx` (jsdom) now exercises open / choose / dismiss. jsdom
computes no layout so it could not have caught the clipping itself — but it pins the
contract that broke, and a control whose whole purpose is a click needs a test that clicks.

**A third correction, same session:** the open chain level was a 14rem list pinned to the
left edge — the shape of chrome, and read as chrome. While the admin is still choosing an
agent, a tenant or a subscription, that list IS the screen's content, so it moved to the
middle as large options (`chooser.tsx`), with the sections level keeping the sidebar. Two
shapes, and which one is showing is the difference between being asked a question and doing
the work.

Selection now has a beat: the pressed option is marked and held ~150ms before the level
advances. `prefers-reduced-motion` skips the hold **in JS**, not only the animation in CSS —
the global guard in `globals.css` neutralizes animations but cannot touch a timer, and a
pause with nothing to show for it is just latency. Two new keyframes (`chooserRise`,
`chooserPick`) follow the file's existing `@theme` idiom.

**Three more from the running screen, one of them a real bug:**

- **Tapping a section on a phone appeared to do nothing.** Below `md` the sections sidebar
  was `w-full` and the panel `flex-1` BESIDE it — so the panel resolved to zero width. The
  sidebar is hidden below `md` now and the panel takes the screen; the breadcrumb grows a
  `md:hidden` tail segment naming the section, which is both the label and the way back to
  its list. One derivation, CSS picks the shape.
- **The breadcrumb scrolls horizontally again.** It was removed to fix the clipped dropdown
  and is safe now ONLY because the menu is portalled — nothing is positioned inside the bar
  any more. Segments are `shrink-0` so the scroller has something to scroll.
- **The panel got a measure**: `max-w-5xl`, centred, with the header sharing it so the two
  line up. Edge to edge, a form or a table reads as a wall.

**Also caught: a silent no-op edit of mine.** An earlier replacement targeting
`column-view.tsx`'s className never matched — the indentation differed — so the file kept
`snap-start` and `md:w-[12rem]` from the deleted scrolling strip while the spec and STATE
said 14rem. Found by reading the file rather than trusting the edit. String replacement
without an assertion is how that happens; the assertions elsewhere in this session are why
it only happened once.

Suite: **1275 passing, 96 files**. `tsc` at the 5-error baseline; `yarn build` clean.

## Members panel, scoped to the selected agent (2026-08-18)

`features/members-panel-scoping`. Three of four reported items were real.

- **Badges showed every agent's grants.** A guest role's name IS the agent key, so a person
  guested on alpha, beta and hermes-glm carried three badges — inside a panel that sits in
  one agent the admin chose deliberately. Filtered through `grantsForAgent`, pure and
  tested, covering both feeds (mycelium guest rows and workspace rows, which both carry
  `agentKey`). A member with no grant on the selected agent stays listed and simply carries
  no badge — they are a member of the subscription either way.
- **Two ways to remove access, able to disagree.** `InviteMember` carried an
  Invite/Uninvite switch asking the admin to retype an address, an agent and a level the
  roster row already knew, while that row carried its own revoke. The form invites only
  now; nine copy keys went with the switch, in both locales.
- **A destructive control on a collapsed row.** Revoke sat in the always-visible badge
  strip, one mis-tap from a person's access, beside a chevron whose whole job is to be
  tapped. It lives in the expanded box under an `Access` heading.
  - Consequence that had to be handled: the row used to expand only with an `accId`. With
    revoke reachable only from the box, an invited-but-never-active person would have had
    an invitation nobody could remove. Every row expands now.

**The fourth was not a defect.** `mergeRoster` has always sorted by email. Verified before
touching anything: `ana@ | Bruno@ | carla@ | Zeca@`. What DID need fixing is that the
comparison was left to the runtime — bare `localeCompare` resolves against the default
locale, which is the server's ICU on one side of this app and the browser's on the other, so
the same roster could come back in two orders. Now explicit, with `sensitivity: "base"`.

**Then: a filter, and the silent truncation it uncovered.** Asked whether the roster is
paginated and where it comes from, the answers were worth more than the filter.

Two feeds: who was INVITED is mycelium over JSON-RPC; who has USED the agent is
crab-shell-proxy, from disk. `mergeRoster` merges them.

The mycelium half **was being truncated silently.** `app/api/invitations/route.ts` unwrapped
the envelope's `records`, dropped its `count`, and passed no `pageSize` — while the sibling
roles route already guards exactly this, with a comment recording that mycelium defaults it
to TEN. And this response is one row **per grant**, not per person. Measured against the
live DB: 7 grants / 4 people on the largest subscription, so it was a handful of invitations
from hiding people on the one screen whose job is to say who has access. Now an explicit
page size, `count` compared against what came back, and a `truncated` flag the panel
surfaces.

The filter itself is client-side over the merged roster — honest only because of that fix.
It matches address and grant label, appears only past a handful of rows, and distinguishes
"nothing matches your filter" from "nobody is here".

**And then the filter did not appear at all**, because it shipped gated on `roster.length >
5` while the subscriptions it runs against hold three and four people. The general reasoning
was fine — a filter over three rows costs more attention than it saves — and completely
irrelevant: it hid the feature at the exact scale it ships to. Now offered whenever anyone
is on the roster, with a test at the real fixture size, which is what would have caught it.

**Worth carrying forward:** this is the third thing this session that was *written* but not
*reachable* — an inert dropdown behind an `overflow` clip, a mobile panel with zero width,
and now a control behind a threshold nobody crosses. Static tests passed all three. The
cheap guard is a test at the size and shape the thing actually ships to.

Suite: **1304 passing, 96 files**. `tsc` at the 5-error baseline; `yarn build` clean.

## Deferred ideas

_The two original entries here (JWT `exp` validation, clearing the stale cookie)
were implemented in quick task 002._

- **Sliding sessions / token refresh.** The session now lasts exactly as long as
  the mycelium token (`session-lifetime-until-token-expiry`) — a hard 12h ceiling
  (`jwtExpiresIn = 43200`), after which an active user is bounced to `/signin`.
  Extending it needs a mycelium refresh endpoint plus a re-auth path in the BFF;
  deliberately not built, since the ask was "until the token expires", not longer.

- **Admin screens still hand-roll their empty states.** `sidebar-empty-states`
  covered both chat sidebars and stopped at `app/admin/**`, which was out of its
  scope. `components/ui/panel-empty.tsx` is there to be reused when someone works
  in admin next.

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
