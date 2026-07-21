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

## Future Considerations

- **Runtime verification / deploy** — bring up gateway + crab-shell-proxy + webapp together to exercise model management and shared-skills cascade end-to-end (endpoints 404 until the proxy is rebuilt and the gateway reloaded).
- Remove temporary chat debug instrumentation once the "can't reach the gateway" report is confirmed gone.
- Investigate agent tool-thrashing (missing `python3`, workspace isolation, `exec` schema mismatch) in the minimal picoclaw container.
