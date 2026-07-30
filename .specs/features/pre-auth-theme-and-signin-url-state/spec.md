# pre-auth-theme-and-signin-url-state — Specification (webapp)

## Summary

Three fixes to the pre-auth surface, all on `/signin`:

1. The sign-in screen follows the OS colour scheme instead of being dark-only.
2. The code-entry step becomes addressable, so a refresh no longer throws the
   user back to the e-mail step.
3. With `START_AT_SIGNIN` on, the "Back to home" link is not rendered — the
   landing it points at is unreachable by design.

## Context (verified in code)

- **Theme.** The app has **no** theme selector; light/dark comes entirely from
  `prefers-color-scheme`, flipping the `--bg/--surface/--fg/...` tokens on
  `:root` (`app/globals.css:15,52`). The user's decision was to keep that
  mechanism, not to add a switcher.
- `app/signin/page.tsx` renders inside `components/landing/mycelium-bg.tsx` and
  styles itself from `components/landing/landing.module.css`, whose header states
  it is "a committed dark theme (does not flip with prefers-color-scheme, unlike
  the app)". Its `--l-*` token block is declared once for `.root, .backdrop`.
- `MyceliumBg` (`.backdrop`) is imported by `app/signin/page.tsx` **and nowhere
  else** — verified by grep. `Landing` (`.root`) is imported only by
  `app/page.tsx`. So `.backdrop` is a sign-in-only surface and can be made
  theme-aware without touching the landing.
- **The onboarding screen already follows the OS scheme.**
  `app/onboarding/onboarding-welcome.tsx` styles itself exclusively from app
  tokens (`bg-bg`, `text-fg`, `text-fg-muted`, `Surface`, `Button`, `Alert`) and
  contains no hardcoded colour. There is nothing to change there; if it renders
  dark, that is the OS/browser scheme, which is the intended behaviour.
- `<LanguageSwitcher />` sits **inside** the sign-in card and is styled with app
  tokens (`border-brand`, `text-fg-muted`, `bg-accent`). Under a light OS scheme
  those tokens are already light — dark ink on today's dark card. Making the card
  theme-aware fixes that mismatch as a side effect.
- **URL state.** `app/signin/page.tsx` is a single `"use client"` route holding
  `step` in `useState`, so a reload resets it to `"email"`. `/api/auth/verify`
  needs `{ email, code }`, so the e-mail must survive the reload too.
- `app/admin/admin-screen.tsx:135-152` is the in-repo precedent for URL-held view
  state: the URL is the single source of truth, deliberately *not* mirrored into
  state; transitions use `router.replace(..., { scroll: false })` so Back leaves
  the screen instead of walking every intermediate state; and `app/admin/page.tsx`
  wraps the client screen in `<Suspense>` because `useSearchParams` otherwise
  fails a prerender with a CSR-bailout error.
- **START_AT_SIGNIN.** `startAtSignin()` (`lib/appConfig.ts`) is server-only, read
  per request. `start-at-signin-env/spec.md` R3 states the landing is
  *unreachable* when the flag is on — `/` redirects to `/signin` — so the
  "Back to home" link is a control that returns the user to where they already
  are. The sign-in route is currently a client component, so the flag has to be
  read by a server parent and passed down.

## Requirements

### Theme (T)

- **T-01** The sign-in screen follows `prefers-color-scheme`: a light variant of
  the mycelium backdrop and the auth card, the existing dark treatment unchanged.
- **T-02** The landing page (`/`) stays committed dark in both schemes. The light
  override is scoped to `.backdrop`, never `.root`, and no landing-only class
  changes appearance.
- **T-03** No new theme selector, no cookie, no provider. `prefers-color-scheme`
  stays the only input, matching the rest of the app.
- **T-04** Light values reuse the app's own light palette (`app/globals.css`
  `:root`) wherever a counterpart exists: teal ink `#0a2933` for text, `#5a6b72`
  for muted, the cyan accent `#64c5eb` for interactive fills, the structural
  violet `#663a88` for borders and the hard offset shadow. The one value with no
  UI counterpart is the *text* cyan (dark labels, link hovers): the accent itself
  is unreadable on white, so it is a darkened cyan chosen for contrast, not an
  existing token being reused.
