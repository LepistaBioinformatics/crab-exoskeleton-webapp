# crab-exoskeleton-webapp 🦀🖥️

The member-facing chat client of the zombie-crab stack: the screen a person opens
to talk to their own isolated agent, and the operator console used to govern the
fleet behind it.

It is a Next.js 15 application on the App Router, and it is two things at once.
The pages under `app/` render the interface; the route handlers under `app/api/`
are a backend-for-frontend that calls upstream on the browser's behalf. That split
is the point rather than a detail: the browser holds an HTTP-only session cookie
and nothing else — no token, no account id, no upstream URL — and never speaks to
the Mycelium gateway or to `crab-shell-proxy` directly. Every request travels
browser → route handler → gateway → proxy → agent container, so the verified
identity that protects the backend protects the interface without the interface
re-implementing it (`lib/mycelium.ts`, `lib/session.ts`, `middleware.ts`).

> **Its compose service is `chat-webapp`, not the repository name.** So is the
> `name` field in `package.json` and the published image in
> `docker-compose.prod.yaml`. In a compose file, in `docker compose logs`, or in a
> container listing, look for `chat-webapp`.

## Signing in

Sign-in is a magic link, and it takes two steps rather than one. You enter your
e-mail address; the gateway sends you a message containing a link; you open that
link, and it shows a six-digit code that you type back into the form. Only then
does `/api/auth/verify` exchange `{email, code}` for a session token and set the
cookie. The copy is in `lib/i18n/signin.ts`; the step machine is
`app/signin/steps.ts`, which keeps the current step in the URL
(`?step=code&email=…`) so that reloading on the code form stays on the code form.
`middleware.ts` then guards `/chat` and `/onboarding` by checking that the cookie
parses and that its token has not passed its own expiry — which is not validation,
so the real answer still comes from the first upstream call, which clears the
session on a 401.

## Running it

```bash
yarn install
yarn dev        # http://localhost:3000
yarn build      # production build
yarn start      # serve the build
```

The app is the front of the stack, not the whole stack: it expects a running
Mycelium gateway with `crab-shell-proxy` behind it. Configuration is read
server-side at request time, so one image serves every deployment.

| Variable | What it is |
|---|---|
| `MYCELIUM_INTERNAL_URL` | Base URL of the Mycelium gateway the BFF calls upstream. Defaults to `http://mycelium-gateway:8080`. |
| `DATABASE_URL` | Postgres connection string for the conversation index and app-side metadata. |
| `START_AT_SIGNIN` | Optional. `1`/`true`/`yes`/`on` → `/` redirects to `/signin` and the pre-auth landing page is never served. The app name and logos themselves are set in-app, on the admin screen's **Branding** tab. |

The production image comes from the [`Dockerfile`](./Dockerfile): three stages,
`yarn install --frozen-lockfile` and then `yarn build`, with a runtime layer that
carries only the traced standalone server and the static assets — no
`node_modules`, no yarn. Read its header comment before touching it.

## Testing

```bash
yarn test        # vitest run — 133 test files, 1754 tests
yarn test:watch  # the same runner, in watch mode
```

`./node_modules/.bin/vitest run` is the equivalent direct invocation. Tests sit
beside the code they cover as `*.test.ts` and `*.test.tsx`. `vitest.config.ts`
runs them in the `node` environment — which is why a component that needs a router
context keeps its logic in a plain module the suite can reach, as the sign-in form
does with `app/signin/steps.ts`.

**No workflow runs the tests.** The only gate on a pull request is
`.github/workflows/mycelium-transport.yml`, the transport grep described below,
and it runs only when `app/` or `lib/` changed. The other workflow,
`release-image.yml`, builds and pushes the image on a push to `main` or a version
tag, so a *build* error fails the publish while a failing test does not. Running
`yarn test` yourself is the whole of the test gate.

**`yarn lint` cannot run.** The script is `next lint`, but ESLint is not a
dependency here: it appears in neither `package.json` nor `yarn.lock`, and there
is no ESLint configuration file. The script is a leftover. TypeScript is likewise
only a type checker — `tsconfig.json` sets `noEmit` and no script invokes `tsc`,
so type errors surface through `yarn build` and in your editor.

## Calling mycelium: always JSON-RPC

**Use `myceliumRpc()` from `lib/mycelium.ts`. Never add a new REST call to the
gateway's `/_adm` surface.** The gateway exposes both and they are not
interchangeable: its `beginners` REST endpoints are external-identity-provider
only, so for a magic-link user — which is every user of this deployment — they
answer `400 "Invalid provider"`, while the RPC dispatcher resolves the internal
issuer. Parameters are camelCase; method names come from mycelium's own registry
and are never guessed, because an invented one fails at runtime and the failure
reads like a permissions problem.

The one legitimate exception is the pre-session magic-link `request`/`verify`
pair, which has no token to authenticate an RPC call with.
`.github/workflows/mycelium-transport.yml` enforces the rule with an allowlist
that also carries two entries which are *not* exceptions: `lib/mycelium.ts`,
because `POST /_adm/rpc` is the RPC transport itself, and `app/api/tenants/[id]`,
which predates the check and contradicts the rule, allowlisted so that it stays
visible rather than silently tolerated. The check matches a `/_adm` literal passed
to `fetchMycelium` on one line, so it is a ratchet against the easy way in rather
than a proof. Requests to `crab-shell-proxy` (`/{agent}/v1/…`,
`/alpha/v1/admin/…`) are that service's own HTTP API and stay REST. The full rule,
including the wire shapes that have already caused bugs, is in
[`.claude/rules/mycelium-transport.md`](./.claude/rules/mycelium-transport.md).

## How the code is laid out

```
app/chat/        the chat experience
app/admin/       the operator console
app/api/         the backend-for-frontend route handlers
app/signin/      magic-link sign-in, two steps
app/onboarding/  account creation after the first successful sign-in
components/      shared UI (components/ui/) and the pre-auth landing page
lib/             mycelium.ts (upstream transport), session.ts (the cookie),
                 db.ts, the admin/model/media/memory helpers, i18n/ (en + pt)
middleware.ts    the session guard on /chat and /onboarding
.specs/          specifications; start with .specs/project/PROJECT.md
```

Inside `app/chat/`, `chat-shell.tsx` frames the screen and `chat-view.tsx` renders
a conversation; `composer.tsx` is the input and `message-content.tsx` the markdown
rendering of a turn; `unified-sidebar.tsx` and `history-sidebar.tsx` hold
navigation and past conversations; the `graph-*` and `memory-graph-*` modules draw
the timeline and memory views; the `*-screen.tsx` files are the non-chat
destinations (files, projects, workspaces). Styling throughout is Tailwind CSS v4
with `class-variance-authority` for variants, never interpolated `className`s.

## Documentation

The book at <https://lepistabioinformatics.github.io/zombie-crab-project/> is
canonical for everything beyond this checkout — in particular
[crab-exoskeleton-webapp](https://lepistabioinformatics.github.io/zombie-crab-project/52-crab-exoskeleton-webapp.html)
for this component in the context of the stack, and
[The chat client](https://lepistabioinformatics.github.io/zombie-crab-project/20-chat-client.html)
for what a member can do here, screen by screen.

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
