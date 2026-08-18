# admin-column-browser — Tasks

**Design**: `design.md` · **Status**: Done

Gate every task: `npx tsc --noEmit` (baseline **5**, "still 5"), `npx vitest run`, and
`yarn build` at the end.

```
Phase 1 — rules      T01 → T02
Phase 2 — copy       T03
Phase 3 — views      T04 → T05 → T06
Phase 4 — wiring     T07
Phase 5 — removal    T08
Phase 6 — gate       T09
```

### T01: `?tenant=` in the URL model
**What**: `encodeTenant`/`resolveTenant` and the scope-wins rule; drop `gateStep`/`railItems`
once nothing calls them (T08).
**Where**: `app/admin/admin-nav.ts`, `admin-nav.test.ts` · **Requirement**: FR-6.2, FR-6.5

### T02: The column model
**What**: `Column`, `ColumnRow`, `buildColumns`, `resolvePane`.
**Where**: `app/admin/columns.ts`, `columns.test.ts` · **Depends on**: T01
**Requirement**: FR-1, FR-2, FR-5.2, FR-8.1.2
**Done when**: the truth table covers every column's existence rule, the tenant-wide row,
leaf/branch per row, the legacy entry, and the branding-only caller.

### T03: Copy
**What**: column headings, root rows, tenant-wide row, empty reasons, the next-choice line,
the mobile path line, back controls.
**Where**: `lib/i18n/admin.ts` · **Depends on**: T02 · **Requirement**: FR-10

### T04: `ColumnView`
**Where**: `app/admin/column-view.tsx`, `column-view.test.tsx` · **Depends on**: T03
**Requirement**: FR-2.6, FR-2.7, FR-9.1, FR-9.2, FR-9.4, FR-9.5, FR-5.4

### T05: `ColumnBrowser`
**What**: the strip at `md`+, the pinned panel, the slack line, the mobile track.
**Where**: `app/admin/column-browser.tsx` · **Depends on**: T04
**Requirement**: FR-3, FR-5.1, FR-5.2, FR-5.3, FR-5.5

### T06: `PanelHeader`
**What**: section name, the path below `md`, `RestartChrome`; owns `scopeLabel` and `target`.
**Where**: `app/admin/panel-header.tsx` · **Depends on**: T03
**Requirement**: FR-4

### T07: Wire the screen
**Where**: `app/admin/admin-screen.tsx` · **Depends on**: T02, T05, T06
**Requirement**: FR-1.4, FR-6, FR-7
**Done when**: no default scope; both lists resolved before drawing; selecting a row
discards deeper selections in ONE batched URL write.

### T08: Remove what the columns replaced
**What**: delete `nav-rail.tsx(+test)`, `scope-gate.tsx`, `context-bar.tsx`,
`scope-tree.tsx`, `agent-gate.tsx`, `admin-shell.tsx`; remove orphaned copy from BOTH
locales.
**Depends on**: T07 · **Requirement**: FR-8

### T09: Gate and record
**What**: full gate; record in `.specs/project/STATE.md` what was verified and what still
needs a browser.
**Depends on**: T08
