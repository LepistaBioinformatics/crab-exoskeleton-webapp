# Member-owned skills — the member-facing panel

The backend half, and every decision this one depends on, is
`crab-shell-proxy/.specs/features/member-owned-skills/spec.md`. Read it first: the
origin model (FR-2), the shadowing rule (FR-3), the main-workspace-only scoping (DEC-5)
and the harness gate (DEC-9) are all settled there.

## The request

> Implement listing, viewing and editing a member's own skills from the webapp. Today
> that is impossible for a member. Remember that the skills the proxy injects and/or
> the administrator publishes are read-only.

Confirmed with the owner as full CRUD over the member's own layer.

## What exists today

Nothing member-side. `app/admin/shared-skills-panel.tsx` is administrator-only, reaches
`/api/admin/skills*`, and is create-and-preview rather than edit — its editor state is a
two-case union where save is gated on `mode !== "create"`, so an existing skill can be
previewed but not changed in place.

The member sees no skill anywhere in the product, including the ones their own agent
wrote for itself.

## FR-1 — A seventh workspace section

`Section` gains `"skills"` (`app/chat/workspace-sections.ts`). The sidebar row, the
collapsed rail entry and the pane's tool-switcher all derive from `SECTION_ORDER`, so
they follow automatically; the work is the `SECTIONS` entry (icon, label, blurb), a
branch in `workspace-screen.tsx`, and the enumerating tests that assert the exact set.

It opens in the existing right-hand `WorkspacePane` (fragment key `rs`), beside the
conversation — not as a centre destination. A member reads a skill to understand what
their agent will do next; that belongs next to the chat, not in place of it.

## FR-2 — The list is one row per skill, grouped by origin

Each row: name, description, a size badge, a `files` badge when `hasFiles`, and an
origin badge. Only `origin === "member"` rows carry edit and delete.

Order: the member's own first, then the administrator's, then the operator's. The
member's layer is the one they can act on; the other two are context for why the agent
behaves as it does.

A row whose `shadowed` flag is set is marked plainly — an administrator's skill of the
same name is what the agent loads, and this file does nothing. Without that, the panel
invites someone to edit a file with no effect.

## FR-3 — Detail is the frontmatter rendered, plus the body

Reuses `lib/frontmatter.ts`, which was written for exactly this grammar and already has
the proxy and harness parsers as its siblings. The `FrontmatterPanel` component in
`app/chat/file-preview.tsx` is currently private and renders precisely this; it is
exported rather than duplicated.

Read-only skills stop here: detail, no editor.

## FR-4 — The editor writes `SKILL.md` and nothing else

`app/chat/markdown-editor.tsx` is the in-repo precedent for a member-side editor with a
live preview, and is the right building block. The name field is fixed after creation:
the directory name is the skill's identity and the frontmatter must agree with it
(backend FR-4), so renaming is create-then-delete.

Save sends the `modifiedAt` the client read. A 409 means the agent rewrote the skill
underneath the member; the panel says so and offers to reload rather than overwriting.

The proxy answers both "that name is taken" and "it changed under you" with 409, since
both are the same refusal to clobber. Only the client knows which it asked for — a
create sends no `modifiedAt` — so the client splits them, and the two get different
copy.

The confirmation says "Saved." and makes no claim about WHEN the agent picks it up. The
backend's DEC-9 originally asked for "takes effect on the next message" on the ganglion;
the listing response carries no harness name, and the sentence is not worth a field and
a cross-panel fetch. The backend spec records the same correction.

New skills are seeded with `name` and `description` and nothing else, because that is
what a skill needs and an empty template is the wrong place to teach optional keys. A
third key is **not** refused — an earlier draft of this spec said it made the skill
unloadable on picoclaw, and that was wrong: picoclaw ships seven skills carrying
`metadata:` or `homepage:`. The backend spec's FR-4 records the correction and the
evidence.

## FR-4b — Going back is the Files tab's control, not a second invention

Opening a skill replaces the list, and the way back must be the **same control the files
tab uses**, not one more back affordance with its own placement and wording. Two panels
in the same pane that return to their own list differently is the kind of difference a
member reads as meaning something.

Copy the control from `app/chat/files-screen.tsx` rather than approximating it.

## FR-4c — A skill's other files are browsable and editable

A skill is a directory. Alongside `SKILL.md` it may carry templates, scripts and notes,
possibly in subdirectories, and the first version of this panel showed only a `hasFiles`
badge — the member could be told the files existed and never see one.

- The detail view lists every file (`GET /v1/skills/files`), the skill itself first.
- Selecting one opens it in the same editor, addressed by `path`.
- Only `SKILL.md` is held to the frontmatter grammar; a template is whatever it is.
- A file the server marks `binary` is shown with its size and **no editor** — never a
  textarea over a lossy decoding of a PNG.
- Read-only layers are browsable too, for the same reason they are listed at all.
- Writes are `PUT /v1/skills` with `path`; the `modifiedAt`/409 discipline is per file.

## FR-5 — BFF routes

`app/api/skills/route.ts` (GET, PUT, DELETE), `app/api/skills/doc/route.ts` (GET) and
`app/api/skills/files/route.ts` (GET),
top-level with `?role=`, like `/api/memory` and `/api/secrets` — not under
`app/api/chat/[instance]/`, which is chat and sessions only.

`lib/proxyRead.ts` serves the reads, but **`project` must not be forwarded** (backend
DEC-5). That helper forwards it unconditionally on every route it serves, so this route
either opts out or is hand-rolled on the `app/api/secrets/route.ts` model, which already
covers GET/POST/DELETE with a local helper. Whichever is chosen, a test pins that no
`project` reaches upstream.

`proxyWrite` is POST-and-JSON only, so PUT and DELETE are hand-rolled the way secrets
and memory already do it, rebuilding the upstream body field by field so an unexpected
key cannot be smuggled through.

## FR-6 — Copy

New keys under `chatCopy.skills.*`, plus the section label and blurb. Two notes:

- `lib/i18n/parity.test.ts` fails on any leaf string identical in both locales. "Skills"
  is a loanword and identical in pt and en, so its path joins the `SHARED` allowlist —
  `admin.shell.tabs.skills` is already there.
- `chatCopy.restart.reasons["shared-skills"]` already exists and already speaks to the
  member about skills changing. The new copy matches its register.

## DEC-1 — The panel is not project-scoped, and a test says so

Backend DEC-5: the harness reads skills only from the main workspace. The panel's effects
are keyed on the workspace and **not** on the project, which is the exact inverse of the
invariant `app/chat/workspace-panel-scope.test.ts` enforces over the other four panels.

So the panel is deliberately **not** added to that test's `PANELS` list, and a test of
its own pins the opposite: the client sends no `project` and the effect does not re-run
when only the project changes. An exception with no test is indistinguishable from the
bug that test was written to catch.

## DEC-2 — Origin comes from the server, never inferred in the client

The three layers are indistinguishable by path — the operator's skills are bind-mounted
*into* the member's own `workspace/skills` directory (backend DEC-2). The client renders
`origin` and never derives it.

## Out of scope

Binary upload and zip download (the admin panel has both), deleting a single supporting
file, renaming, and anything project-scoped.

## Note on an existing document

`.specs/features/shared-skills-management/spec.md` declares itself BLOCKED and says the
proxy has no `/v1/admin/skills` handlers and the admin tab is commented out. None of that
is true any more, and its own `report.md` contradicts it. Not edited as part of this
feature, but it should not be read as current.
