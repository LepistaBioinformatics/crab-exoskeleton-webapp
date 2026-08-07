"use client";

import { useState } from "react";
import { ChevronLeft, FolderPlus, Folders, Pencil, Trash2 } from "lucide-react";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
} from "@/lib/projects";
import type { Workspace } from "./fragment";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionHeader, SectionLabel } from "./sidebar-section";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

// Projects, at the top of the CHATS sidebar.
//
// It lives here and not in the workspace panel because a project is a way of
// separating conversations, and the list it separates is right below it. It has
// two states, never both at once:
//
//   browsing none  -> the projects are listed, and the chats below are the ones
//                     belonging to no project
//   inside one     -> the project is named with a way back, and the chats below
//                     are only that project's
//
// The drill-in is the whole point: a project's conversations are a separate
// list, not a filter applied to a shared one.

interface Draft {
  editing: Project | null;
  name: string;
  instructions: string;
}

const EMPTY_DRAFT: Draft = { editing: null, name: "", instructions: "" };

export default function ProjectsBar({
  workspace,
  browsedProject,
  onBrowse,
  open,
  onToggle,
}: {
  workspace: Workspace;
  /** The project whose conversations are listed below, or null for the global list. */
  browsedProject: string | null;
  onBrowse: (projectId: string | null) => void;
  /** Section fold, owned by the sidebar so all three sections are governed alike. */
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);

  // Shared with the collapsed rail, which lists the same projects as shortcuts. Two
  // fetches would drift the moment this section created or deleted one.
  const { projects, error: loadError, reload: load } = useProjects(workspace);
  // Write failures are this section's own; read failures come from the hook. Kept
  // apart so a failed save does not read as the list being unavailable.
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [restartPending, setRestartPending] = useState(false);

  // An agent whose harness has no projects renders NOTHING — not an error and
  // not an empty section. The feature simply does not exist there, and a
  // permanent explanatory box above every chat list would be noise.
  if (loadError === "projects_unsupported") return null;

  const current = projects.find((p) => p.id === browsedProject) ?? null;

  async function save() {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (draft.editing) {
        // Only what changed: upstream leaves an absent key alone, so sending
        // both would blank the instructions on a plain rename.
        const patch: { name?: string; instructions?: string } = {};
        if (draft.name !== draft.editing.name) patch.name = draft.name;
        if (draft.instructions !== draft.editing.instructions) {
          patch.instructions = draft.instructions;
        }
        if (Object.keys(patch).length > 0) {
          await updateProject(workspace, draft.editing.id, patch);
        }
      } else {
        const created = await createProject(workspace, draft.name, draft.instructions);
        setRestartPending(true);
        onBrowse(created.id);
      }
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setError(null);
    try {
      await deleteProject(workspace, target.id);
      setRestartPending(true);
      // Leaving the project you were inside: its conversations are gone, so the
      // list below has to stop claiming to show them.
      if (browsedProject === target.id) onBrowse(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    }
  }

  const form = draft && (
    <form
      className="mx-2 flex flex-col gap-2 rounded-lg border border-brand/40 bg-elevated p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        inputSize="sm"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder={t.projects.namePlaceholder}
        aria-label={t.projects.nameLabel}
        autoFocus
        required
      />
      <Textarea
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        placeholder={t.projects.instructionsPlaceholder}
        aria-label={t.projects.instructionsLabel}
        rows={4}
      />
      <p className="text-xs text-muted">{t.projects.instructionsHint}</p>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="text" size="sm" onClick={() => setDraft(null)}>
          {t.projects.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={saving || !draft.name.trim()}>
          {saving ? t.projects.saving : t.projects.save}
        </Button>
      </div>
    </form>
  );

  const notices = (
    <>
      {(error ?? loadError) && (
        <div className="px-2 pb-2">
          <Alert severity="error">{errorText(err, (error ?? loadError)!)}</Alert>
        </div>
      )}
      {restartPending && (
        <div className="px-2 pb-2">
          <Alert severity="info">{t.projects.restartNotice}</Alert>
        </div>
      )}
    </>
  );

  const toggleLabel = (open ? t.sections.collapse : t.sections.expand).replace(
    "{name}",
    t.projects.title,
  );

  // --- inside a project ----------------------------------------------------
  if (current) {
    return (
      <div className="flex min-h-0 shrink-0 flex-col">
        {/* NO fold in here — `onToggle` is deliberately not passed. Everything this
            section shows while you are inside a project (its name, its instructions) is
            the CONTEXT for the chat list below; "show me less of the project I am in"
            is not a thing to want, and a chevron offering it would be a control with
            one real state. Folding belongs to the project LIST, which is a list you
            might want out of the way. */}
        <SectionHeader
          label={
            <>
              {/* LEFT of the name, where every other back control in this app sits --
                  the workspace row's, the graph detail's. A "back" on the right reads
                  as an action performed ON the thing named, not as leaving it.

                  It is also the only way out while you are inside a project: the
                  workspace control up in section 1 is hidden here, so leaving happens
                  one level at a time. */}
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={t.projects.backToProjects}
                title={t.projects.backToProjects}
                onClick={() => onBrowse(null)}
              >
                <ChevronLeft size={15} aria-hidden />
              </IconButton>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-fg" title={current.name}>
                  {current.name}
                </span>
                <span className="truncate text-xs text-muted">{t.projects.title}</span>
              </span>
            </>
          }
          actions={
            <>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={t.projects.edit}
                title={t.projects.edit}
                onClick={() =>
                  setDraft({
                    editing: current,
                    name: current.name,
                    instructions: current.instructions,
                  })
                }
              >
                <Pencil size={15} aria-hidden />
              </IconButton>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={t.projects.delete}
                title={t.projects.delete}
                onClick={() => setPendingDelete(current)}
              >
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </>
          }
        />
        <div className="min-h-0 overflow-auto pb-2">
          {current.instructions && !draft && (
            <p className="px-3 pb-1 text-xs text-muted line-clamp-2">
              {current.instructions}
            </p>
          )}
          {form}
          {notices}
        </div>
        <DeleteDialog
          target={pendingDelete}
          t={t}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    );
  }

  // --- the project list ----------------------------------------------------
  return (
    // A column with its own scroll, so the box the splitter sizes actually scrolls at
    // that size instead of pushing the chats section off the panel.
    <div className="flex min-h-0 flex-col">
      <SectionHeader
        open={open}
        onToggle={onToggle}
        toggleLabel={toggleLabel}
        label={<SectionLabel>{t.projects.title}</SectionLabel>}
        actions={
          // Creating adds to the body, so it goes away with it -- the counterpart of
          // the chats section hiding its list controls while folded.
          open ? (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t.projects.create}
              title={t.projects.create}
              onClick={() => setDraft(EMPTY_DRAFT)}
            >
              <FolderPlus size={16} aria-hidden />
            </IconButton>
          ) : null
        }
      />

      {open && (
        <div className="min-h-0 flex-1 overflow-auto pb-2">
          {form}
          {notices}

          {projects.length === 0 && !draft ? (
            <p className="px-3 pb-1 text-xs text-muted">{t.projects.noneHint}</p>
          ) : (
            <ul className="px-1">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onBrowse(p.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      "hover:bg-elevated",
                    )}
                  >
                    <Folders size={14} className="shrink-0 text-fg-muted" aria-hidden />
                    <span className="truncate text-sm text-fg">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DeleteDialog
        target={pendingDelete}
        t={t}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function DeleteDialog({
  target,
  t,
  onConfirm,
  onCancel,
}: {
  target: Project | null;
  t: ChatDict;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={target !== null}
      title={t.projects.deleteConfirmTitle}
      message={t.projects.deleteConfirmBody}
      confirmLabel={t.projects.deleteConfirm}
      cancelLabel={t.projects.cancel}
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
