# admin-managed-storage-limits — Tasks (webapp)

**Spec**: `.specs/features/admin-managed-storage-limits/spec.md`
**Status**: Planned
**Blocked by**: the proxy half (T6 there — the API and the `usage` field must
exist), and `unrestricted-upload-types` FR-8 (the BFF error mapping this extends)

| Gate | Command |
| --- | --- |
| quick | `yarn test <file>` |
| full | `yarn test && yarn build` |

---

## Dependencies

```
T1 ──→ T2 ──→ T3 ──┐
T4 ────────────────┼──→ T6
T5 ────────────────┘
```

---

### T1: Client for the media policy

**What**: `getMediaPolicy`, `setMediaPolicy`, `clearMediaPolicy` + the BFF routes.
**Where**: `lib/adminMediaLimits.ts` (new), `app/api/admin/media-policy/route.ts`
(new), test alongside
**Depends on**: None
**Reuses**: `lib/adminUserModels.ts` as the template (same three-verb policy
shape), `proxyRead`/`fetchMycelium` idiom of the sibling admin routes
**Requirement**: FR-2, FR-3

**Done when**:

- [ ] The three states (inherited / set here / unlimited) are distinguishable in
      the parsed type — `null`, a number, and "not set" are three values, not two
- [ ] `0` parses as a set value, never as absent
- [ ] Gate: `yarn test lib/adminMediaLimits.test.ts`

**Commit**: `feat(admin): client for per-scope media limits`

---

### T2: Storage limits card

**What**: The card in the scope's files section.
**Where**: `app/admin/storage-limits-card.tsx` (new),
`app/admin/shared-files-panel.tsx` (mount), test alongside
**Depends on**: T1, T5
**Reuses**: `formatBytes`, `Field`, the panel's existing error/busy idioms
**Requirement**: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

**Done when**:

- [ ] An inherited value renders with the level that set it
- [ ] Clearing renders as inherited, not as zero
- [ ] A cap above the ceiling renders the effective number and names the ceiling
- [ ] MB in, bytes out — a test pins the conversion at the boundary
- [ ] Gate: `yarn test app/admin/storage-limits-card.test.tsx`

**Commit**: `feat(admin): set the upload cap and storage quota for a scope`

---

### T3: Usage readout in the files panel

**What**: used / allowed, from the listing's `usage`.
**Where**: `app/chat/uploads-sidebar.tsx`, `lib/media.ts` (type), test alongside
**Depends on**: T1
**Reuses**: `listWorkspaceMedia`, `formatBytes`
**Requirement**: FR-7, FR-8, FR-9

**Done when**:

- [ ] With a quota: "12 MB of 500 MB" plus a bar
- [ ] Without: the total alone, no bar, no denominator
- [ ] No colour change and no banner at any fill level
- [ ] A listing from an older proxy (no `usage`) renders the panel unchanged
- [ ] Gate: `yarn test app/chat/uploads-sidebar.test.ts`

**Commit**: `feat(files): show how much of the workspace allowance is used`

---

### T4: Refusal copy with numbers [P]

**What**: BFF mapping for the structured 413; message formatting at the call
site.
**Where**: `app/api/media/route.ts`, `lib/media.ts`, `lib/i18n/errors.ts` or
`chat.ts` (see FR-12), tests alongside
**Depends on**: None
**Reuses**: the code-mapping introduced by `unrestricted-upload-types` FR-8
**Requirement**: FR-10, FR-11, FR-12

**Done when**:

- [ ] `media_too_large` and `media_quota_exceeded` arrive as codes with their
      numbers intact through the BFF
- [ ] The rendered message names both numbers, in both locales
- [ ] An upload failure with no structured body still produces a sensible message
- [ ] Gate: `yarn test app/api/media`

**Commit**: `feat(media): tell the member which limit they hit`

---

### T5: Copy [P]

**Where**: `lib/i18n/admin.ts`, `lib/i18n/chat.ts`
**Depends on**: None
**Requirement**: FR-13

**Done when**:

- [ ] Every new leaf differs between locales
- [ ] Gate: `yarn test lib/i18n/parity.test.ts`

**Commit**: `i18n: copy for storage limits and their refusals`

---

### T6: Close-out

**Depends on**: T2, T3, T4

**Done when**:

- [ ] All six acceptance items exercised against a running stack with the proxy
      half deployed
- [ ] Gate: `yarn test && yarn build`
- [ ] Deviations written into the spec

**Commit**: `docs(specs): reconcile admin-managed-storage-limits (webapp)`
