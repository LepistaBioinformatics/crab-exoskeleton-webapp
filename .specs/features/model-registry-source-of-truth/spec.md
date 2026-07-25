# model-registry-source-of-truth — crab-exoskeleton-webapp scope

Webapp-side slice of the cross-cutting feature. The authoritative requirements,
user decisions and architecture live in the parent repo at
`.specs/features/model-registry-source-of-truth/{spec,context,design}.md`; this
file records what changes **here**.

Completes `model-list-management`'s deferred Part 2 (full CRUD over models,
DEC-2) and replaces its template-editing premise: models now live in a
proxy-level inventory, not in a per-agent template.

## What this repo owns

The admin surface: BFF routes proxying the new endpoints, and the rewritten admin
panel.

## Changes

| Location | Change |
|---|---|
| `lib/registeredModels.ts` | replaced by `lib/models.ts` — new shapes and calls |
| `app/api/admin/registered-models/route.ts` | replaced by `app/api/admin/models/…` |
| `app/api/admin/registered-models/apply/route.ts` | replaced by `app/api/admin/model-assignments/route.ts` |
| — | new `app/api/admin/model-defaults/route.ts`, `app/api/admin/model-catalog/route.ts` |
| `app/admin/model-registry-panel.tsx` | rewritten into three regions (below) |
| `app/admin/shared-secrets-panel.tsx` | the native model-secret slot's model list now comes from the inventory, not a template |

## Panel: three regions

**Inventory** — two lists.

- *Active*: reorderable. The order is **presentation only** — it must not be
  labelled or implied to be the fallback chain, and reordering triggers no
  re-materialization and no restart.
- *Inactive*: `disabled` and `deprecated` together, each badged with its reason
  and, for deprecated, `→ replaced by X`.

Every row shows the model name, `provider · api_base`, a `key` badge when a key is
stored, its usage count, and its **declared fallback chain** — the chain is what
determines which keys land in a workspace, so it must be legible on the row, not
buried in an edit form. Delete and disable render unavailable — with the reason —
while the model is in use, and "in use" includes being named in another model's
fallback list. Deprecate prompts for the replacement, offering only `active`
models.

**Fallback chain editor** — a model's `fallbacks` is an ordered selection of other
`active` models, editable per model. The UI must state plainly that this list, not
the listing order, becomes `agents.defaults.model_fallbacks`. A model cannot be
offered itself.

**Register / edit** — a select fed by `GET /api/admin/model-catalog` prefills
`provider`, `model` and `api_base`, with a manual option for anything not in the
catalog; plus `model_name` and `api_key`. This replaces today's five free-text
inputs (`model-registry-panel.tsx:234-238`), which is what makes typo-driven
failures impossible rather than merely unlikely.

**Duplicate** opens the same form prefilled from an existing entry with
`model_name` blank (it must be unique) and `api_key` blank (keys are never
returned by the API).

**Defaults and assignment** — the scope default for the selected
tenant/subscription, plus the per-user list with an explicit override and an
"inherited from ⟨scope⟩" indicator so an admin can tell a pin from a cascade.

## Behaviour requirements

- A `409` from a stale `version` renders "another admin changed this — reload",
  distinct from the generic error path. Every mutating form carries the record's
  `version`.
- A `409` from an in-use delete/disable renders the referrer list the API returns,
  not a generic conflict message.
- No API response contains an `api_key`; the UI shows only `has_key`. The key
  input is write-only and never pre-populated, including on edit.
- Conditional styling uses `class-variance-authority` variants — no inline
  conditional or interpolated `className`, matching the codebase's convention.
- The panel governs picoclaw agents only. It must not present the inventory as
  applying to hermes agents (out of scope in the proxy this cycle).

## Verification gate

`next build` and `tsc` clean; `vitest` green. New tests: the listing splits
active from inactive and orders the active group by position; each row shows its
declared fallback chain; duplicate blanks `model_name` and `api_key`; a 409 version
conflict renders the reload banner; an in-use delete renders the referrers,
including a fallback-list referrer; delete and disable are unavailable while in
use; the fallback editor never offers the model itself or a non-`active` model.

## Status

Spec written 2026-07-25. Parent design approved. Tasks pending.
