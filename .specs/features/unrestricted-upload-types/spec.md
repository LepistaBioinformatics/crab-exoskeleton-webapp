# unrestricted-upload-types — Spec

**Status:** Implemented (tests + build green; runtime-unverified until deploy)
**Size:** Medium (delete a gate, three client call sites, one error mapping)

| Repo | Role |
| --- | --- |
| `crab-shell-proxy` | Delete `MediaAllowedExts` and `mediaExtAllowed` — see `.specs/quick/002-drop-media-ext-allowlist/TASK.md` there |
| `crab-exoskeleton-webapp` | This spec: the picker's `accept`, the menu's last entry, the media BFF's error mapping |
| `zombie-crab-project` / `zombie-crab-project-mkt` | Submodule pointer bumps only |

---

## Problem

A member with a file the allowlist does not name cannot upload it, and the way
the interface refuses is what makes it expensive.

The refusal happens twice, in two different registers:

1. **The OS picker never shows the file.** Every entry in the attach menu passes
   an `accept` string, including the last one ("Outros tipos" / "Other types"),
   which passes `MEDIA_ACCEPT` — the union of the five categories, not
   "everything". A `.parquet`, a `.fasta`, a `.dcm`, a file with no extension at
   all: greyed out, or absent, depending on the platform. Nothing on screen says
   why.
2. **The proxy answers 400** if a client posts one anyway, and the webapp shows
   *"Algo deu errado."* — see FR-8.

So the member does the only thing left: they zip the file, or they rename it to
something the dialog will show. Both are worse than the refusal was.
Renaming produces a file whose extension **lies about its bytes**, which the
agent then opens as the type the name claims; zipping produces an archive the
agent has to be told to unpack, and whose contents are back outside the
allowlist anyway. The reported symptom — "it errors when it decompresses,
because the format inside doesn't match" — is this workaround failing, not a bug
in the archive handling.

## Goal

Any file, any extension, no extension. One entry in the attach menu that filters
nothing, and a proxy that no longer has an opinion about file types.

## Non-goals

- **Not** a preview feature. `PREVIEW_KINDS` is unchanged: everything outside it
  stays download-only. See FR-7 — this is what keeps allow-all safe.
- **Not** a change to the size cap. `mediaMaxBytes` still bounds an upload; making
  it administrable is `admin-managed-storage-limits`.
- **Not** a denylist. "Everything except executables" was considered and refused
  (DEC-1).

---

## Requirements

### The proxy stops classifying

- **FR-1** The extension allowlist is **removed**, not widened: the
  `mediaAllowedExts` config field, the `mediaExtAllowed` helper and the 400 it
  guards all go. Detail and verification live in the proxy's quick task 002.
- **FR-2** Files **with no extension** (`Makefile`, `LICENSE`, `Dockerfile`)
  become uploadable for the first time. `filepath.Ext` returns `""` for them, so
  the current allowlist rejects them today; `sanitizeFilename` already accepts
  them unchanged. Nothing downstream needs a case: `fileTypeGroup` answers
  `unknown` and `previewKind` answers `null`, which are both already real
  answers rather than gaps.

### The picker stops filtering

- **FR-3** The attach menu's **last entry** opens the picker with **no `accept`
  attribute at all** — removed, not set to `*/*` or to `""`. The attribute is
  what the OS dialog filters on, so the entry that promises "everything" must
  not carry one. Its label changes from
  "Other types" / "Outros tipos" to "Any file" / "Qualquer arquivo": the old
  wording promised a category, and the entry now promises the absence of one.
- **FR-4** The hidden `<input type="file">` in `composer.tsx` no longer carries
  `accept={MEDIA_ACCEPT}` as its default. `pick()` sets the attribute per
  category and must **clear** it for FR-3, or the previous category's filter
  survives into the next open.
- **FR-5** The **files sidebar's Upload button** (`uploads-sidebar.tsx`) is
  unfiltered too. The member named this surface explicitly, and a files panel
  that lists every type while its own upload button refuses some is the same bug
  in a second place.
- **FR-6** The five category shortcuts (Images, Documents, Spreadsheets,
  Presentations, Archives) **stay exactly as they are**. They are a convenience
  for finding one image in a crowded folder, not a policy — nothing enforces
  them, and losing them to make a point about generality would cost the common
  case. `MEDIA_CATEGORIES` therefore stays; `MEDIA_ALL_EXTS` and `MEDIA_ACCEPT`
  lose their last caller and are deleted, together with the
  "must stay in sync with the proxy's MediaAllowedExts" comment on
  `MEDIA_CATEGORIES`, which stops being true the moment FR-1 lands.

