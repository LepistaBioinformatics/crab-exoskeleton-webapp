# start-at-signin-env — Specification (webapp)

## Summary

An environment switch, `START_AT_SIGNIN`, that makes the webapp open on the
sign-in screen instead of the pre-auth landing page. It exists so a deployment can
run this stack under its own name with no zombie-crab / Lepista marketing surface,
completing the in-app branding settings (app name + logos), which never covered
the landing page.

## Context (verified)

- `app/page.tsx` already branches: authed → `/chat`, otherwise render
  `components/landing/Landing`. `/` is deliberately outside the middleware
  matcher (`["/chat/:path*", "/onboarding/:path*"]`), so anonymous visitors reach
  it instead of bouncing to `/signin`.
- `Landing` is imported by `app/page.tsx` and nowhere else. `app/signin/page.tsx`
  imports only `mycelium-bg` and `landing.module.css` from that directory — the
  shared visual shell, not the marketing content.
- The landing embeds the Lepista `<lbl-brand-bar>` web component in its footer.
- Existing env vars (`MYCELIUM_INTERNAL_URL`, `DATABASE_URL`) are server-side and
  unprefixed. `app/page.tsx` is already dynamic (it reads cookies), so a
  `process.env` read there happens per request, not at build.

## Requirements

- **R1** `START_AT_SIGNIN` is truthy for `1`, `true`, `yes`, `on` (trimmed,
  case-insensitive). Unset, empty, and every other value are off.
- **R2** When on, `/` redirects to `/signin` for an anonymous visitor. The authed
  redirect to `/chat` is evaluated **first** and unchanged.
- **R3** When on, the landing page is **unreachable** — not merely non-default.
  Because `/` is its only mount point, the redirect achieves this with no route
  deletion and no middleware change.
- **R4** Server-side and read at **request** time, so a single prebuilt image can
  be flipped by an operator without a rebuild. No `NEXT_PUBLIC_` prefix — the flag
  is not needed in the browser.
- **R5** Documented where an operator will look: the three `deploy/*/.env.example`
  files, `docker-compose.yaml`, `docker-compose.dokploy.yaml`, and the webapp
  README's env table.

## Included fix (adjacent, one line)

`app/layout.tsx` hardcoded `description: "Test client for the
zombie-crab-project picoclaw stack"`, which put this project's name in the
`<meta>` of every rebranded deployment — the same leak the flag exists to close.
It is now derived from the branding app name.

## Out of scope

- Translating the chat/admin screens (the i18n foundation currently covers the
  landing only).
- Serving the landing at an alternative route when the flag is on. The user's
  decision was "unreachable", so there is no `/about` fallback.

## Acceptance criteria

- **AC-1** WHEN `START_AT_SIGNIN=1` and an anonymous visitor opens `/` THEN they
  land on the sign-in screen and no landing markup is served.
- **AC-2** WHEN the variable is unset THEN `/` renders the landing page exactly as
  before.
- **AC-3** WHEN a signed-in user opens `/` THEN they go to `/chat` regardless of
  the flag.
- **AC-4** WHEN the app name is rebranded THEN the document description follows it
  and never names this project.

## Files

- `lib/appConfig.ts` (new) — `isEnvEnabled` (pure, tested) + `startAtSignin()`.
- `lib/appConfig.test.ts` (new).
- `app/page.tsx` — the redirect.
- `app/layout.tsx` — branding-derived description.
- `docker-compose.yaml`, `docker-compose.dokploy.yaml`,
  `deploy/{standalone,prod,dokploy}/.env.example`, `README.md` (repo root
  submodule paths) — documentation.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` 55 passed (including the 2 new
  `isEnvEnabled` cases).
- **Not exercised by automated tests:** the redirect itself (a Server Component
  needing a request context). It is three lines with a unit-tested predicate;
  confirm by starting the app with and without the variable.

## Status: implemented
