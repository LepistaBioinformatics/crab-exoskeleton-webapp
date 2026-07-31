# session-lifetime-until-token-expiry — Specification (webapp)

## Summary

The sign-in cookie is emitted as a **browser-session cookie**, so closing the
browser signs the user out even though the mycelium token it carries is still
valid for hours. Make the cookie persist for exactly as long as its own token
does — no longer, no shorter.

## Context (verified in code and config)

- `lib/session.ts:17-27` — `setSession` calls `store.set(SESSION_COOKIE, ...)`
  with `httpOnly`, `sameSite`, `secure: false`, `path`, and **no `expires` and no
  `maxAge`**. Per the cookie spec that is a session cookie: the browser discards
  it when the browsing session ends. This is the whole bug. (Browsers with
  "continue where you left off" restore session cookies, which is why the
  logout-on-close reads as intermittent rather than consistent.)
- `lib/session.ts:55-75` — `tokenExpiry(token)` already decodes the JWT's `exp`
  claim (unverified, deliberately, because the answer is only ever used to expire
  early), and `isSessionExpired` compares it to now. So the *server side* already
  knows the token's lifetime.
- `lib/session.ts:82-87` (`getSession`), `middleware.ts:18-33`, and
  `app/api/auth/verify/route.ts:61-63` all enforce that expiry. The enforcement
  landed (PR #20); making the cookie **persist** never did. Those two halves are
  what this feature reconciles.
- `deploy/standalone/config.standalone.toml:83` (parent repo) —
  `[auth.internal.define] jwtExpiresIn = 43200` (12 hours); identical in
  `deploy/prod/config.base.toml:113` and `deploy/dokploy/config.base.toml:113`.
  So today a user who closes the browser loses up to ~12 hours of valid session.
- `app/api/onboarding/route.ts:34` re-calls
  `setSession({ ...session, accountReady: true })` **with the same token**. Any
  expiry computed as a relative TTL ("now + 12h") would slide past the token's
  real `exp` on that re-set, producing a cookie that outlives the token it
  carries. This is the constraint that dictates the design below.
- `tokenExpiry` returns `null` for anything it cannot read (opaque token,
  malformed JWT, no `exp`), and the file's own comment states such a session is
  "treated as live, exactly as it was before this check existed".
- `secure: false` is deliberate and documented in place (the stack has no TLS —
  `tls = "disabled"`). Out of scope here.
- The ~15 `clearSession()` call sites (`app/api/chat/[instance]/route.ts:59`,
  `lib/adminProxy.ts:69,113`, and peers) all fire on an **upstream 401**, i.e.
  mycelium rejecting the token. They are correct and unchanged by this feature.
- No `maxAge`/`expires` appears anywhere else in `lib/`, `app/`, or
  `middleware.ts` — there is no in-repo cookie-persistence precedent to follow.

## Requirements

### Cookie lifetime (S)

- **S-01** The session cookie persists across browser restarts: `setSession`
  emits an `Expires` attribute.
- **S-02** The expiry is derived from the token's **own** `exp` claim as an
  absolute instant (`new Date(exp)`), never as a constant or relative TTL. A
  cookie must never outlive the token it carries.
- **S-03** Re-setting the session with an unchanged token (the onboarding
  `accountReady` write) leaves the cookie's expiry equal to the original token's
  `exp`. This follows from S-02 and is the property most likely to regress.
- **S-04** A token whose `exp` is unreadable (`tokenExpiry` → `null`) yields **no
  `Expires`** — today's session-cookie behaviour. No default TTL is invented,
  matching the tolerance already written into `tokenExpiry`/`isSessionExpired`.
- **S-05** Every other cookie attribute (`httpOnly`, `sameSite: "lax"`,
  `secure: false`, `path: "/"`) is unchanged, so the middleware's
  `cookies.delete({ name, path: "/" })` keeps matching.

### Testability (V)

- **V-01** The attribute computation is a pure function unit-tested in
  `lib/session.test.ts` without mocking `next/headers` — mirroring why
  `parseSession` was already split out of `getSession` for the edge runtime.

## Non-goals

- **Token refresh / rotation.** The ask is "lasts until the token expires", not
  "lasts longer". Sliding sessions would need a mycelium refresh endpoint and a
  re-auth path; recorded as a deferred idea, not built.
- **Revisiting `secure: false`.** Tied to the TLS-less stack, documented in place.
- **Auditing whether every `clearSession()` 401 handler is really an
  authentication failure** rather than an authorization one. Pre-existing, real,
  and a separate concern.

## Verification

1. `yarn test` — `lib/session.test.ts` green, including the S-02/S-03/S-04 cases.
2. Sign in, inspect the `myc_session` cookie: `Expires` present and equal to the
   token's `exp` (decode the JWT payload's `exp` × 1000).
3. Complete onboarding (re-set path), re-inspect: `Expires` unchanged.
4. Close the browser entirely, reopen, hit `/chat`: still signed in.
5. Past `exp`, `/chat` redirects to `/signin` and the cookie is dropped
   (middleware behaviour, already covered — confirm it did not regress).