### What still refuses, and how it says so

- **FR-7** Preview is **not** extended. Allow-all makes `.svg` and `.html`
  uploadable for the first time, and they stay download-only like every other
  format outside `PREVIEW_KINDS`. This is deliberate and load-bearing: the proxy
  serves every media file as `application/octet-stream` with
  `Content-Disposition: attachment` (`handlers.go:1348-1349`), so a member's file
  never renders from this origin. Uploading arbitrary bytes is safe **because**
  of that posture, and extending preview is what would spend it.
- **FR-8** The media BFF (`app/api/media/route.ts`) maps upstream media failures
  to **error codes** instead of forwarding the proxy's prose. Today
  `upstreamError` returns the proxy's English sentence as the `error` value,
  `errorCode` passes it through, and `errorText` cannot find it in the
  dictionary — so **every** upload failure is shown as *"Algo deu errado."*
  That is why the current refusal is unexplainable to the member. After FR-1 the
  remaining refusals are size (`413` → `too_large`) and an unusable filename
  (`400` → `invalid_request`), and both must arrive as codes the dictionary
  already carries.
- **FR-9** `unsupported_type` stays in the error dictionary: the branding logo
  upload still raises it, and that gate (an image, at a known size) is a
  different rule with a different reason.

---

## Decisions

- **DEC-1 — no denylist.** "Everything except `.exe`, `.sh`, `.bat`…" was
  offered and refused by the project owner. A denylist is still a list to
  maintain, and the failure it prevents is not one this system has: nothing
  executes an uploaded file. The proxy writes it `0600` into a workspace
  directory, the agent reads it as data, and the download route hands it back as
  an attachment. What a member's own machine does with a file they downloaded on
  purpose is outside this boundary.
- **DEC-2 — remove the field, do not repurpose it.** `mediaAllowedExts` could
  have been kept with "empty means allow all". It is deleted instead: today's
  code reads an empty list as *"use the restrictive default"*
  (`config.go:396`), so an operator who wrote `mediaAllowedExts: []` would get
  the opposite of what they asked for — and inverting that meaning silently, for
  a field no deployed config sets, buys a knob nobody requested at the price of a
  trap that already exists. Verified: no `mediaAllowedExts` in any compose or
  config under `zombie-crab-project-mkt/deploy/`.

---

## Acceptance

1. Attach menu → last entry → the OS dialog shows **every** file in the folder,
   including one with no extension.
2. Uploading `sample.parquet` and `Makefile` both succeed and appear in the files
   panel, with the neutral icon.
3. `report.svg` uploads, and its row offers **Download** only — no preview entry.
4. An upload over the size cap shows *"That file is too large." /
   "Esse arquivo é muito grande."*, not *"Algo deu errado."*
5. `MEDIA_ACCEPT` and `MEDIA_ALL_EXTS` no longer exist anywhere in the webapp.

---

## Reconciliation

Everything above shipped as specified. Three notes:

- **FR-8 grew to the whole media write surface.** All three verbs of
  `app/api/media/route.ts`, and — once `paste-and-drop-upload` made a folder drop
  an upload FOLLOWED BY A MOVE — `lib/mediaFolderProxy.ts` as well, which is
  `/move` and `/folder`. The mapper lives in `lib/mycelium.ts` beside
  `upstreamError` and adds one code, `media_name_taken`, for the 409 the folder
  operations rely on. `/download` still forwards prose: nothing that fails there
  is reachable by an ordinary gesture.
- **The size cap is looser than it looks.** The proxy bounds the body at
  `mediaMaxBytes + 1 MiB` (multipart slack), so the configured number is not the
  enforced one. Found while testing the proxy half; it belongs to
  `admin-managed-storage-limits`, which checks `header.Size` after the parse.
- **`MEDIA_CATEGORIES` labels are still hard-coded Portuguese** ("Imagens",
  "Documentos", …) and render untranslated in an English interface. Pre-existing,
  out of this feature's scope, and now the only untranslated copy in the attach
  menu — the last entry took its label from `chatCopy` in this change.

**Verification:** proxy `go build ./...` clean, `internal/httpapi` and
`internal/config` green, full `go test ./...` at exactly the 10 pre-existing
`lchown` failures (confirmed identical by `git stash` + re-run). Webapp
`yarn test` 1323 tests in 98 files green, `yarn build` clean.
