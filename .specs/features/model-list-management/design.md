# Design: Per-user model management (Q1=b, Q2=user)

## STATUS: implemented (Phases 1-4), runtime-unverified

Built across the proxy (Go) and webapp. Verified: `go build`/`go vet`/`tsc`
clean; proxy `httpapi` tests pass; a new `model_catalog_test.go` exercises the
read + upsert→seed→(refuse keyless select)→key→select→delete round-trip
(temp-dir, `PicoclawUser=""` so chown no-ops). NOT verified: the live
container-restart/reload path and file ownership on a real deployment (the
sandbox has no Docker daemon and can't chown — the docker-integration tests fail
on `chown ... operation not permitted`, pre-existing/environmental). Needs a
real deploy of BOTH proxy and webapp to confirm end to end.

Added beyond the original plan: `SelectCatalogModel` refuses a **keyless** model
(`ErrModelHasNoKey` → 400), so a user can't activate a model with no api key and
recreate the `401 "api key invalid"` failure; the UI also disables "Use" until a
key is set.

### Known limitation — `agents.defaults` is owned by two systems

`SelectCatalogModel` writes `agents.defaults.model_name` directly. The
pre-existing model-override subsystem (`reapplyModel` ← `resolveModel` ←
config.yaml `SelectableModels`) also writes that field on its own triggers
(admin model-override panel, provisioning). If an admin uses the override panel
for this user/scope, `resolveModel` will overwrite the user's UI selection with
a config.yaml model and won't recognize a UI-defined model (not in
`SelectableModels`). For Q2=user this is tolerable; documented as a known
conflict rather than reconciled.

### Note — shared-secrets admin panel

The scope-level shared-secrets panel's native "model" field was reverted to a
plain text input (its original state). Scope-level native secrets are inert
(`syncEffectiveSecrets` never cascades native), and model management is per-user
(the drawer), so the panel deliberately does NOT use the catalog dropdown.


## Confirmed scope

- **Q1 = b:** the UI can **define brand-new model entries** (name, provider,
  model, api_base) in picoclaw's `config.json` `model_list` — full CRUD, not
  just setting keys on pre-existing catalog entries.
- **Q2 = user:** everything is **per-user**. A user manages the model_list,
  api_key, and active-model selection in **their own** container config. No
  scope/instance cascade (which would need new plumbing the current native path
  doesn't have — `syncEffectiveSecrets` never shares native overlays).

## Target user flow

1. User opens a per-user "Models" area (in the chat, per (user, agent)).
2. Sees their model catalog = their `config.json` `model_list` entries.
3. **Add** a model: name, provider, `model` (litellm id), `api_base` → written
   to their `config.json` `model_list` (and a keyless `.security.yml` entry so
   the key slot validates).
4. **Set the api_key**: native secret `model_list.<name>.api_keys` (per-user,
   already works via the drawer / `applyNativeSecrets`).
5. **Select** it as active → per-user model override (already exists:
   `PUT /v1/admin/model` with `user_acc_id`, → `reapplyModel`).
6. Edit / delete entries.

## Why this is per-user and isolated

`config.json` + `.security.yml` live in `UserWorkspace(.../users/<userAccId>)`.
Editing them + restarting that user's container applies only to them. Native
keys already merge per-user. So the whole flow is naturally per-user with no
new cascade.

## Key technical facts / crux

- **No catalog read today.** `GET /v1/admin/models` returns `SelectableModels()`
  from the proxy `config.yaml` (alpha/beta have 1 model). picoclaw's real
  catalog lives in each user's `config.json` `model_list` (~30 template
  entries). Need a new per-user catalog read.
- **`validateNativeSlot` reads `.security.yml`, not `config.json`.** So a model
  present in `config.json` but not `.security.yml` can't have its key set (400).
  → **Add-model must also upsert a keyless `.security.yml` model_list entry**
  (mirror `setModelListEntry` with empty `api_keys`), so step 4 validates.
- **"Selectable in models" today = config.yaml `SelectableModels`**, keys from
  env `apiKeyEnv`. The per-user override (`resolveModel` → `FindModel` →
  SelectableModels) only accepts models in that allowlist. For a UI-defined
  model to be selectable per-user, selection must accept the user's own
  `config.json` model_list entries (not just config.yaml). → per-user select
  needs its own validation path against the user's config.json catalog, OR a
  simpler per-user "set active model_name directly in config.json defaults".
- **config.json edits:** read-modify-write preserving sibling keys (precedent:
  `reapplyModel`, `setModelListEntry`), atomic write (0600), chown, then restart
  the user's container so picoclaw reloads.

## Proxy endpoints (new, per-user; mirror the admin/model auth via user_acc_id)

- `GET  /v1/admin/model-catalog?...&user_acc_id` → `[{name, provider, model, api_base, hasKey}]` from the user's config.json model_list.
- `POST /v1/admin/model-catalog` (body: name, provider, model, api_base, user target) → upsert config.json entry + keyless .security.yml entry; restart.
- `DELETE /v1/admin/model-catalog?...&name&user_acc_id` → remove from config.json (+ .security.yml); restart.
- Key-set: reuse existing per-user native secret (`POST /v1/secrets` native model slot).
- Select: reuse/extend existing per-user model override, validated against the user's config.json catalog.

## Phased plan

- **Phase 1 (foundation, low risk):** `GET /v1/admin/model-catalog` (read user's
  config.json model_list) + BFF route + client + point the existing model
  dropdown at the real catalog. No writes yet.
- **Phase 2 (register key):** ensure add path seeds `.security.yml` so a catalog
  model's key can be set per-user; fix/relax `validateNativeSlot` accordingly.
- **Phase 3 (CRUD):** add/edit/delete model definitions in config.json via UI.
- **Phase 4 (select):** per-user active-model selection accepting UI-defined
  models; container restart wiring; UI for the whole flow.

## Open design choice (needs confirmation before Phase 3/4)

Where does the per-user "Models" UI live — inside the existing per-user secrets
drawer (a new tab/section), or a separate per-user settings panel? And should
"active model selection" reuse the admin model-override files (user level) or a
simpler direct `agents.defaults.model_name` write?
