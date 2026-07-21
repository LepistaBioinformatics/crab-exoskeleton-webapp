# crab-exoskeleton-webapp — Claude Code instructions

## Spec-driven development artifacts

All spec-driven development (SDD / `tlc-spec-driven`) artifacts live under
`.specs/` — **never** at the repository root.

- Project docs go under `.specs/project/` (`PROJECT.md`, `ROADMAP.md`,
  `STATE.md`).
- Feature specs, designs, contexts, tasks, and execution artifacts
  (implementation/report notes) go under `.specs/features/<feature>/`.
- Use one folder per feature, named with the feature slug
  (e.g. `model-list-management`, `shared-skills-management`,
  `tenant-avatar-sidebar`).
- Standard filenames inside a feature folder: `spec.md`, `context.md`,
  `design.md`, `tasks.md`, plus any `report.md` / progress execution artifacts
  for that feature.
- Do not create `.sdd-*` files (or any spec/report scratch files) at the repo
  root. If a tool or workflow would place them there, write them under the
  matching `.specs/features/<feature>/` folder instead.

`.specs/` is the default and only location for these documents.
