# Tasks — member-owned skills (webapp)

Spec: `./spec.md`, and the backend spec it points at. Proxy tasks T1–T3 land first; the
wire shape they freeze is what T4 onward consume.

## T4 — Client layer

**Where** `lib/skills.ts` (new), `lib/skills.test.ts`.

**What** `MemberSkill` (`SkillMeta` + `origin` + `shadowed`), `listSkills`,
`readSkill`, `saveSkill`, `deleteSkill`, on `lib/workspaceApi.ts`'s `workspaceQuery` /
`getJson` and `errorCode`.

**Done when** no call passes `project` (spec DEC-1), and a test asserts it.

## T5 — BFF routes

**Where** `app/api/skills/route.ts`, `app/api/skills/doc/route.ts`.

**Done when** GET/PUT/DELETE and GET respectively forward to `/${role}/v1/skills[...]`;
`role` selects the gateway path and is never forwarded; the PUT body is rebuilt field by
field; `project` is never forwarded; 401 clears the session; connectivity is 502.

**Tests** a source-based test in the idiom of `app/api/mangrove/mangrove-actions.test.ts`
pinning that neither route mentions `project`.

## T6 — The section

**Where** `app/chat/workspace-sections.ts` (`Section`, `SECTION_ORDER`, `SECTIONS`),
`app/chat/workspace-screen.tsx` (branch + refresh entry).

**Done when** the sidebar row, the collapsed rail and the pane switcher show it without
further edits, and the enumerating tests are updated: `workspace-sections.test.ts`,
`workspace-screen.test.tsx` (`BODY` map), `sidebar-destinations.test.tsx`,
`crumbs.test.ts`, `destination.test.ts`.

**Not** added to `workspace-panel-scope.test.ts`'s `PANELS` — spec DEC-1.

## T7 — The panel

**Where** `app/chat/skills-panel.tsx` (new), plus exporting `FrontmatterPanel` from
`app/chat/file-preview.tsx`.

**Done when** FR-2, FR-3 and FR-4 hold: grouped list with origin badges, edit and delete
only on `origin === "member"`, a shadowed marker, detail rendering frontmatter + body,
an editor on the `markdown-editor.tsx` model with a fixed name, and a 409 offering a
reload instead of an overwrite.

## T8 — Copy

**Where** `lib/i18n/chat.ts` (`chatCopy.skills.*`, section label and blurb),
`lib/i18n/parity.test.ts` (`SHARED` for the paths whose pt and en legitimately match).

## T9 — Gates

`./node_modules/.bin/vitest run` — no new failures; `./node_modules/.bin/next build`
clean. `yarn lint` does not run in this repo and `tsc` carries a pre-existing error
baseline; neither is a gate, but the baseline must not grow.
