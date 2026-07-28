# admin-instance-config-editor — Tasks (webapp)

From [design.md](design.md). `[P]` = parallelizable with its siblings.

Gate check for every task: `yarn tsc --noEmit && yarn vitest run`.
The proxy slice (its own `tasks.md`) must be at least through T-04 before W-06's
component tests can be written against a real response shape — everything before
that is independent of it.

---

## Phase 1 — Transport

### W-01 — BFF route
- **What:** `GET`/`PUT` at `app/api/admin/users/config/route.ts`, mirroring
  `users/files/route.ts`'s structure. Opens with the FR-7 distinction comment
  from design — the sibling file's "Do not add one" instruction stays literally
  true of *that* file. `agent` required. `PUT` forwards the body verbatim and the
  policy via `restartParams` + `withRestart`.
- **Where:** new `app/api/admin/users/config/route.ts`
- **Depends on:** —
- **Reuses:** `requireSession`, `proxyAdminJson`, `restartParams`, `withRestart`.
- **Done when:** a missing `agent`/id is a local `400 invalid_request` with no
  upstream call, and the comment is present.
- **Verifies:** FR-1.1..FR-1.6

### W-02 — Client calls [P with W-03]
- **What:** `InstanceConfig`, `InstanceConfigWrite`, `readInstanceConfig`,
  `writeInstanceConfig` in `lib/admin.ts`, in the module's existing style
  (`fetch` → `errorCode(res)` on failure → typed body).
- **Where:** `lib/admin.ts`
- **Depends on:** W-01
- **Reuses:** `errorCode`, `policyParams`/`withPolicy` from `lib/restartPolicy`.
- **Done when:** `stale_revision`, `not_provisioned`, `invalid_json` and
  `too_large` arrive as the thrown message.

## Phase 2 — Pure logic

### W-03 — `json-tree.ts` [P with W-02]
- **What:** the whole pure module from design: `parseDocument` (with
  line/column derivation), `serialize`, `setAtPath`, `removeAtPath`, `addKey`,
  `appendItem`, `dotted`, `isManaged`, `typeOf`, `coerce`. No React import
  (NFR-3). Paths are **segment lists**, not dotted strings — a key may contain a
  dot.
- **Where:** new `app/admin/json-tree.ts`, `app/admin/json-tree.test.ts`
- **Depends on:** —
- **Done when:** the table in design §"Test plan" passes, including
  `isManaged` rejecting the prefix-lookalike `model_lists` and the
  no-mutation assertions.
- **Verifies:** FR-4.2, FR-4.3, FR-5.1, FR-5.3, FR-5.4, FR-5.5, FR-5.6, FR-5.7,
  FR-6.1, NFR-3

## Phase 3 — UI

### W-04 — `RestartPolicySelect` `modes` prop
- **What:** the optional `modes` narrowing from design, defaulting to
  `RESTART_MODES`, with the docblock saying why this endpoint passes
  `["now","notice"]`.
- **Where:** `app/admin/restart-policy-select.tsx`
- **Depends on:** —
- **Done when:** existing call sites compile unchanged and the existing
  `restart-policy-select.test.tsx` stays green.
- **Verifies:** FR-7.2

### W-05 — `json-tree.tsx` renderer
- **What:** the recursive row component: disclosure, key/index label, type badge,
  leaf controls (`Input`, boolean toggle, `null` marker, type `<select>`),
  add-key / remove-key / append-item / remove-item, `data-path` on every row.
  Default-collapsed below depth 2; expansion state keyed by dotted path and
  preserved across edits. Managed and redacted rows are read-only with a `Lock`
  marker. Styling via `cva` variants — no inline conditional or interpolated
  `className`.
- **Where:** new `app/admin/json-tree.tsx`
- **Depends on:** W-03
- **Reuses:** `Input`, `IconButton`, `Badge`, lucide icons, `cn`, `cva`.
- **Done when:** the seeded ~470-line config renders with no visible stall and
  managed rows expose no control at all.
- **Verifies:** FR-5.1, FR-5.2, FR-5.6, FR-5.8, FR-3.6, FR-3.7, NFR-2

### W-06 — `instance-config-editor.tsx`
- **What:** the modal shell (portal, backdrop, Escape, `max-w-4xl`, internal
  scroll), the mode switch with Tree disabled while invalid, raw `Textarea` with
  the Tab-inserts-two-spaces handler and the parse status line, **Format**,
  save gating, `RestartPolicySelect modes={["now","notice"]}`, and the five
  outcome notices: saved / managed-reverted / reapply-failed / stale-revision +
  Reload / not-provisioned. Text is the single source of truth (FR-6.1);
  the response replaces state on success (FR-6.3).
- **Where:** new `app/admin/instance-config-editor.tsx`,
  `app/admin/instance-config-editor.test.tsx`
- **Depends on:** W-02, W-04, W-05
- **Reuses:** `ConfirmDialog` (dirty close, `tone="danger"`), `Surface`,
  `Button`, `Alert`, `Spinner`, `createPortal` idiom from `confirm-dialog.tsx`.
- **Done when:** every row of design §"Test plan" for this file passes, and a
  409 never auto-retries.
- **Verifies:** FR-3.1..FR-3.5, FR-4.1..FR-4.4, FR-6.1..FR-6.5, FR-7.1

### W-07 — Members panel Instances section
- **What:** `UserInstances` above `UserFiles` in the expanded row, fed the
  `UserRef[]` filtered to that member's `accId` (**not** the merged roster's role
  labels). One row per agent workspace with an **Edit configuration** action; the
  editor mounted once at panel level. Extend the file-header comment as in design
  — the existing file-row instruction is not weakened.
- **Where:** `app/admin/members-panel.tsx`
- **Depends on:** W-06
- **Done when:** two workspaces for one email render two rows; file rows still
  carry no affordance beyond delete.
- **Verifies:** FR-2.1..FR-2.4, NFR-4

### W-08 — Copy
- **What:** the `instanceConfig` block in both locales, the `config` restart
  reason in `restart-notice.tsx`'s map (both locales), and the four JSON type
  names added to `parity.test.ts`'s `SHARED` with the reason stated.
- **Where:** `lib/i18n/admin.ts`, `app/admin/restart-notice.tsx`,
  `lib/i18n/parity.test.ts`
- **Depends on:** W-06, W-07
- **Done when:** `parity.test.ts` is green and a `config`-reason banner renders
  non-empty text.
- **Verifies:** FR-7.3, FR-8.1, FR-8.2

## Phase 4 — Close-out

### W-09 — Spec reconciliation
- **What:** annotate any FR that changed during implementation, in the style
  `restart-control/spec.md` uses. Confirm `package.json` is untouched (NFR-1).
- **Where:** `.specs/features/admin-instance-config-editor/spec.md`
- **Depends on:** W-08

---

## Commit plan

```
feat(admin): instance-config BFF route + client        (W-01, W-02)
feat(admin): json tree/text primitives                 (W-03)
feat(admin): restart policy mode subset                 (W-04)
feat(admin): json tree editor                           (W-05)
feat(admin): instance config editor                     (W-06)
feat(admin): instances section in the members panel      (W-07)
feat(i18n): instance-config copy + config restart reason (W-08)
docs(specs): reconcile instance-config spec with shipped (W-09)
```
