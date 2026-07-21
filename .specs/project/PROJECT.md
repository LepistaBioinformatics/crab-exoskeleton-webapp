# crab-exoskeleton-webapp

**Vision:** The human-facing front door to the zombie-crab stack — a Next.js chat + admin webapp that signs users in via Mycelium magic-link and drives their per-user picoclaw agents through the gateway.
**For:** End users chatting with their agents, and operators/admins who manage tenants, models, and skills.
**Solves:** Gives a human-usable UI (not `curl`) over the Mycelium → crab-shell-proxy → picoclaw chain, and adds the tenant/model/skill admin controls picoclaw itself has no concept of.

## Goals

- **Usable chat** — magic-link signin, agent picker, token-by-token streaming, session history, full-content search, and the conversation-tree / canvas-timeline views.
- **Admin management** — per-agent model registry (define model + key) with per-user assignment, shared-skills management, tenant brand avatars, and a members panel — all admin-gated.
- **Identity stays server-side** — the BFF derives identity from the gateway-verified session, never from client-declared fields.

## Tech Stack

**Core:**

- Framework: Next.js 15 (App Router; route handlers double as the BFF)
- Language: TypeScript 5.7 on React 19
- Styling: Tailwind CSS v4 + `class-variance-authority` (no inline conditional/interpolated className)
- Runtime: Node ≥ 20

**Key dependencies:**

- `pg` — Postgres client used by the BFF
- `react-markdown` + `remark-gfm` — message rendering
- `lucide-react` — icons
- `vitest` + `jsdom` — tests

## Scope

**Includes:**

- Chat UI and the Next.js BFF that proxies chat/history/media to crab-shell-proxy through the Mycelium gateway.
- Conversation views: recency list, tree view, canvas timeline; search/filter, slash commands, markdown composer.
- Admin screens: model registry + per-user model assignment, shared skills, shared secrets, tenant avatars, members.

**Explicitly out of scope:**

- The gateway and crab-shell-proxy themselves (separate repos) — this app only consumes their APIs.
- Production hardening (TLS termination, secret-rotation automation).

## Constraints

- Always runs against a Mycelium gateway; the BFF forwards the gateway session and never trusts client-declared identity.
- Admin model routes are agent-aware (routed per `picoclaw-<agent>`); gateway path allowlists must include any new admin endpoints (requires a gateway reload).
- In the dev sandbox `yarn build` hits `EACCES` on the root-owned `.next/` dir and there is no Docker daemon — rely on `npx tsc --noEmit` + `vitest` for gate checks (see STATE.md).
