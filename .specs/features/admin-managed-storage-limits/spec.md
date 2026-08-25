# admin-managed-storage-limits — Spec (webapp)

**Status:** Planned
**Size:** Large (new admin surface + a member-facing readout + error copy)
**Proxy spec:** `crab-shell-proxy/.specs/features/admin-managed-storage-limits/spec.md`
— read it first; it owns the rules, this owns how they are seen and set.

---

## Problem

Two things are invisible in this app: how much room a member has, and who
decides. There is no place to set a limit and no place to see one. When an upload
is refused, the member reads *"Algo deu errado."* — the proxy answers with a
prose sentence, `errorCode` passes unknown strings straight through, and
`errorText` falls back to `unknown` for anything not in the dictionary.

## Goal

An administrator sets the per-upload cap and the workspace quota for a scope they
manage, sees what a scope inherits and from where, and a member sees how much
room they have before they hit the wall — and, when they do hit it, reads which
number they hit.

## Non-goals

- **Not** a usage dashboard across members. One workspace's number, in that
  workspace's own files panel; one scope's policy, in that scope's admin section.
- **Not** a client-side enforcement. The webapp may refuse early for a faster
  message, but the proxy is the boundary (proxy FR-4.3).

---

## Requirements

### Admin surface

- **FR-1** The limits live in the **files section** of a selected scope
  (`tabs.ts` → `"files"`), as a card above the shared-files list — the section is
  already "what this scope's members can have on disk", and its writes already
  need no container restart (`tabs.ts` names `files` as one of the two sections
  that do not).
- **FR-2** Two fields: **largest single upload** and **workspace quota**. Each
  shows three states, and they are visually distinct:
  *inherited* (naming the level it came from), *set here*, *unlimited*.
- **FR-3** Clearing a field returns it to **inherited**, and the control says so
  — a cleared field must never read as "set to zero", which is a real and
  different value (proxy FR-2.5).
- **FR-4** A per-upload cap above the instance ceiling is accepted by the API but
  the card shows the **effective** number with a note naming the ceiling.
  Otherwise an administrator sets 500 MB, sees 500 MB, and their members are
  still refused at 10 MB.
- **FR-5** Values are entered and displayed in **MB**, converted to bytes at the
  boundary. Nobody types 52428800.
- **FR-6** `formatBytes` (`app/admin/format.ts`) is reused for every displayed
  size. A second byte formatter is how two screens start disagreeing about what
  a megabyte is.

### Member-facing readout

- **FR-7** The files panel shows **used / allowed** for the workspace, from the
  `usage` object the listing now carries (proxy FR-5.1) — no extra request.
- **FR-8** With no quota set, the readout shows the used total **without** a
  denominator and without a bar. Inventing "unlimited" as a full-looking gauge
  would be worse than saying nothing.
- **FR-9** The readout is not an alarm. No colour change, no warning banner at
  90% — the refusal is where the message belongs, and a panel that nags about
  storage every time it opens is a panel people stop reading.

### Failure copy

- **FR-10** The media BFF maps the proxy's structured 413 to the codes
  `media_too_large` and `media_quota_exceeded`, **carrying the numbers**
  (`limit`, `size`) through to the client. This extends the mapping
  `unrestricted-upload-types` FR-8 introduces rather than adding a second one.
- **FR-11** Both codes get copy in `en` and `pt` that **interpolates the number**:
  "That file is 78 MB — this workspace accepts up to 50 MB." A rule stated
  without its number leaves the member guessing how much to compress.
- **FR-12** `errorText` takes only a code today. Interpolation needs the values,
  so the media surfaces format the message where the values are known rather
  than teaching the shared dictionary about parameters — the same pattern
  `deleteFolderMessage` already uses with `{name}`/`{count}`.
- **FR-13** Every new leaf differs between `en` and `pt` (`parity.test.ts`).

---

## Decisions

- **DEC-1 — the files section, not a new tab.** A "Storage" tab would be a
  top-level concept for two numbers. The section it belongs to already exists and
  is already about the same disk.
- **DEC-2 — MB, not MiB, in the interface.** `formatBytes` already divides by
  1024 and labels the result "MB", so the app has an existing answer, right or
  not. One vocabulary that is slightly loose beats two that are each precise and
  disagree.
- **DEC-3 — no client-side pre-check in this feature.** It would need the policy
  in the chat surface, where it is not fetched today, to save one round trip on
  a path that is already a network upload. The proxy's refusal, well translated,
  is the whole requirement.

---

## Acceptance

1. Set a 50 MB cap on a subscription → a member of it is refused a 60 MB file
   with a message naming both numbers.
2. Set a quota at the tenant → a subscription that sets none shows
   "inherited from tenant" with the tenant's value.
3. Clear the subscription's cap → the card returns to inherited, and uploads that
   the tenant's value allows succeed.
4. Set a cap above the instance ceiling → the card shows the effective (lower)
   number and names the ceiling.
5. A member's files panel shows "12 MB of 500 MB"; with no quota, "12 MB".
6. A quota refusal reads as a quota refusal, in the member's language.
