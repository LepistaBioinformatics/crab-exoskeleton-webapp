# Design — i18n across all screens

## Principle

Extend `lib/i18n/` exactly as it is. No new dependency, no routing change, no
rewrite of the landing. The only genuinely new primitive is a context that
carries the already-resolved locale into client trees, because the landing could
hold it in local `useState` (it owns its whole tree) and the rest of the app
cannot.

## Architecture

```
app/layout.tsx  (server, becomes async)
  ├─ getLocale()  ──────────────► <html lang="pt-BR" | "en">
  └─ <LocaleProvider initialLocale={locale}>       ← client boundary
         app/signin, app/onboarding, app/chat, app/admin, app/offline
             └─ useT(<namespace>Copy) ──► the dictionary for the active locale
```

### `lib/i18n/context.tsx` (new, `"use client"`)

```tsx
const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>(...)

export function LocaleProvider({ initialLocale, children }) {
  const [locale, set] = useState(initialLocale)
  const router = useRouter()
  const setLocale = (next: Locale) => {
    set(next)
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()          // re-renders <html lang> + generateMetadata
  }
  return <Ctx.Provider value={{ locale, setLocale }}>{children}</Ctx.Provider>
}

export const useLocale = () => useContext(Ctx)

// The single accessor every screen uses. Mirrors the landing's
// `const t = landingCopy[locale]`, just without the prop.
export function useT<T>(copy: Record<Locale, T>): T {
  return copy[useLocale().locale]
}
```

`setLocale` updates state *and* calls `router.refresh()`. State gives instant
client feedback; the refresh is what re-renders the server-side `<html lang>`
and `generateMetadata()`. Both are needed — neither alone is correct.

**Why the cookie string is duplicated from `Landing.tsx` rather than shared:**
it is written in exactly two places and the landing's copy also has to satisfy
the brand-bar event listener. A shared helper would be one indirection for two
call sites. If a third appears, extract then.

### Dictionaries

One file per namespace, each using the idiom already in `landing.ts`:

```ts
const en = { ... } as const-ish object literal
export type ChatDict = typeof en
const pt: ChatDict = { ... }
export const chatCopy: Record<Locale, ChatDict> = { en, pt }
```

| File | Covers |
|---|---|
| `lib/i18n/common.ts` | `components/ui/*`, confirm-dialog actions, generic verbs (Save, Cancel, Delete, Close, Loading…) |
| `lib/i18n/errors.ts` | the API error codes (FR-4) |
| `lib/i18n/signin.ts` | `app/signin/page.tsx` |
| `lib/i18n/onboarding.ts` | `app/onboarding/onboarding-welcome.tsx` |
| `lib/i18n/offline.ts` | `app/offline/page.tsx` |
| `lib/i18n/chat.ts` | all of `app/chat/*`, sub-keyed by component |
| `lib/i18n/admin.ts` | all of `app/admin/*`, sub-keyed by panel |
| `lib/i18n/landing.ts` | unchanged, plus the diagram strings of FR-9 |

`chat.ts` and `admin.ts` are large (~250 leaf keys each). They stay single files,
sub-keyed by component (`t.composer.placeholder`, `t.sharedSecrets.title`), which
is how `landing.ts` is already organised (`t.hero.title`, `t.memory.body`).

**Why per-namespace import instead of one merged dictionary in context:** each
route only imports the namespaces it renders, so `/chat` never ships the admin
copy. It is also the identical call shape the landing already uses
(`landingCopy[locale]`), so there is one pattern in the codebase, not two.

### Errors (FR-4)

```ts
// lib/i18n/errors.ts
const en = {
  invalid_request: "Something in that request wasn't right.",
  session_expired: "Your session expired. Sign in again.",
  connectivity:    "Can't reach the gateway right now.",
  ...
  unknown:         "Something went wrong.",
}
export function errorText(locale: Locale, code: unknown): string {
  const d = errorCopy[locale]
  return (typeof code === "string" && code in d ? d[code as keyof ErrorDict] : d.unknown)
}
```

Replaces `chat-view.tsx:917` `errorMessage(raw)` and
`branding-panel.tsx:268` `errorMessage(res)`. Route handlers are untouched —
they already emit codes.

### Dates and counts (FR-7)

```ts
// lib/i18n/format.ts
export const BCP47: Record<Locale, string> = { en: "en-US", pt: "pt-BR" }
```

`app/admin/format.ts` and `app/chat/conversation-tree.tsx` take the tag as an
argument instead of relying on the browser default.

Plurals: three sites, handled inline against `{ one, other }` key pairs. No
plural engine, no helper — three explicit ternaries.

### `/offline` (R-3)

Converted to a client component reading `useT(offlineCopy)`. The SW serves a
precached shell; server-rendering its text would freeze the locale at precache
time, whereas the provider re-resolves on hydration.

## Migration recipe (applied per file)

1. Add the keys to the namespace's `en` object, sub-keyed by component.
2. `tsc` now fails on `pt` — add the pt-BR translations until it passes. This is
   the completeness proof; never add both sides at once.
3. In the component: `const t = useT(chatCopy)`, replace literals with `t.*`.
4. `npx tsc --noEmit && npx vitest run`.

## Consequence: `/signin` and `/offline` become dynamic

Reading the cookie in the **root** layout opts every route into dynamic
rendering. Measured against the base commit `f3f7438`:

| Route | Before | After |
|---|---|---|
| `/`, `/chat`, `/admin`, `/onboarding` | ƒ dynamic | ƒ dynamic (unchanged — they already call `getSession()`) |
| `/signin` | ○ static | **ƒ dynamic** |
| `/offline` | ○ static | **ƒ dynamic** |
| `/_not-found` | ○ static | **ƒ dynamic** |

Accepted deliberately. The reasoning:

- The app ships as a standalone Next server behind the gateway
  (`output: "standalone"`); nothing serves these routes from a CDN, so losing
  the prerender costs a cheap server render, not a deployment capability.
- `/offline` still works. The service worker precaches it with
  `cache.addAll(PRECACHE_URLS)` — a runtime fetch performed at install time,
  while the network is up — so it caches a real response either way. The
  provider's on-mount cookie re-read then corrects the language if the user
  switches after that fetch.
- The one build-time worry the code already recorded — "the DB is unreachable
  during build-time prerender … so static pages like /signin export" — is
  *removed* by dynamic rendering, not aggravated by it. A route that is never
  prerendered cannot fail to prerender.

The alternative — keeping the layout static and resolving the locale purely
client-side — was rejected: it trades two prerendered auth pages for a
first-paint flash of English on `/chat` and `/admin`, which is where users
actually spend their time.

## Verification

| Gate | Command |
|---|---|
| Dictionary parity (en ↔ pt) | `npx tsc --noEmit` |
| No behavioural regression | `npx vitest run` (baseline 119 passing) |
| No leftover hardcoded text | grep sweep over touched files |
| Build integrity | `npx next build` once at the end |

## Rejected alternatives

| Option | Why not |
|---|---|
| `next-intl` / `react-i18next` | New dependency; the repo already has a working mechanism, and ICU/plural machinery is overkill for three plural sites. |
| `[locale]` route segments | `config.ts` explicitly rejected it ("would ripple through every existing screen"). |
| Merged dictionary held in context | Ships admin copy to chat users and introduces a second call shape alongside `landingCopy[locale]`. |
| JSON translation files | Loses the `typeof en` compile-time parity check, which is the whole safety net here. |
