# crab-exoskeleton-webapp 🦀🖥️

> **The human front door to your isolated AI agents.**
> Sign in, chat, and — if you're an operator — govern the whole fleet, all from a browser.

`crab-exoskeleton-webapp` is the interface layer of the zombie-crab stack. Where [`crab-shell-proxy`](../crab-shell-proxy) gives every user their own hardened, isolated [picoclaw](https://github.com/sipeed/picoclaw) container behind a [Mycelium](https://github.com/LepistaBioinformatics/mycelium) gateway, this app is the **exoskeleton** wrapped around it: the part people actually see and touch. It turns a stack of `curl`-only APIs into a real product — a streaming chat experience for end users and a full admin console for operators.

---

## Why this exists

The isolation, the per-user containers, the gateway-verified identity — all of that is invisible. A person doesn't want a JWT and an OpenAI-compatible endpoint; they want to **open a page, prove who they are, and talk to their agent.** And an operator doesn't want to SSH into a proxy to change a model or share a skill; they want a **screen with buttons.**

That gap — between a correct backend and something a human can use — is what this app closes. Its mission is to make the stack's guarantees *usable*:

- **Identity you don't have to think about.** You sign in with a magic link. The app's server layer (a Next.js BFF) holds the gateway session in an HTTP-only cookie and attaches it to every upstream call. The browser never declares who you are, and never sees another user's data — the same "identity is the account, not a client-declared string" principle the proxy enforces, surfaced as a one-click login.
- **A chat that feels like a chat.** Token-by-token streaming, full conversation history, search across everything you've said, and two ways to navigate your past: a classic recency list and graphics-forward timeline/tree views of how your agent's work unfolded over time.
- **Governance without a terminal.** Operators manage tenants, per-agent model registries, per-user model assignments, shared skills, shared content, and secrets — from admin screens, with the gateway still enforcing who's allowed to do what.
- **Your brand, not ours.** White-label branding (tenant logo, name) and an installable PWA (offline page, service worker) mean it can ship as *your* product, not a demo.

---

## What you can do with it

**As a user**

- 🔐 **Magic-link sign-in** — no passwords; the gateway verifies you, the app just holds the session.
- 💬 **Streaming chat** with your agent(s), with a markdown composer and slash commands.
- 🗂️ **Conversation management** — rename, tag, search, and deep-link to any past conversation (`/chat/{agent}/{sessionId}`).
- 🌳 **Tree & canvas timeline views** — see your agent's activity as a time-ordered spine or a left→right timeline, not just a flat list.
- 📎 **Media & memory** — upload files into your workspace and persist per-workspace memory.

**As an operator / admin**

- 🧩 **Per-agent model registry** — register a model (definition + key) for an agent, then assign it to individual users. Admin-driven, never self-service.
- 🛠️ **Shared skills & content** — publish skills and content that cascade to a tenant or subscription's workspaces.
- 🏢 **Tenant, subscription & member management** — including tenant brand avatars shown right in the sidebar.
- 🔑 **Secrets management** — scoped, per the proxy's cascade rules.

---

## How it fits in the stack

```
   You ── browser ──▶  crab-exoskeleton-webapp
                         │  Next.js UI  +  BFF (route handlers)
                         │  magic-link session in an HttpOnly cookie
                         ▼
                   Mycelium gateway  ── verifies the JWT, injects the profile
                         ▼
                   crab-shell-proxy  ── one isolated picoclaw container per (agent, user)
                         ▼
                     picoclaw agent
```

The webapp never talks to a picoclaw container directly. Every request goes **browser → BFF → gateway → proxy**, so the same authentication and isolation that protect the backend protect the UI for free. The BFF exists precisely so the browser holds a session cookie and nothing else — no tokens, no identity, no upstream URLs.

---

## Tech stack

- **Next.js 15** (App Router) — the UI *and* the BFF; route handlers under `app/api/**` proxy to the gateway.
- **React 19 + TypeScript** — typed end to end.
- **Tailwind CSS v4** + [`class-variance-authority`](https://cva.style) — styling via variants (no inline conditional/interpolated `className`).
- **Postgres** (`pg`) — the conversation index and app-side metadata.
- **PWA** — `manifest.webmanifest`, an offline route, and a service worker for installability.
- **Vitest** — unit tests.

---

## Getting started

```bash
yarn install
yarn dev        # http://localhost:3000
```

Configure via the environment (all read server-side at request time, so one image
serves every deployment):

| Variable | What it is |
|---|---|
| `MYCELIUM_INTERNAL_URL` | Base URL of the Mycelium gateway the BFF calls upstream |
| `DATABASE_URL` | Postgres connection string for the conversation index |
| `START_AT_SIGNIN` | Optional. `1`/`true` → `/` redirects to `/signin` and the pre-auth landing page is never served. For deployments running under their own brand; the app name and logos themselves are set in-app, on the admin screen's **Branding** tab. |

Other scripts: `yarn build` (production build), `yarn start` (serve the build), `yarn test` (Vitest). The app expects a running Mycelium gateway + `crab-shell-proxy` behind it — it is the front of the stack, not the whole stack.

A production image is provided via the [`Dockerfile`](./Dockerfile) (Next.js `standalone` output).

---

## Where to look next

- **`.specs/`** — spec-driven development docs. Start with `.specs/project/PROJECT.md` (vision), `ROADMAP.md` (milestones), and `STATE.md` (current state & decisions); per-feature specs live under `.specs/features/`.
- **`app/chat/`** — the chat experience. **`app/admin/`** — the operator console. **`app/api/`** — the BFF.
- **[`crab-shell-proxy`](../crab-shell-proxy)** — the backend this app is the face of.

---

## License

Licensed under either of

- Apache License, Version 2.0 ([`LICENSE-APACHE`](./LICENSE-APACHE) or
  <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([`LICENSE-MIT`](./LICENSE-MIT) or
  <http://opensource.org/licenses/MIT>)

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be dual licensed as above, without any additional terms or conditions.
