# Feature: Picoclaw model_list — guided selection + operator management

## Summary

When configuring native **model** secrets (`model_list.<model>.api_keys`) in the
admin/secret flows, the user picks a model from the **existing** picoclaw
`model_list` instead of free-typing its name — eliminating typos that currently
fail `validateNativeSlot`. An **operator** (instance-admin) can also **add a new
model** (so it becomes selectable) and, in a follow-on phase, **edit** existing
`model_list` entries.

## Confirmed architecture (crab-shell-proxy)

- The picoclaw `model_list` lives in a **global per-agent template**:
  `TemplatesDir(root, agent.Template)` = `<dataRoot>/templates/<agent>/`
  (`config.json` model definitions + `.security.yml` api_keys). No tenant /
  subscription in that path → **shared across all tenants**. Copied into each
  user dir only on first provision; existing users are never re-seeded.
- Native model-secret validation (`secrets.go validateNativeSlot`) checks the
  model exists in **`.security.yml`**'s `model_list` at `workspaceSecurityPath`
  = the caller's provisioned `.security.yml`, else the **agent template's**.
- Shape (`.security.yml`): `model_list: { <model>: { api_keys: [...] } }`.
  `config.json` carries `agents.defaults.{provider,model_name}` and (per
  picoclaw/litellm) `model_list` model definitions — **exact entry schema
  unconfirmed** (no template committed to the repo; see OPEN-1).
- There is **no read path** for `model_list` today: `GET /v1/models` is an
  OpenAI-compat stub returning `{id:"picoclaw"}`.

## Decisions (from discussion)

- **DEC-1** — Model management is an **operator (instance-admin) surface, keyed
  per-agent** (alpha/beta), because the template is global and editing it has
  cross-tenant blast radius. It is NOT placed behind the per-scope admin gate.
- **DEC-2** — This cycle ships **Part 1 (guided selection)** only. Full CRUD
  edit of `model_list` entries is **Part 2** (follow-on, out of scope here).
- **DEC-3** — Editing/adding a model affects **future provisions only**;
  existing users keep their seeded config until re-provisioned. Accepted
  limitation; documented in the UI. No reconcile path this cycle.

## Requirements (Part 1)

- **R1** — A read endpoint exposes the agent's `model_list` model names. New
  proxy route + BFF route; the proxy reads the **agent template**.
- **R2** — In the secret-loading forms (`secrets-drawer.tsx` per-user and
  `shared-secrets-panel.tsx` per-scope), the native **model** slot replaces the
  free-text input with a **select of existing models**.
- **R3** — An **operator** (instance-admin) may **add a new model**, which
  registers it in the agent template so it becomes selectable and its
  `model_list.<model>.api_keys` slot passes validation. The add path must write
  the model to **both** the template `config.json` (definition) and
  `.security.yml` (so validation + api_keys work) — see OPEN-2.
- **R4** — Non-operators may only **select** from existing models; the "add
  new" affordance is hidden/denied for them. Enforced server-side
  (instance-admin gate on the add endpoint), mirrored in the UI.
- **R5** — The selection list is the source of truth the validator accepts, so
  a selected model never fails `validateNativeSlot` (resolves the config.json ↔
  .security.yml divergence, OPEN-2).

## Open questions (resolve in design / before coding)

- **OPEN-1** — Exact `model_list` entry schema in `config.json` (litellm:
  `model_name`, `litellm_params.{model,api_base,...}`?). Must be confirmed
  against a real deployed template `config.json` or picoclaw docs — do not
  fabricate. Blocks R3's "add model" write shape.
- **OPEN-2** — Which file backs the selection list and the add-write:
  `.security.yml` (what the validator reads) vs `config.json` (what the user
  named). Design must keep them consistent so R5 holds.
- **OPEN-3** — Agent selection for the operator surface: is the set of agents
  (alpha/beta) discoverable via an existing endpoint, or must it be added?

## Part 2 (deferred — not this cycle)

Full edit CRUD of `model_list` entries (provider/params), new mutation
endpoints with sibling-key preservation (precedent: `setNativeSlot`), atomic
write + chown, and container-restart semantics.

## Files (anticipated, Part 1)

Proxy (Go): new `GET` model_list handler + `POST` add-model handler (operator-
gated), route registration.
BFF: `app/api/models/route.ts` (GET) + add-model route (instance-admin gated,
mirroring `branding/can-edit` posture).
UI: `secrets-drawer.tsx`, `shared-secrets-panel.tsx` (model select + gated add),
`lib/secrets.ts` or `lib/admin.ts` (client helpers).
