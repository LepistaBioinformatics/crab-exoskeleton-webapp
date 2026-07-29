# Persona injection — admin UI (delivery B)

Delivery A (crab-shell-proxy, `feat/persona-injection`) made the agent's identity
files read-only and gave them a cascade and an API. This is the console for it.

## The contract it consumes

Implemented in A. All four are agent-scoped; the proxy 400s an agent-less call,
and 400s any `name` outside the set.

| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/v1/admin/persona` | scope + `agent` | `{files:[{name,size,modifiedAt}]}` — injected AT THIS SCOPE |
| GET | `/v1/admin/persona/doc` | scope + `agent` + `name` | `{name,content}`, 404 when not injected here |
| POST | `/v1/admin/persona` | form: scope, `agent`, `name`, `body` | `{status,name}` |
| DELETE | `/v1/admin/persona` | scope + `agent` + `name` | `{status,name}` |

POST and DELETE honour the restart policy (`restart`, `restart_at`,
`restart_note`).

## Requirements

### R1 — A section of the agent, not of the scope

**R1.1** `persona` joins `SECTION_TABS`, labelled **Identity** / **Identidade**.
"Persona" is the code's word; an admin reads the tab.

**R1.2** It is offered ONLY for picoclaw agents, alongside `model`. Hermes
provisions from a different template (`config.yaml` + `SOUL.md`) and the proxy
delivers persona only on the picoclaw create path, so the section for a hermes
agent would be a form whose writes reach nothing.

**R1.3** It is NOT offered for the legacy all-agents entry. The cascade has no
agent-less layer and A refuses such a write outright.

### R2 — A fixed set of four rows

**R2.1** The panel renders one row per known file — `AGENT.md`, `SOUL.md`,
`HEARTBEAT.md`, `USER.md` — always all four, in that order. These are not
user-named documents; they are the files picoclaw reads from its workspace root.

**R2.2** Each row states whether this scope **sets** the file or **inherits** it,
and an inherited row is drawn quieter (dashed, no fill).

**R2.3** Each row carries its own promise, because the promises differ:

- `AGENT.md` / `SOUL.md` / `HEARTBEAT.md` — delivered read-only; a member cannot
  change it and an edit never survives a restart.
- `USER.md` — starting content only; the agent keeps writing it, and setting it
  here changes what a NEW workspace begins with, never an existing one.

This is the only place an admin will read that difference, so it is per row
rather than in the intro.

### R3 — Editing

**R3.1** Edit loads the content injected at this scope, or opens EMPTY when the
scope inherits.

It is deliberately not prefilled with the inherited text. The proxy resolves the
cascade per workspace; showing a broader layer's content as the starting point of
a narrower one would imply this screen knows what a given workspace ends up
with — it does not.

**R3.2** Saving an empty body is refused client-side (the proxy requires a
non-empty `body`).

**R3.3** Clear removes the injection at this scope and is confirmed, because the
consequence — falling back to a broader scope or the template — is not visible
from the row.

**R3.4** Writes carry the restart policy chosen in the screen's shared control,
like every other section.

## Out of scope

- Showing the RESOLVED content a given workspace ends up with. The cascade is
  resolved per workspace at container start; this screen edits one layer.
- Hermes persona (R1.2).
- Any change to delivery A.

## Test impact

`tabs.test.ts` and `agent-scope.test.ts` pin the section set and the per-harness
rules; both gain `persona`. No assertion is removed — the sets grow.

Not covered: the panel is screen behaviour (load, edit, save, clear against a
live proxy) and is not exercised by the node-environment suite.
