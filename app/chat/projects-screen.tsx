"use client";

import { useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import { FolderPlus, Folders, House, Pencil, Trash2 } from "lucide-react";
import {
  createProject,
  deleteProject,
  updateProject,
  type Project,
} from "@/lib/projects";
import { useProjects } from "./use-projects";
import type { Workspace } from "./fragment";
import DestinationScreen from "./destination-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { BCP47 } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/context";

// The projects destination: the whole centre of the screen, one card per project.
//
// This replaces the list that sat at the top of the chats sidebar. That list was built
// on the claim that a project is a way of separating conversations, so it belonged
// above the conversations it separated. The claim this screen is built on instead: a
// project is a PLACE — its own workspace directory, its own memory, its own files, its
// own scheduled tasks — and the chats inside it are one of the things it holds rather
// than its definition. A place is entered, and entering it fills the pane you read in.
//
// It owns its own DestinationScreen rather than being wrapped in one by the shell: the
// create control belongs to the screen that holds the draft state, and an agent whose
// proxy has no projects must render NOTHING — a frame with a heading over an empty
// column is still a screen, and the point of FR-2.4 is that there is no screen.

interface Draft {
  editing: Project | null;
  name: string;
  instructions: string;
}

const EMPTY_DRAFT: Draft = { editing: null, name: "", instructions: "" };

// The project you are standing in is marked rather than hidden or moved to the front:
// FR-1.5 reaches this screen with `p` still set, and a member who asked to see the list
// is asking where the others are, not to be told they are somewhere.
// A ROW, NOT A CARD. This was a three-column grid of tall cards at the frame's full
// 6xl, which is a shape for browsing a gallery: it spread a handful of projects --
// most members have four or five -- across a band wider than anything else in the
// app, and each one reserved height for a blurb that is usually one line or none.
//
// A list reads top to bottom in creation order, which is the order the request asks
// for, and it sits in the same column the conversation does. `pr-16` stays: the edit
// and delete controls are absolutely positioned over the right end.
const card = cva(
  [
    "flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3 pr-16 text-left",
    "transition-colors hover:border-accent/60 hover:bg-elevated",
  ],
  {
    variants: {
      current: { true: "border-accent/60", false: "border-rule-strong" },
    },
    defaultVariants: { current: false },
  },
);

/**
 * The card's date, or null when there is none to show.
 *
 * `createdAt` is the only date `lib/projects.ts` carries, and it is the empty string
 * when the proxy sent no `created_at`. Null rather than a placeholder: a card with a
 * blank date slot reads as a date that failed to load, and inventing a "last active"
 * would mean showing a number nothing in this stack tracks (DEC-11).
 */
function formatCreated(createdAt: string, tag: string): string | null {
  if (!createdAt) return null;
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString(tag, { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProjectsScreen({
  workspace,
  browsedProject,
  onBrowse,
}: {
  workspace: Workspace;
  /** The project the member is currently inside, or null outside one. */
  browsedProject: string | null;
  onBrowse: (projectId: string | null) => void;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const tag = BCP47[useLocale().locale];

  // The shared hook, not a local fetch: the sidebar hides its Projects row on the same
  // `projects_unsupported` this screen goes silent for, and two fetches would let the
  // row and the screen disagree the moment one of them created or deleted something.
  const { projects: unsorted, error: loadError } = useProjects(workspace);
  // NEWEST FIRST. The proxy returns them in whatever order it walked the directory,
  // which is near enough to creation order to look deliberate and not near enough to
  // be -- the same trap the mangrove's reading had.
  //
  // `createdAt` is the empty string when the proxy sent no `created_at`, and those
  // sort LAST rather than first: an unknown date is not "the oldest", and putting
  // them at the top would give the least-known entries the most prominent place.
  const projects = useMemo(
    () =>
      [...unsorted].sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return a.createdAt ? -1 : b.createdAt ? 1 : 0;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [unsorted],
  );
  // Write failures are this screen's own; read failures come from the hook. Kept apart
  // so a failed save does not read as the list being unavailable.
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [restartPending, setRestartPending] = useState(false);

  // An agent whose harness cannot have projects at all renders NOTHING — not an error
  // and not an empty state with a create button that cannot work. Only an older proxy
  // reports this, and a permanent explanatory screen would be a destination whose only
  // content is an apology.
  if (loadError === "projects_unsupported") return null;

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
      // No reload here: lib/projects announces its own writes now, and this
      // screen's copy of the list subscribes like every other. Re-reading here as
      // well would be the second fetch of the same list for one create.
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
      // Leaving the project you were inside: its conversations are gone, so nothing
      // that scopes itself to `p` can go on claiming to show them. This is the one
      // place the screen clears `p` — everywhere else FR-1.5 preserves it.
      if (browsedProject === target.id) onBrowse(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    }
  }

  return (
    <DestinationScreen
      title={t.projects.title}
      // The conversation's own measure. `full` was for a grid that wanted the room;
      // a list of five rows in a 6xl column is five short lines stranded in a very
      // wide band.
      width="reading"
      actions={
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t.projects.create}
          title={t.projects.create}
          onClick={() => setDraft(EMPTY_DRAFT)}
        >
          <FolderPlus size={18} aria-hidden />
        </IconButton>
      }
    >
      <p className="text-sm text-fg-muted">{t.projects.hint}</p>

      {(error ?? loadError) && (
        <div className="mt-4">
          <Alert severity="error">{errorText(err, (error ?? loadError)!)}</Alert>
        </div>
      )}
      {restartPending && (
        <div className="mt-4">
          <Alert severity="info">{t.projects.restartNotice}</Alert>
        </div>
      )}

      {draft && (
        <form
          className="mt-4 flex max-w-xl flex-col gap-2 rounded-xl border border-rule bg-elevated p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="font-display text-base font-semibold text-fg">
            {draft.editing ? t.projects.editTitle : t.projects.createTitle}
          </h2>
          <Input
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
      )}

      {projects.length === 0 && !draft ? (
        <div className="mt-6">
          <p className="text-sm text-fg">{t.projects.none}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.projects.noneHint}</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {/* THE WAY OUT OF A PROJECT, and until 2026-09-12 there was none.
              Every control led further in: the sidebar entered one, the breadcrumb's
              project segment led to this list while keeping `p` (FR-1.5, and still
              right), and nothing at all named the agent's own workspace. A member who
              entered Legal stayed in Legal.

              A card rather than a control in the bar, because leaving is choosing where
              to be next, and this grid is already the list of places to be. It sits
              FIRST for the same reason the agent's own workspace is where a member
              starts: the projects are what they added to it.

              `onBrowse(null)` is the same write a project card makes, with null — so
              `sid` and `msg` are dropped exactly as they are on the way in, and `v` with
              them, which is what lands the member in the workspace instead of back on
              this list. */}
          <li className="relative">
            <button
              type="button"
              onClick={() => onBrowse(null)}
              aria-current={browsedProject === null ? "true" : undefined}
              className={card({ current: browsedProject === null })}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <House size={16} className="shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0 truncate font-display text-base font-semibold text-fg">
                  {t.projects.mainAgent}
                </span>
              </span>
              {browsedProject === null && (
                <span className="w-fit rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-fg">
                  {t.projects.current}
                </span>
              )}
              <span className="line-clamp-3 text-sm text-fg-muted">
                {t.projects.mainAgentHint}
              </span>
            </button>
          </li>
          {projects.map((p) => {
            const here = p.id === browsedProject;
            const created = formatCreated(p.createdAt, tag);
            return (
              // The edit and delete controls sit BESIDE the card in the DOM, not
              // inside it: a button nested in a button is invalid, and the browser
              // that tolerates it still fires both handlers, so pressing Delete would
              // also enter the project it is about to remove.
              <li key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => onBrowse(p.id)}
                  aria-current={here ? "true" : undefined}
                  className={card({ current: here })}
                >
                  <Folders size={16} className="shrink-0 text-fg-muted" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-display text-sm font-semibold text-fg">
                        {p.name}
                      </span>
                      {here && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-fg">
                          {t.projects.current}
                        </span>
                      )}
                    </span>
                    {/* ONE LINE. A row's job is to be scanned, and a project's
                        instructions are read inside it rather than from the list. */}
                    {p.instructions && (
                      <span className="min-w-0 truncate text-xs text-fg-muted">
                        {p.instructions}
                      </span>
                    )}
                  </span>
                  {/* At the END of the row now rather than pinned to a card's floor.
                      Hidden on a phone, where the row has no width to spare and the
                      date is the least of the three things on it. */}
                  {created && (
                    <span className="hidden shrink-0 text-xs text-muted sm:block">{created}</span>
                  )}
                </button>
                <div className="absolute right-2 top-2 flex items-center gap-0.5">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label={t.projects.edit}
                    title={t.projects.edit}
                    onClick={() =>
                      setDraft({
                        editing: p,
                        name: p.name,
                        instructions: p.instructions,
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
                    onClick={() => setPendingDelete(p)}
                  >
                    <Trash2 size={15} aria-hidden />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <DeleteDialog
        target={pendingDelete}
        t={t}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </DestinationScreen>
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
