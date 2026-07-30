# Quick Task 002: an expired session stops being a session

**Date:** 2026-07-30
**Status:** Done
**Follows:** quick task 001 (`../001-expired-session-routes-to-onboarding/`), whose
two deferred ideas this closes.

## Description

001 stopped an expired session from being mistaken for an account-less one, but it
left two things on the table: the token's own expiry was never read, and the dead
cookie survived the redirect. Both are now done, and they compose into one change.

## What changed

- `lib/session.ts` — three pure functions, all exported so the middleware (edge
  runtime, cannot import `next/headers`) can reuse them:
  - `parseSession(raw)` — the cookie parse, lifted out of `getSession`.
  - `tokenExpiry(token)` — the `exp` claim in ms, or **null** when nothing readable
    is there. Decodes without verifying a signature, which is only sound because
    the result can expire a session early and never grant access.
  - `isSessionExpired(session, now?)` — `exp` in the past. `null` expiry means
    live, so an opaque token behaves exactly as it did before this existed.

  `getSession()` now returns `null` for an expired token. Every caller already
  handles "no session": route handlers answer 401 `session_expired` via
  `requireSession`, pages redirect to `/signin`.
- `middleware.ts` — checks the token's expiry instead of only the cookie's
  presence, and **deletes the cookie** on the redirect. A middleware response can
  carry a `Set-Cookie`; a Server Component cannot touch cookies at all, which is
  why 001 had to leave the dead one in place. It also drops the query string, since
  `/signin` now reads `?step=`/`?email=` (quick task's sibling feature) and
  carrying `/chat`'s query over could land a visitor on the code form for an
  address they never typed.

- `app/api/auth/verify/route.ts` — refuses to store a token that **already** reads
  as expired, answering `502 {error:"token_already_expired"}` instead. Honouring
  `exp` created a new failure mode at the sign-in boundary: a token past its expiry
  by this server's clock would be accepted, written, and then rejected by the
  middleware on the very next request — signing in successfully and bouncing
  straight back to `/signin`, forever, with nothing on screen. Failing the sign-in
  turns a silent loop into a visible error.

`hasAccount`'s `"expired"` branch from 001 stays: a token can be rejected upstream
while its `exp` is still in the future (revoked, or the gateway rotated keys), and
that case never reaches the middleware check.

## Verification

- `lib/session.test.ts` — 8 new cases: the parse (valid / absent / unparseable /
  missing fields), `exp` seconds→ms, a payload with non-ASCII claims, every
  unreadable shape returning `null`, and the boundary (`exp == now` is expired).
  Suite 415 tests pass; `tsc --noEmit` clean; `yarn build` passes.
- **Behaviour checked against the served production build** (`next start`, crafted
  cookies, headers read with curl):

  | Request | Result |
  | --- | --- |
  | `/chat`, `exp` in the past | `307 → /signin` + `Set-Cookie: myc_session=; Expires=1970` |
  | `/onboarding`, `exp` in the past | same |
  | `/chat`, no cookie | `307 → /signin` (unchanged) |
  | `/chat`, `exp` in the future | `200` — not redirected |
  | `/chat`, opaque token (no readable `exp`) | `200` — unchanged behaviour |
  | `/`, `exp` in the past | `200` landing — **no longer** bounces via `/chat` |
  | `/`, live session | `307 → /chat` (unchanged) |
  | `/chat?step=code&email=fake@x.com`, expired | `location: /signin`, query dropped |

- **The sign-in boundary too**, with `MYCELIUM_INTERNAL_URL` pointed at a fake
  gateway: a verify answer carrying an `exp` in the past returns
  `502 {"error":"token_already_expired"}` and **no** `Set-Cookie`; the same answer
  with `exp` in the future still returns 200 and sets the session. That is the loop
  guard proved rather than argued.

## Assumption worth knowing

The comparison uses **this server's clock** against the token's `exp`. A host whose
clock runs ahead of the gateway's ends sessions early — an infrastructure problem,
and not one a leeway constant here would fix, so there is none. What that skew must
never do is silently lock a user out, hence the verify guard above: sign-in fails
loudly instead of looping.
