# native-secrets-admin-only — Specification (webapp)

Webapp half of `crab-shell-proxy/.specs/features/native-secrets-admin-only/`.
Depends on [`per-agent-injection-scope`](../per-agent-injection-scope/spec.md),
which supplies the agent-targeted scope store the admin form writes to.

## Relationship to the reverted attempt

`native-secrets-scope-gate` (this repo, marked REVERTED/SUPERSEDED) tried to gate
native writes **in the BFF only**, based on whether the caller managed the
workspace's scope. It was reverted because no admin path existed, so a normal
user lost the only way to set their model key.

This is the version that ships:

| | reverted attempt | this feature |
|---|---|---|
| where the gate lives | BFF only (proxy stayed open) | **proxy**, mirrored in the BFF |
| who may write native | scope managers, via the user drawer | admins, via the admin screen |
| admin path | none | shared-secrets at scope, per agent |
| model keys | still user-set | Model tab registry (definition + key) |
| delete of an old entry | blocked | **allowed** (see R3) |

`lib/adminScopes.ts` and `canManageWorkspaceScope` — built for the reverted
attempt — are left in place: `canManageWorkspaceScope` is still unit-tested and
harmless, and removing it is unrelated cleanup.

## Requirements

- **R1** The user drawer (`app/chat/secrets-drawer.tsx`) offers only
  `dotenv | json | file` in its format picker. `native` is gone from the form.
- **R2** `POST /api/secrets` with `format=native` returns **403** without calling
  the gateway. This mirrors the proxy's own gate; the proxy is the real boundary.
- **R3** A user's pre-gate native entries stay **listed and deletable** in the
  drawer, under a note saying picoclaw credentials now come from their
  administrator. Hiding them would leave the user unable to remove their own
  stored data — the proxy has no admin purge endpoint. `DELETE /api/secrets` is
  therefore NOT gated.
- **R4** The admin panel (`app/admin/shared-secrets-panel.tsx`) offers `native`
  and drops `file` (not env-shaped; the proxy rejects it at scope level).
- **R5** For `native` the admin form presents the **web search provider** as a
  dropdown (`WEB_PROVIDERS`) and submits `web.<provider>`. It never offers a
  free-text slot, so `channel_list.*` is unreachable from the UI.
- **R6** Model API keys are **not** offered as a native slot in the UI. The form
  points at the **Model** tab, whose registry carries the whole definition
  (provider, model, api_base, key) and applies it per user. The proxy still
  accepts a `model_list.<model>.api_keys` slot over the API for completeness.

## Files

- `lib/secrets.ts` — new `USER_SECRET_FORMATS` (the writable-by-user subset).
- `app/chat/secrets-drawer.tsx` — format picker uses it; provider dropdown and
  `web.<provider>` name-building removed; legacy-native note added to the list.
- `app/api/secrets/route.ts` — 403 on `format=native` for POST only.
- `app/admin/shared-secrets-panel.tsx` — `SCOPE_FORMATS`, provider dropdown,
  native-aware name validation and copy.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` 53 passed.
- `lib/admin.test.ts` asserts `USER_SECRET_FORMATS` excludes `native` while
  `SECRET_FORMATS` still contains it (so the list/delete path survives).
- **Not exercised by automated tests:** the BFF 403 and the admin native write
  against a live gateway. The proxy-side equivalents are unit-tested
  (`TestSecretsNativeRejected`, `TestSharedNativeSecretTargetRules`,
  `TestNativeCascadeAdminWinsOverUser`).

## Known limitation (carried from the proxy spec)

A legacy per-user `native.yml` entry that no admin overrides keeps applying and is
only removable by that user. There is no admin affordance to list or purge another
user's legacy entries; that is a deliberate follow-up, not an oversight.

## Status: implemented
