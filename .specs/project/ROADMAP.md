# Roadmap

**Current Milestone:** M3 — Admin management (models, skills, tenants)
**Status:** In Progress

---

## M1: Signin + chat client

**Goal:** A human can sign in through the gateway and actually chat with their agents.

### Features

**Magic-link signin + agent picker** - COMPLETE

- Next.js BFF: Mycelium magic-link signin, automatic account creation, instance picker.

**Chat + streaming** - COMPLETE

- `/v1/chat/completions` pass-through with token-by-token SSE streaming through the BFF; system-theme-aware UI.

---

## M2: Chat UX

**Goal:** A rich, navigable chat surface over the agent's transcripts.

### Features

**chat-ui-redesign + history** - COMPLETE

- Persistent sidebar shell, agent-tagged unified conversation list, deep-linkable `/chat/{instance}/{sessionId}` URLs, session history via the proxy's `/v1/sessions/history`.

**Search & filters** - COMPLETE

- Conversation search bar with pills/autocomplete, advanced filters (date ranges, content-match) applied to both list and tree.

**conversation-tree-view** - COMPLETE

- Time-ordered tree of conversations; dimming driven by hover, not carried-over session.

**canvas-timeline-view** - COMPLETE — spec in `.specs/features/` (canvas timeline)

- Left→right timeline "Canvas" view mode; robust markdown composer, continuous-reading layout, batched send, slash commands. (Current branch: `feat/canvas-timeline-and-chat-ux`.)

---

## M3: Admin management (in progress)

**Goal:** Admin-gated control over which model and which skills each agent/user gets, plus tenant identity.

### Features

**model-list-management** - DONE (runtime-unverified) — spec + report in `.specs/features/model-list-management/`

- Superseded the removed per-user self-service model UI: admin registers a model (definition + key) per agent, then assigns it to individual users. Agent-aware admin routes; per-user assignment panel; members panel keyed by `(role, accId)`. Needs a proxy+gateway+webapp deploy to verify end-to-end.

**shared-skills-management** - DONE (runtime-unverified) — spec + report in `.specs/features/shared-skills-management/`

- Admin "Shared skills" tab + client API + BFF routes, backed by the proxy's per-scope shared-skills subsystem; tab re-enabled once the proxy backend landed. Needs a deploy to verify the live cascade/mount.

**tenant-avatar-sidebar** - COMPLETE — spec in `.specs/features/tenant-avatar-sidebar/`

- Tenant brand logo (mycelium `brand` tag, `meta.base64Logo`) shown as a rounded-square avatar in the sidebar, with initials fallback.

**native-secrets-scope-gate** - REVERTED/SUPERSEDED — spec in `.specs/features/native-secrets-scope-gate/`

- Scope-gating native secrets was architecturally incompatible (native secrets are per-user only and never cascade); reverted to per-user BYOK. Native format dropped from the shared-secrets admin panel.

---

## M4: Shell redesign

**Goal:** One place that says where you are, destinations drawn at full width, and
separation that comes from surface rather than from a hairline under every region.

### Features

**chat-shell-redesign** - SPECIFIED — spec in `.specs/features/chat-shell-redesign/`

- Projects leaves the sidebar and becomes a centre-pane destination named by a new `v`
  fragment key; the five workspace sections become named rows in the same sidebar and
  keep opening in the pane beside the conversation (`rs`); a single breadcrumb
  (`subscription · agent / project / chat`) replaces the chat header; the divider
  grammar goes tonal across `/chat` and `/admin`. Supersedes `unified-sidebar`'s
  two-panel track, `chats-sidebar-sections`' splitter, and `right-rail-discoverability`'s
  icon rail. Ships as three changes — navigation, then the grammar in `/chat`, then the
  grammar in `/admin` — so the 136 borders and the shell rewrite are never in one diff.
  One open question left, and it blocks nothing: how much of the destination list the
  mobile drawer keeps. The light theme's surface scale widens with it, which repaints the
  landing page too — accepted, and the reason the token change ships on its own.

  **Corrected 2026-09-12, after first use (DEC-14).** Step 1 made all six centre
  destinations. The owner reversed the five sections back into the pane so the chat can
  coexist with the files, the graph and the tasks — which also un-does the regression that
  version had accepted, that a document and the transcript could no longer be read at
  once.

---

## Future Considerations

- **Runtime verification / deploy** — bring up gateway + crab-shell-proxy + webapp together to exercise model management and shared-skills cascade end-to-end (endpoints 404 until the proxy is rebuilt and the gateway reloaded).
- Remove temporary chat debug instrumentation once the "can't reach the gateway" report is confirmed gone.
- Investigate agent tool-thrashing (missing `python3`, workspace isolation, `exec` schema mismatch) in the minimal picoclaw container.
