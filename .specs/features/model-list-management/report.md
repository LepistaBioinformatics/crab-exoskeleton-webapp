# admin-model-override — webapp report

- Status: done.
- Commits:
  - `6f9d321` feat(admin): model-override tab, client API, and BFF routes
  - `1255ac8` fix(admin): resync per-user model selection and spinner-on-error in model panel
- Files: `lib/adminModels.ts`, `app/api/admin/models/route.ts`, `app/api/admin/model/route.ts`,
  `app/api/admin/model/users/route.ts`, `app/admin/model-panel.tsx`, `app/admin/admin-screen.tsx`.
- tsc: `npx tsc --noEmit` clean (0 output), both before and after the follow-up fix commit.
- No API key: grepped all new/changed files for `apikey|api_key|secret` — no matches. Every
  shape (`SelectableModel`, `ModelOverride`, `UserModel`, BFF payloads) carries only
  `{provider, name[, level]}`, per CTX-AMO-06.
- `git status` after both commits: only the pre-existing WIP remains unstaged/untracked
  (`lib/admin.ts`, `app/chat/conversation-tree.tsx`, `app/chat/workspace-nav.tsx`,
  `lib/adminScopes.ts`, `lib/admin.test.ts`, `components/ui/avatar.tsx(.test.tsx)`, `.specs/`,
  plus other pre-existing modified files in `app/chat`/`app/api/chat` untouched by this task).
  `lib/admin.ts` was only imported read-only (`ScopeRef`), never edited.
- Build: skipped (`yarn build` hits `EACCES` unlinking `.next/server/app-paths-manifest.json`,
  a root-owned artifact, confirmed by reproducing the error) — relied on tsc per the gate's
  fallback instruction.
- Follow-up fix (pre-report review pass): the per-user row's model `<select>` kept a stale
  selection after Reset (React preserved local state across the parent refresh since the row
  key didn't change), which left "Apply" wrongly enabled on the just-cleared model; added a
  `useEffect` resyncing selection to `user.provider`/`user.name`. Also added `!error` guards to
  the panel/per-user spinners so a failed fetch doesn't spin forever alongside the error Alert
  (mirrors `shared-skills-panel.tsx`'s `skills === null && !error` pattern).
- Concerns: none outstanding. The per-user section only renders for `scope.kind ===
  "subscription"` (mirrors `MembersPanel`'s tenant-scope guard) since the backend's
  `/model/users` endpoint is subscription-scoped per design.md.
