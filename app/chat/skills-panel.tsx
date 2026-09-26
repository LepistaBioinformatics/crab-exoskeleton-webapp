"use client";

import { useEffect, useState } from "react";
import {
  BookText,
  ChevronLeft,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  SKILL_DOC,
  SKILL_ORIGINS,
  deleteSkill,
  listSkillFiles,
  listSkills,
  orderSkillFiles,
  readSkill,
  saveSkill,
  seedSkill,
  skillProblem,
  type MemberSkill,
  type SkillFile,
  type SkillOrigin,
} from "@/lib/skills";
import { split } from "@/lib/frontmatter";
import type { Workspace } from "./fragment";
import { FrontmatterPanel } from "./file-preview";
import { formatSize } from "./file-visuals";
import MessageContent from "./message-content";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The member's own skills, and the two layers above them.
//
// NOT KEYED ON THE PROJECT, and it is the only panel in this pane that is not. The
// other four address a workspace DIRECTORY and `workspace.p` is part of which one;
// the harness's skill loader is fixed on the main workspace at boot, so a skill
// written into a project's workspace is read by nothing (backend DEC-5). The effect
// below therefore reads `workspace.t/.s/.r` and stops — which is the exact inverse of
// what `workspace-panel-scope.test.ts` enforces over the other four, so this panel is
// deliberately absent from that list and `skills-panel-scope.test.ts` pins the
// opposite.
//
// A SKILL IS A DIRECTORY (FR-4c). `SKILL.md` is the skill; the templates, scripts and
// notes beside it are what the skill tells the agent to open, and the first version of
// this panel showed them as a badge that did nothing. Every view below is therefore
// addressed by a PATH inside the skill, and the conflict guard is per file: each one
// carries its own `modifiedAt`, because the agent's evolution can rewrite one template
// and leave the rest alone.
//
// Three views in one component rather than three files: the list, one skill, and the
// editor over one file of it. They share the loaded listing and the error line, and
// splitting them would mean lifting both into a parent that did nothing else.

/**
 * The open editor.
 *
 * `path` is which file of the skill, and `modifiedAt` is THAT FILE's version as read —
 * never the skill's, which is not a thing the proxy has. Empty means this is a create.
 */
type Editor = {
  name: string;
  path: string;
  body: string;
  modifiedAt: string;
  creating: boolean;
};

/**
 * One skill, open: its files, and the one of them on screen.
 *
 * `origin` is the server's, from the document read (spec DEC-2). `description` and
 * `shadowed` are NOT here — they come from the listing row, which is the only response
 * that carries them: a document read answers about one file, and shadowing is a fact
 * about the three layers merged.
 */
type Opened = {
  name: string;
  origin: SkillOrigin;
  files: SkillFile[];
  doc: { file: SkillFile; content: string };
};

