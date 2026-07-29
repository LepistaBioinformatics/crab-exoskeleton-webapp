# Scope-bound model editing

## Problem

The resolution ladder makes every readable rung editable. With a subscription
selected in the scope tree an admin can write the `tenant` default from there,
and `agent` and `global` are writable from anywhere.

Two of those are actively misleading:

- The `agent` rung is labelled with the selected agent's name but is stored at
  `agent/<agent>` — it reaches **every tenant** running that agent. Sitting
  inside a screen whose rail says "this subscription", it reads as a setting of
  the thing on the left.
- Writing the `tenant` default while the rail is on a subscription silently
  reaches every other subscription under that tenant.

The rail states what the admin is administering. The ladder let them write
outside it.

## Solution

Only the level matching the scope-tree selection is editable.

| Rail on | Editable |
|---|---|
| tenant | `tenant` |
| subscription | `subscription`, `user` (per-person pins) |

`agent` and `global` are never editable from this screen.

Pins stay editable because they are per person **within the selected
subscription** — already inside the rail's scope. With a tenant selected they
are already out of scope (a pin needs a subscription), which is unchanged.

## Requirements

### R1 — The editable set

**R1.1** `editableLevels(scopeKind)` is a pure function and the single statement
of the rule: `subscription` → `["subscription", "user"]`, `tenant` →
`["tenant"]`.

**R1.2** `buildLadder` marks every rung outside that set `notEditable`.

**R1.3** A `notEditable` rung is not selectable, so the editor below can never
address it.

### R2 — Still visible

**R2.1** Every rung keeps being drawn, values included. The ladder exists to show
what a write overrides and what clearing it falls back to; hiding the levels an
admin cannot write would restore exactly the blindness it was built to remove.

**R2.2** `notEditable` is its OWN state, not a reuse of the two that exist:

- `outOfScope` means "belongs to a scope you have not selected" and its detail
  line prompts an action ("select a subscription"). `agent` and `global` are not
  that — no selection makes them editable here.
- `unreadable` means the caller was refused (403). An instance-admin can read
  `agent` and `global` perfectly well; dressing them as locked would tell them
  something false.

**R2.3** Where a rung is both `outOfScope` and `notEditable`, `outOfScope` wins
the presentation — it carries the more specific message.

### R3 — The writable set shrinks with it

**R3.1** `resolveDefaultScope` stops mapping `global` and `agent`. With no UI
path selecting them, those branches are unreachable.

**R3.2** `DefaultScope` KEEPS `global` and `agent`. The ladder still READS those
levels to draw them. What narrows is the writable set, not the readable one.

## Accepted consequence — instance bootstrap

This removes the only UI path to a `global` or `agent` default.

`resolveAndMaterialize` (`crab-shell-proxy internal/docker/materialize.go:191`)
fails when nothing in the cascade resolves, and picoclaw's cascade has no floor
from `config.yaml`. **An instance with no default at any level cannot provision a
workspace, and no screen will fix it.**

The first default must be set out of band, by whoever operates the deployment:

```
PUT /alpha/v1/admin/model-defaults?scope=global   (needs instance-admin)
```

This was raised before the work and accepted deliberately. It is written here
rather than left in a commit message because it surfaces at the worst possible
moment — a fresh install where nothing works and the screen offers no answer.

## Out of scope

- Any change to the proxy. It already gates `global`/`agent` at instance-admin;
  this is about what the console offers.
- The per-person pin list itself.
- Reading the levels — unchanged.

## Test impact

`model-defaults-panel.test.ts` asserts `resolveDefaultScope("global", …)` and
`("agent", …)`. Both are removed with the branches they cover — obsolete by
design, since the mapping they tested is now unreachable.

New coverage: `editableLevels` and `buildLadder`'s `notEditable` marking are pure
and tested in the node environment the suite already runs.
