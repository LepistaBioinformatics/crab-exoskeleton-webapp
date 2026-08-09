# user-owned-models — webapp scope

Webapp slice of the cross-cutting feature. The authoritative requirements live in
the parent repo at `.specs/features/user-owned-models/spec.md`.

## What this repo owns

The member-facing surface in the secrets side-curtain, the BFF routes that carry
it, and the two admin affordances (read + disable, scope lock).

## Member surface — `app/chat/secrets-drawer.tsx`

The drawer is a stack of collapsible groups (`components/ui/accordion.tsx`, moved
out of `app/admin/` to be shared): the model first, then **one group per secret
sink** — environment variables, JSON values, files, picoclaw credentials.

Every header states its own contents (`3 saved`, `nothing saved`, `gpt-5.4, from
your organisation`). That is the accordion's own rule, and it is what makes the
grouping an improvement rather than four things to open before you know where you
are.

The format `<select>` is gone with it. Choosing a storage sink before saying what
you were storing was the one decision a member had least context for; as a group,
the sink is a place you open, and its hint names the file the agent actually
reads.

Two groups carry a list and **no form**, for different reasons:

- **Files** — the sink is not delivered. When the `.secrets` mount moved from the
  member's own store to the merged effective view (`crab-shell-proxy` c52e19a),
  that view was built from the dotenv, json and native sinks only. A `file`
  secret is still stored, listed and deletable, and never reaches the container.
  A form here would store something nothing can read. **This is a proxy-side
  regression, reported and not fixed by this feature.**
- **Picoclaw credentials** — administrator-published (`native-secrets-admin-only`).
  Pre-gate entries stay listed and deletable: they are the member's own data.

A read-only group appears only when it holds something. A writable one is always
offered, because an empty group is where the first secret gets added.

The model group answers a more urgent question than "which secrets do I have":
**which model is answering me, and can I change it.**

1. **In effect** — the model in use and where it comes from: the member's own, or
   the organisation's. One line, no jargon.
2. **The switch** — the organisation's model plus each personal model, as a
   choice. Selecting is a write; the previous selection is not destroyed.
3. **The list** — each personal model with provider, `api_base` and the last test
   result; edit, re-test and delete.
4. **The form** — provider (a select over the OpenAI-compatible family only),
   model, `api_base`, `api_key`, and an optional advanced `extra_body`.

   Picking a provider fills `api_base` from the catalog the proxy serves, and
   offers that provider's known models as suggestions. `applyProvider()` is pure
   and tested: it overwrites the endpoint only when the field is empty or still
   holds the PREVIOUS provider's suggestion, so a member who typed their own
   gateway URL keeps it. Switching provider re-arms the test gate, because the
   endpoint changed.

### The test gate

`Save` is disabled until `Test` has run for the **current** draft. The gate is
derived from the draft: a pure `draftFingerprint()` compares what was tested with
what is in the form, so editing any field re-arms it. The fingerprint carries the
key's VALUE, not its length — provider keys are usually fixed-length, so a length
would treat "fix the typo in my key" as no change and keep asserting a verdict
about a request nobody made. This is a pure function with
its own unit tests — the button state must not depend on a boolean someone forgets
to reset.

A red test does not disable `Save`; it turns it into a confirmation ("save
anyway"). The result is stored with the model and shown in the list.

### What the screen must say plainly

- Saving/selecting does not restart the agent — it raises the same notice a secret
  write raises. Reuses the drawer's existing `onRestartNeeded` /
  `savedNeedsRestart` pattern; no second mechanism.
- When the scope is locked by an administrator, or a personal model was disabled
  by one, the section says so and the switch is inert. A silently ignored
  selection is the failure this feature is supposed to remove, not introduce.
- A green test is reachability, not a guarantee. The copy says the organisation's
  model stays as an automatic fallback.

## BFF

`app/api/models/mine/{route.ts, test/route.ts, selection/route.ts}` — session
cookie in, `Authorization: Bearer` out, `/{role}/v1/models/mine…` at the gateway.
Same shape as `app/api/secrets/route.ts`, including `upstreamError` so the proxy's
real 4xx reason survives instead of being masked as connectivity.

`api_key` travels only in a POST/PUT body — never a query string, never logged,
never echoed back by a response this repo builds. An edit forwards the `version`
the form was opened on, so the proxy's optimistic check is live rather than
decorative.

The proxy answers member routes with error CODES; every one of them has an entry
in `lib/i18n/errors.ts`. A missing entry renders as "Something went wrong", which
for `api_base_not_https` would leave someone with nothing to fix.

These are **crab-shell-proxy** routes, so they are REST. The monorepo's
"always JSON-RPC" rule is about mycelium and does not apply here.

## Admin surface

`app/admin/user-models-panel.tsx`, mounted by `model-registry-panel.tsx` BELOW
the resolution ladder — because it is a rung ABOVE it: a member's own model
outranks every default the ladder draws, and an administrator asking "why is my
default not reaching this person" needs both on one screen.

- A read-only list per subscription: owner, provider, `api_base`, last test, and
  a disable/enable action. No key, no edit — an administrator does not rewrite
  somebody else's model.
- The scope lock, sharing the ladder's scope selection: allow / block / inherit
  at the selected level. `inherit` is its own option, not the absence of one.

## Files

- `lib/userModels.ts` — member client + pure helpers (`draftFingerprint`,
  `saveGate`, `effectiveSource`, `slugFromLabel`). Locale-free: codes, never text.
- `lib/adminUserModels.ts` — the administrator's client and the three-state
  `policyChoice`.
- `app/chat/own-models-section.tsx` — the drawer section.
- `lib/i18n/chat.ts`, `lib/i18n/errors.ts` — copy for the section and the new
  error codes.

## Verification

`npx tsc --noEmit`, `npx vitest run`. The pure helpers are unit tested. The live
round trip (BFF → gateway → proxy → provider) is not, and needs a running stack.