export default function SkillsPanel({
  workspace,
  refreshSignal = 0,
}: {
  workspace: Workspace;
  /**
   * Bumped by the pane's refresh control. Skills go stale behind the member's back
   * for a reason none of the other panels share: the agent's own evolution writes
   * this directory, so a skill can appear or change between two readings without
   * anyone here having asked for it.
   */
  refreshSignal?: number;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const errs = useT(errorCopy);
  const [skills, setSkills] = useState<MemberSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [selectingPath, setSelectingPath] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // A 409 on a save: the agent rewrote the file while the member had it open. Held
  // apart from `error` because the answer is a control, not a sentence -- see below.
  const [conflict, setConflict] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setError(null);
    listSkills(workspace)
      .then((s) => {
        if (!cancelled) setSkills(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(errorText(errs, e.message));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r, refreshSignal]);

  // Switching agents drops whatever was open. A skill is workspace-scoped, so the
  // document on screen belongs to the workspace that was there a moment ago.
  useEffect(() => {
    setOpened(null);
    setEditor(null);
    setConflict(false);
  }, [workspace.t, workspace.s, workspace.r]);

  const refresh = () =>
    listSkills(workspace)
      .then(setSkills)
      .catch((e: Error) => setError(errorText(errs, e.message)));

  // `andEdit` is what the pencil on a row asks for: the editor needs the document
  // and the version it was read at, so it is the same fetch either way rather than
  // a detour through the detail view.
  async function open(name: string, andEdit = false) {
    setOpeningName(name);
    setError(null);
    try {
      const doc = await readSkill(workspace, name);
      setOpened({
        name,
        origin: doc.origin,
        // The skill itself until the listing answers, and never an empty list: the
        // file on screen is a file of this skill, so it belongs in its own index
        // even if the second request below never lands.
        files: [doc.file],
        doc: { file: doc.file, content: doc.content },
      });
      setEditor(andEdit ? editorFor(name, doc.file, doc.content) : null);
      setSaved(false);
      setConflict(false);
      // A SECOND REQUEST, AND A WEAKER DEPENDENCY. The skill is already readable
      // without it; what it adds is the rest of the directory. Awaiting it beside the
      // document would mean a gateway missing the `/v1/skills/files` block -- the
      // failure this stack has shipped three times -- takes reading a skill down with
      // it, rather than costing the file index alone.
      void listSkillFiles(workspace, name)
        .then(({ files }) =>
          setOpened((prev) => (prev && prev.name === name ? { ...prev, files } : prev)),
        )
        .catch((e: Error) => setError(errorText(errs, e.message)));
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
    } finally {
      setOpeningName(null);
    }
  }

  /** Another file of the skill already open, addressed by its path. */
  async function selectFile(path: string) {
    if (!opened) return;
    setSelectingPath(path);
    setError(null);
    setSaved(false);
    setConflict(false);
    try {
      const doc = await readSkill(workspace, opened.name, path);
      setOpened({ ...opened, doc: { file: doc.file, content: doc.content } });
      // Leaving the editor open over the file the member just navigated away from
      // would offer to save one file's text into another's path.
      setEditor(null);
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
    } finally {
      setSelectingPath(null);
    }
  }

  function edit(from: Opened) {
    setEditor(editorFor(from.name, from.doc.file, from.doc.content));
    setSaved(false);
    setConflict(false);
  }

  function create() {
    setOpened(null);
    setEditor({
      name: "",
      path: SKILL_DOC,
      body: seedSkill(""),
      modifiedAt: "",
      creating: true,
    });
    setSaved(false);
    setConflict(false);
  }

  async function onSave(current: Editor) {
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      const file = await saveSkill(workspace, {
        name: current.name,
        path: current.path,
        content: current.body,
        ...(current.modifiedAt ? { modifiedAt: current.modifiedAt } : {}),
      });
      // THE NEW VERSION REPLACES THE ONE THE MEMBER READ, and a create becomes an
      // edit. Without this, the second save of a sitting sends the version from the
      // original read and is refused as a conflict that never happened. It is this
      // FILE's version: saving a template does not change what SKILL.md was read at.
      setEditor({ ...current, modifiedAt: file.modifiedAt, creating: false });
      setOpened((prev) =>
        prev && prev.name === current.name
          ? {
              ...prev,
              files: orderSkillFiles([
                ...prev.files.filter((f) => f.path !== file.path),
                file,
              ]),
              doc: { file, content: current.body },
            }
          : {
              name: current.name,
              // The write returned 200, and the proxy answers a write to either of
              // the other two layers with 403 -- so this is still the server's answer
              // about the origin and not a guess made here (spec DEC-2).
              origin: "member",
              files: [file],
              doc: { file, content: current.body },
            },
      );
      setSaved(true);
      await refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : null;
      // NEVER A SILENT OVERWRITE. The other writer is the agent's own evolution, so
      // what would be discarded is a skill the agent taught itself -- the panel says
      // so and offers to re-read, which is the only safe answer.
      if (code === "skill_changed") setConflict(true);
      else setError(errorText(errs, code));
    } finally {
      setSaving(false);
    }
  }

  async function reloadIntoEditor(current: Editor) {
    setConflict(false);
    setError(null);
    try {
      // THE SAME PATH, not the skill. Re-reading SKILL.md into an editor aimed at a
      // template would hand the member the wrong text and the wrong version.
      const doc = await readSkill(workspace, current.name, current.path);
      setOpened((prev) =>
        prev && prev.name === current.name
          ? { ...prev, doc: { file: doc.file, content: doc.content } }
          : prev,
      );
      setEditor(editorFor(current.name, doc.file, doc.content));
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
    }
  }

  async function onDelete(name: string) {
    setPendingDelete(null);
    setError(null);
    try {
      await deleteSkill(workspace, name);
      if (opened?.name === name) setOpened(null);
      if (editor?.name === name) setEditor(null);
      await refresh();
    } catch (e) {
      setError(errorText(errs, e instanceof Error ? e.message : null));
    }
  }

  const openedRow = opened ? (skills ?? []).find((s) => s.name === opened.name) : undefined;

  return (
    // NO WRAPPER BEYOND THIS ONE. The pane's body is already a definite-height flex
    // column (`workspace-pane.tsx`), so the scroller below has something to be 1 of;
    // a fixed-height box here is the workaround that pane removed the need for.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {error && (
          <div className="mb-3">
            <Alert severity="error">{error}</Alert>
          </div>
        )}

        {editor ? (
          <SkillEditor
            editor={editor}
            // Wrapped so "Saved." cannot outlive the edit that follows it: the
            // member typing again is the moment the message stops being true.
            setEditor={(next) => {
              setEditor(next);
              setSaved(false);
            }}
            existing={skills ?? []}
            // Where the way back goes: the skill, when one is open behind the
            // editor, and the list when this is a create.
            backTo={opened ? opened.name : t.skills.title}
            showPreview={showPreview}
            setShowPreview={setShowPreview}
            saving={saving}
            saved={saved}
            conflict={conflict}
            onReload={() => reloadIntoEditor(editor)}
            onCancel={() => setEditor(null)}
            onSave={() => onSave(editor)}
            t={t}
            c={c}
            errs={errs}
          />
        ) : opened ? (
          <SkillDetail
            opened={opened}
            // FROM THE LISTING ROW, not from the document read. The proxy computes
            // `shadowed` while merging the three layers and publishes the description
            // with the rest of the listing; a document read answers about one file and
            // carries neither. Still the server's answer, which is what DEC-2 asks for.
            row={openedRow}
            selectingPath={selectingPath}
            onBack={() => setOpened(null)}
            onSelect={selectFile}
            onEdit={() => edit(opened)}
            onDelete={() => setPendingDelete(opened.name)}
            t={t}
          />
        ) : (
          <>
            <div className="mb-3">
              <Button variant="filled" size="sm" onClick={create}>
                <Plus size={16} aria-hidden />
                {t.skills.newSkill}
              </Button>
            </div>
            {skills === null && !error ? (
              <div className="flex justify-center py-6">
                <Spinner size={20} />
              </div>
            ) : skills && skills.length === 0 ? (
              <PanelEmpty icon={BookText} title={t.skills.none} body={t.skills.noneHint} />
            ) : (
              SKILL_ORIGINS.map((origin) => {
                const group = (skills ?? []).filter((s) => s.origin === origin);
                if (group.length === 0) return null;
                return (
                  <section key={origin} className="mb-4">
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                      {t.skills.groups[origin]}
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {group.map((s) => (
                        <SkillRow
                          key={s.name}
                          skill={s}
                          opening={openingName === s.name}
                          onOpen={() => open(s.name)}
                          onEdit={() => open(s.name, true)}
                          onDelete={() => setPendingDelete(s.name)}
                          t={t}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t.skills.deleteTitle}
        message={
          pendingDelete
            ? t.skills.deleteMessage.replace("{name}", pendingDelete)
            : undefined
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * The way back, and it is `files-screen.tsx`'s control rather than a second invention
 * (FR-4b).
 *
 * The files tab returns from an open document to its tree with exactly this: a `link`
 * button in a row of its own, a chevron, and the NAME OF WHERE IT GOES — "Files", the
 * tab's own word — then the open document beside it and the actions after that. Two
 * panels in the same pane returning to their own list differently is a difference a
 * member reads as meaning something, so this copies the shape instead of approximating
 * it, down to `link` over `outlined`: the way back is the quietest thing in the row.
 */
function BackRow({
  label,
  name,
  onBack,
  children,
}: {
  label: string;
  name: string;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 pb-3">
      <Button size="link" variant="link" onClick={onBack}>
        <ChevronLeft size={14} aria-hidden />
        {label}
      </Button>
      <span
        className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg"
        title={name}
      >
        {name}
      </span>
      {children}
    </div>
  );
}

/**
 * One row.
 *
 * The edit and delete controls are drawn ONLY for `origin === "member"`, and absent
 * rather than disabled: a disabled control swallows its own click, so the member sees
 * a way in that does nothing and no explanation of why. The read-only layers say what
 * they are on the row's badge and again in the detail view.
 */
function SkillRow({
  skill,
  opening,
  onOpen,
  onEdit,
  onDelete,
  t,
}: {
  skill: MemberSkill;
  opening: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: typeof chatCopy.en;
}) {
  return (
    // NO RULE AT REST, and the surface lifts on hover instead -- the mangrove's
    // card idiom (`mangrove-post.tsx`'s `card`), brought here because these are the
    // same thing: a scannable list of items in the same pane. The row used to carry
    // a hairline of its own AND two bordered badges, three rules per line down a
    // column whose job is to be read quickly.
    <li className="group/skill flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-elevated">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t.skills.openPrefix} ${skill.name}`}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-fg" title={skill.name}>
            {skill.name}
          </span>
          {/* Only an explicit `true`. The proxy computes this for the ganglion alone
              (backend DEC-9), so an absent flag is "no claim either way" and must not
              paint a marker saying the file is inert. */}
          {skill.shadowed === true && (
            <span className="shrink-0 text-[11px] font-medium text-notice" title={t.skills.shadowedHint}>
              {t.skills.shadowed}
            </span>
          )}
        </div>
        {skill.description && (
          <div className="truncate text-xs text-fg-muted" title={skill.description}>
            {skill.description}
          </div>
        )}
      </button>
      {/* A BORDERLESS TOKEN, matching the mangrove's own tags, and the origin badge
          that used to sit beside it is GONE: every row is already inside a section
          headed with its origin, so the badge restated the heading once per line.
          It flips to `surface` on hover because the row itself becomes `elevated`,
          which is the same trick the mangrove card plays on its avatar. */}
      {skill.hasFiles && (
        <span className="shrink-0 rounded-md bg-elevated/60 px-1.5 py-0.5 text-[11px] font-medium leading-none text-fg transition-colors group-hover/skill:bg-surface">
          {t.skills.files}
        </span>
      )}
      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
        {formatSize(skill.size)}
      </span>
      {opening && <Spinner size={14} />}
      {skill.origin === "member" && (
        <>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`${t.skills.editPrefix} ${skill.name}`}
            onClick={onEdit}
          >
            <Pencil size={14} aria-hidden />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`${t.skills.deletePrefix} ${skill.name}`}
            onClick={onDelete}
          >
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </>
      )}
    </li>
  );
}

/**
 * One skill, read: its files, and the one of them on screen.
 *
 * The index lists EVERY file, the skill itself first, and does so even when the skill
 * itself is the only one: a member who has to open a skill to find out whether it
 * carries a template is back where the `files` badge left them, and a one-row index is
 * the plain answer that it carries none.
 *
 * A read-only skill is browsable exactly like the member's own, and that is the point
 * of listing the other two layers at all (FR-4c): an administrator's skill that tells
 * the agent to fill in a template cannot be understood while the template is invisible.
 * What is missing for them is the editor, not the reading.
 */
function SkillDetail({
  opened,
  row,
  selectingPath,
  onBack,
  onSelect,
  onEdit,
  onDelete,
  t,
}: {
  opened: Opened;
  row: MemberSkill | undefined;
  selectingPath: string | null;
  onBack: () => void;
  onSelect: (path: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  t: typeof chatCopy.en;
}) {
  const own = opened.origin === "member";
  const current = opened.doc.file;
  const isDoc = current.path === SKILL_DOC;
  return (
    <div className="flex flex-col gap-3">
      <BackRow label={t.skills.title} name={opened.name} onBack={onBack}>
        {own && (
          <>
            {/* Absent over a binary file rather than disabled, the same reason the
                read-only layers carry no pencil: there is nothing this control could
                do, and a dead one is a promise. The line below says why. */}
            {!current.binary && (
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.skills.editPrefix} ${current.path}`}
                onClick={onEdit}
              >
                <Pencil size={15} aria-hidden />
              </IconButton>
            )}
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={`${t.skills.deletePrefix} ${opened.name}`}
              onClick={onDelete}
            >
              <Trash2 size={15} aria-hidden />
            </IconButton>
          </>
        )}
      </BackRow>

      {row?.shadowed === true && <Alert severity="warning">{t.skills.shadowedHint}</Alert>}
      {!own && <p className="text-xs text-fg-muted">{t.skills.readOnly}</p>}

      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          {t.skills.filesHeading}
        </h3>
        <ul className="flex flex-col gap-1">
          {opened.files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onSelect(f.path)}
                aria-current={f.path === current.path ? "true" : undefined}
                aria-label={`${t.skills.openPrefix} ${f.path}`}
                // Selection is a filled surface rather than an accent outline, for
                // the reason the row above drops its own: a column of outlined boxes
                // is read as a grid, and this is a list.
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  f.path === current.path
                    ? "bg-elevated text-fg"
                    : "hover:bg-elevated/60"
                }`}
              >
                <FileText size={14} aria-hidden className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={f.path}>
                  {f.path}
                </span>
                {selectingPath === f.path && <Spinner size={12} />}
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                  {formatSize(f.size)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* The skill's own description, said here only while something OTHER than the
          skill is on screen. Over SKILL.md the metadata panel below already carries
          it; over a template it is the only thing saying what this file is for. */}
      {!isDoc && row?.description && (
        <p className="text-xs text-fg-muted">{row.description}</p>
      )}

      <SkillFileBody file={current} content={opened.doc.content} t={t} />
    </div>
  );
}

/**
 * One file of a skill, shown.
 *
 * Three cases, and they are three because a skill's directory holds three kinds of
 * thing:
 *
 * - `SKILL.md` is the skill, and gets the frontmatter panel and the rendered body --
 *   the same pair `file-preview.tsx` draws one with, exported from there rather than
 *   copied (FR-3). Without the split the leading `---` is an ordinary thematic break
 *   and `name: …` becomes a setext heading.
 * - a supporting file is shown AS ITSELF. Running it through the markdown renderer
 *   would turn a shell script's `#` comments into headings and swallow the indentation
 *   that makes it a script.
 * - a binary file has no content to show at all: the proxy withheld the bytes rather
 *   than send a lossy decoding of them, so the honest answer is its path, its size and
 *   a sentence saying it cannot be edited here.
 */
function SkillFileBody({
  file,
  content,
  t,
}: {
  file: SkillFile;
  content: string;
  t: typeof chatCopy.en;
}) {
  if (file.binary) {
    return (
      <div className="rounded-lg border border-rule bg-surface px-3 py-2">
        <p className="truncate font-mono text-xs text-fg" title={file.path}>
          {file.path}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {formatSize(file.size)} — {t.skills.binary}
        </p>
      </div>
    );
  }
  if (file.path !== SKILL_DOC) {
    return (
      <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-rule bg-bg px-3 py-2 font-mono text-xs text-fg">
        {content}
      </pre>
    );
  }
  const doc = split(content);
  return (
    <div className="text-reading-fg">
      {doc.frontmatter && (
        <FrontmatterPanel rows={doc.frontmatter} label={t.skills.frontmatter} />
      )}
      <MessageContent content={doc.body} />
    </div>
  );
}

/**
 * The editor, on `markdown-editor.tsx`'s model: a field, a live preview beside it, and
 * a footer. Not that component itself -- it is a full-screen modal that composes a
 * chat message and ends in Send -- but the same shape, inside the pane.
 *
 * THE NAME IS FIXED ONCE THE SKILL EXISTS. The directory name is the skill's identity
 * and the frontmatter has to agree with it (backend FR-4), so renaming is
 * create-then-delete and the member does it themselves.
 *
 * ONLY `SKILL.md` IS HELD TO THAT GRAMMAR. A template has no frontmatter and is not
 * supposed to, so over a supporting file there is no name field, no validation and no
 * markdown preview -- the proxy validates on the same condition, by path (backend
 * FR-5), and a check only this side made would refuse a write the server would take.
 */
function SkillEditor({
  editor,
  setEditor,
  existing,
  backTo,
  showPreview,
  setShowPreview,
  saving,
  saved,
  conflict,
  onReload,
  onCancel,
  onSave,
  t,
  c,
  errs,
}: {
  editor: Editor;
  setEditor: (next: Editor) => void;
  existing: MemberSkill[];
  backTo: string;
  showPreview: boolean;
  setShowPreview: (next: boolean) => void;
  saving: boolean;
  saved: boolean;
  conflict: boolean;
  onReload: () => void;
  onCancel: () => void;
  onSave: () => void;
  t: typeof chatCopy.en;
  c: typeof commonCopy.en;
  errs: typeof errorCopy.en;
}) {
  const isDoc = editor.path === SKILL_DOC;
  const problem = isDoc ? skillProblem(editor.name, editor.body) : null;
  // A name already on the listing, whatever layer it belongs to. Catches the
  // operator's reserved names without keeping a second copy of that list here: the
  // proxy refuses them and so does anything the member can already see.
  const taken =
    editor.creating && existing.some((s) => s.name === editor.name);
  const doc = split(editor.body);

  function rename(next: string) {
    // The two have to agree, and asking the member to type the name twice is a
    // rejection waiting to happen. Re-seeded only while the body is still exactly
    // the seed, so this can never overwrite a word they wrote.
    const body = editor.body === seedSkill(editor.name) ? seedSkill(next) : editor.body;
    setEditor({ ...editor, name: next, body });
  }

  return (
    <div className="flex flex-col gap-3">
      <BackRow
        label={backTo}
        name={isDoc ? editor.name : editor.path}
        onBack={onCancel}
      >
        {/* The preview renders markdown, so it is offered over the skill and not over
            a template: a preview of a shell script is the script with its comments
            promoted to headings. */}
        {isDoc && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={showPreview ? t.skills.hidePreview : t.skills.showPreview}
            title={showPreview ? t.skills.hidePreview : t.skills.showPreview}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          </IconButton>
        )}
      </BackRow>

      {isDoc ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {t.skills.nameLabel}
          </span>
          <Input
            value={editor.name}
            readOnly={!editor.creating}
            placeholder={t.skills.namePlaceholder}
            onChange={(e) => rename(e.target.value)}
          />
          {editor.creating && (
            <span className="text-[11px] text-fg-muted">{t.skills.nameFixed}</span>
          )}
        </label>
      ) : (
        <p className="text-xs text-fg-muted">{t.skills.supportingFile}</p>
      )}

      <div className="rounded-lg border border-rule bg-bg p-2">
        <Textarea
          value={editor.body}
          rows={16}
          placeholder={isDoc ? t.skills.bodyPlaceholder : t.skills.filePlaceholder}
          onChange={(e) => setEditor({ ...editor, body: e.target.value })}
          className="font-mono"
        />
      </div>

      {isDoc && showPreview && (
        <div className="rounded-lg border border-rule bg-surface px-3 py-2 text-reading-fg">
          {doc.frontmatter && (
            <FrontmatterPanel rows={doc.frontmatter} label={t.skills.frontmatter} />
          )}
          <MessageContent content={doc.body} />
        </div>
      )}

      {conflict && (
        <Alert severity="warning">
          <span className="flex flex-wrap items-center gap-2">
            {/* Worded per FILE when it is one: the version the 409 is about is that
                file's, and telling a member their SKILL.md changed when a template did
                would send them to re-read the wrong thing. */}
            {isDoc ? t.skills.conflictTitle : t.skills.conflictFile}
            <Button variant="tonal" size="sm" onClick={onReload}>
              {t.skills.conflictReload}
            </Button>
          </span>
        </Alert>
      )}
      {taken && <Alert severity="error">{errs.skill_name_taken}</Alert>}
      {problem && <Alert severity="info">{t.skills.problems[problem]}</Alert>}
      {saved && !problem && <Alert severity="info">{t.skills.saved}</Alert>}

      <div className="flex justify-end gap-2">
        <Button variant="text" size="sm" onClick={onCancel}>
          {c.actions.cancel}
        </Button>
        <Button
          variant="filled"
          size="sm"
          disabled={saving || problem !== null || taken}
          onClick={onSave}
        >
          {saving ? t.skills.saving : c.actions.save}
        </Button>
      </div>
    </div>
  );
}

/**
 * The editor state for a file that already exists, or NOTHING when there is nothing to
 * edit.
 *
 * Seeded from the FILE read and never from a listing row: the row's `modifiedAt` can
 * be a refresh old, and saving with a stale one is a 409 the member did nothing to
 * cause. Per file, because that is how the proxy versions them.
 *
 * THE BINARY REFUSAL LIVES HERE, and not only on the control that hides the pencil,
 * because this is the one place editor state is built and three paths reach it: the
 * row's pencil, the detail view's, and the re-read after a 409 — and that last one can
 * hand back a file that was text when the member opened it and is an image now,
 * because the agent's own evolution rewrote it. `binary` means the proxy withheld the
 * bytes and sent `content: ""`, so an editor over one saves an empty file onto a PNG
 * and reports it as a success.
 */
function editorFor(name: string, file: SkillFile, content: string): Editor | null {
  if (file.binary) return null;
  return { name, path: file.path, body: content, modifiedAt: file.modifiedAt, creating: false };
}