- **T-05** Every colour a sign-in element paints resolves from a `--l-*` custom
  property, so a scheme override is a token block and not a rule rewrite.
  Hardcoded literals inside the auth rules (card gradient/shadow, input and code
  slot fills, alert colours, the field's violet bloom) are tokenized first.
- **T-06** The onboarding screen is unchanged — it already satisfies the intent.

### Sign-in URL state (U)

- **U-01** The code step is addressable as `/signin?step=code&email=<address>`.
  Opening that URL directly, or reloading on it, shows the code form with the
  e-mail already resolved — no new code is requested.
- **U-02** The URL is the single source of truth for which step renders,
  following the admin-screen convention. The e-mail *input* keeps local state
  while the user types; the code step reads the address from the URL.
- **U-03** `?step=code` with no (or an empty) `email` renders the e-mail step. A
  hand-edited URL must not reach a form that cannot submit.
- **U-04** Advancing to the code step and the "← Back" control both use
  `router.replace`, so browser Back leaves `/signin` rather than walking the
  steps — the same reasoning already recorded in `admin-screen.tsx`.
- **U-05** Both transitions rebuild the query from the current params —
  setting `step`/`email` going forward, deleting them going back — so any other
  key on the URL survives. `replace("/signin")` would drop them.

### START_AT_SIGNIN (S)

- **S-01** When `START_AT_SIGNIN` is truthy the "Back to home" link is not
  rendered at all (not merely hidden with CSS).
- **S-02** With the link absent, the language switcher stays right-aligned in the
  card header — it must not slide to the left edge.
- **S-03** The flag is read server-side per request and passed to the client
  form as a prop; no `NEXT_PUBLIC_` exposure, matching R4 of
  `start-at-signin-env`.

## Out of scope

- A user-facing theme selector (light/dark/system) and its persistence. The user
  chose OS-follow; a switcher was offered and declined.
- A light variant for the landing page or its diagrams.
- Any change to the onboarding screen (T-06).
- Persisting the code itself, or auto-submitting on restore.

## Acceptance criteria

- **AC-1** WHEN the OS scheme is light THEN `/signin` renders on a light field
  with legible ink, and the in-card language switcher reads correctly; WHEN it is
  dark THEN the screen is visually unchanged from today.
- **AC-2** WHEN the OS scheme is light THEN `/` (landing) is byte-for-byte the
  same dark presentation as before.
- **AC-3** WHEN the user submits their e-mail THEN the URL becomes
  `/signin?step=code&email=<addr>`, and reloading keeps the code form with that
  address.
- **AC-4** WHEN `/signin?step=code` is opened without an `email` THEN the e-mail
  step renders.
- **AC-5** WHEN `START_AT_SIGNIN=1` THEN no "Back to home" link is in the
  rendered markup and the switcher is still right-aligned; WHEN unset THEN the
  link renders as before.

## Verification — results

Implemented as `app/signin/steps.ts` (pure), `app/signin/signin-form.tsx`
(client), `app/signin/page.tsx` (server), and the `.backdrop` light block in
`components/landing/landing.module.css`.

- **Unit** — `app/signin/steps.test.ts`, 10 cases over `resolveLocation`
  (U-01/U-03: unknown step, missing/blank address, trimming, address kept for the
  input seed) and `signInUrl` (U-04/U-05: both directions, unrelated key
  preserved, stale address overwritten). Full suite 35 files / 407 tests pass;
  `tsc --noEmit` clean.
- **`yarn build` passes** — the real gate for the server/client split and the
  `useSearchParams` Suspense boundary; `/signin` builds as a dynamic route.
- **Served the production build and read the HTML** (`next start`, two runs):
  - `START_AT_SIGNIN=1` → no back link in the markup at all (**S-01**, AC-5).
  - flag unset → "Back to home" present, switcher carries `ml-auto` (**S-02**).
  - `/signin?step=code&email=ana%40x.com` → the code form is server-rendered with
    that address (**U-01**, AC-3's restore half).
  - `/signin?step=code` (no address) → the e-mail form (**U-03**, AC-4).
- **Compiled CSS inspected** — the light block emits as
  `@media (prefers-color-scheme:light){.landing_backdrop__*{--l-*: …}}`; no
  `.root` (landing) selector appears in it, which is the mechanism behind AC-2.
- **Light palette contrast computed** (WCAG, against the card's own translucent
  surface over the field): body ink 14.7:1, muted 5.3:1, label cyan 5.6:1 (5.8:1
  on the input fill), alert text 7.7:1, button ink on the cyan fill 8.4:1. All
  clear AA for small text; the dark theme's label reference is 10.6:1.
- **Non-text contrast measured too, and it changed two decisions.** The first draft
  had light `--l-line-strong` at 0.32 alpha → 1.79:1 on an input boundary, weaker
  than the dark theme's shipped 2.09:1; raised to 0.40, which lands at 2.07:1 —
  deliberate parity rather than an arbitrary bump. And the accent as a 1px focus
  border on white measures 1.96:1, failing WCAG 2.4.11's 3:1, so the focused
  border split off into `--l-focus` (`var(--l-cyan)` in dark → unchanged there;
  `#0d6e8c`, 5.8:1, in light). Neither scheme reaches 3:1 for *resting* input
  boundaries — a pre-existing gap in the dark design, left symmetric rather than
  closed on one side only.
- **`.backLink` and `.authTop` are used by the sign-in form and nothing else**
  (grepped across `app/` and `components/`), so the margin move below cannot
  reach the landing — the other half of AC-2, which the compiled-CSS check alone
  would not have covered.

### Not verified

- **The light rendering has not been looked at.** There is no headless browser in
  this environment and `prefers-color-scheme` cannot be forced over HTTP, so
  AC-1/AC-2 are argued from the token graph and the numbers above, not seen. Worth
  an eyeball in both schemes: the field's bloom over `#eef4f7`, the card's edge
  against it, the cyan button's violet hard shadow, and the input / code-slot
  borders both at rest and focused — the elements the numbers say are weakest.
- AC-3's forward half (submitting the e-mail actually rewrites the URL) needs a
  reachable gateway — `/api/auth/request` must answer 2xx before the transition
  fires.

### Deliberate deviation

The card header's `1.2rem` bottom margin moved from `.backLink` to a new
`.authTop` row. Hung off the link, the spacing vanished with it under
START_AT_SIGNIN (S-01), and the link's own margin had been nudging it ~0.6rem
above the switcher's centre. Dark mode therefore changes by that much — a
correction, but not "visually unchanged" as first stated.
