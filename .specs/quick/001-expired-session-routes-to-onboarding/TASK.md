# Quick Task 001: expired session routes to onboarding instead of sign-in

**Date:** 2026-07-30
**Status:** Done (code + tests; runtime-unverified)

## Description

When a user's mycelium session expires, `/chat` sent them to `/onboarding` (as if
they had no profile/account) instead of back to `/signin`.

## Root cause

`myceliumRpc` resolves non-2xx responses into `{ ok: false, status }` instead of
throwing (`lib/mycelium.ts:87`). `hasAccount` collapsed every non-ok result to
`"no"` (`lib/onboarding.ts:16`), so a 401 from an expired bearer token was
indistinguishable from "authenticated but account-less". `app/chat/page.tsx`
reads `"no"` as account-less → `redirect("/onboarding")`.

Landing directly on `/onboarding` was broken the same way: its guard only tested
`=== "yes"`, so an expired user saw the welcome screen and "Vamos começar" then
401'd against `beginners.accounts.create`.

`accountReady` short-circuits the probe in `/chat`, so in principle only sessions
without it are affected — but nothing sets that flag except `POST /api/onboarding`
(a Server Component can't write the cookie, despite what `lib/session.ts:8`'s
comment implies), so in practice this is every session that didn't create its
account in the current cookie's lifetime, not a narrow subset.

## Files Changed

- `lib/onboarding.ts` — `hasAccount` returns the widened `AccountStatus`
  (`"yes" | "no" | "expired" | "unreachable"`); an HTTP 401 from
  `beginners.accounts.get` yields `"expired"`. `beginners.profile.get`'s result
  stays deliberately unread, 401 included: an account-less user has no profile
  either, and if mycelium answers that with a 401 then reading it would route
  every new signup to sign-in. An expired token fails both calls, so accounts.get
  alone catches expiry.
- `app/chat/page.tsx` — `"expired"` → `redirect("/signin")`, before the
  `"no"` → onboarding branch.
- `app/onboarding/page.tsx` — guard hoisted out of the inline boolean so it can
  branch: `accountReady` → `/chat`, then `"yes"` → `/chat`,
  `"expired"` → `/signin`, else render the welcome.
- `lib/onboarding.test.ts` (new) — stubs `fetch` (the classification of the RPC
  response *is* the fix) and covers yes / no / 401 → expired / a profile-only 401
  staying `"no"` (the new-signup regression guard) / non-auth accounts failure /
  unreachable.

## Verification

- [x] `yarn test` → 34 files, 397 tests pass (was 391 before).
- [x] `npx tsc --noEmit` clean — the widened union forced every call site to be
      revisited.
- [x] Bug-first check: with `lib/onboarding.ts` stashed, the `"expired"` test
      fails and the other five pass — the test targets the defect, not the new
      code's shape.
- [n/a] `yarn lint` — `next lint` has no ESLint config in this repo; it prompts
      to create one. Not an existing gate.
- [ ] Runtime: sign in, invalidate/expire the token server-side, hit `/chat` →
      expect `/signin`, not `/onboarding`. Not run — no stack up locally.
- [ ] Runtime: same expired session hitting `/onboarding` **directly** → expect
      `/signin`. This is the restructured guard and the user's literal report.
- [ ] Runtime regression: a brand-new user (no account) still reaches
      `/onboarding` and "Vamos começar" still creates the account.

## Notes / assumptions

- **401-only classification, unverified at runtime.** It mirrors what the rest of
  the app assumes for a rejected bearer token (`/api/chat/*`, `/api/media`,
  `/api/secrets` all treat 401 as `session_expired`), but the mycelium submodule
  isn't checked out here, so the gateway's `/_adm/rpc` behaviour for an expired
  token couldn't be read or exercised. If it reports expiry as a JSON-RPC error
  envelope instead, `myceliumRpc` maps that to `status: 400`
  (`lib/mycelium.ts:93`) and the bug would persist — recheck there first.
- **The stale cookie is not cleared.** A Server Component can't mutate cookies,
  so the redirect leaves the expired `myc_session` in place. No redirect loop
  (`/signin` has no session guard), but `/` → `/chat` → `/signin` bounces on
  every visit until the user signs in again. See STATE.md deferred ideas.

## Commit

Uncommitted — not requested.
