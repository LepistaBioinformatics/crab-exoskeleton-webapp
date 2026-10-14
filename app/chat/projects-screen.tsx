"use client";

import { useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import { CircleCheck, FolderPlus, Folders, House, Pencil, Trash2 } from "lucide-react";
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

// The projects destination: the whole centre of the screen, every project the agent has.
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
//
// WHERE YOU ARE STANDING, said three ways at once: a heavier edge (the ring adds a
// pixel without moving the layout the way a thicker border would), the raised tone,
// and the solid badge. Any one of them alone was too quiet to find in a screen of
// look-alike cards -- the old marker was a 15% tint on an 11px label.
const CURRENT = "border-rule-emphasis ring-1 ring-rule-emphasis bg-elevated";

// THREE CARDS, THEN A TABLE (picker-subscription-first-and-project-cards FR-2). This
// screen has been a grid of cards and then a list of rows; it is now both, split by
// recency. The cards are the places a member most likely wants next -- Global chats,
// always, and the two newest projects -- so they get the room; everything older is a
// row, scanned rather than browsed, in the agent picker's shape.
const card = cva(
  [
    "flex h-full w-full flex-col gap-1.5 rounded-xl border p-4 text-left",
    "transition-colors hover:border-rule-emphasis hover:bg-elevated",
  ],
  {
    variants: {
      current: { true: CURRENT, false: "border-rule-strong bg-surface" },
      // Room under the edit and delete controls, which sit absolutely over the
      // card's top-right corner. Global chats has neither.
      actions: { true: "pr-20", false: "" },
      dashed: { true: "edge-dashed-open", false: "" },
    },
    defaultVariants: { current: false, actions: false, dashed: false },
  },
);

// The agent picker's row, with `pr-16` for the controls over its right end.
const row = cva(
  [
    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 pr-16 text-left",
    "transition-colors hover:border-rule-emphasis hover:bg-elevated",
  ],
  {
    variants: {
      current: { true: CURRENT, false: "border-rule-strong bg-surface" },
    },
    defaultVariants: { current: false },
  },
);

// Stacked in a narrow pane, columns from `@xl` (36rem of PANE) -- workspace-grid.tsx's
// cells, read off the container rather than the window.
const cells = "flex min-w-0 flex-1 flex-col gap-0.5 @xl:flex-row @xl:items-center @xl:gap-3";

// How many projects get a card beside Global chats.
const CARDED = 2;

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

  function edit(p: Project) {
    setDraft({ editing: p, name: p.name, instructions: p.instructions });
  }

  return (
    <DestinationScreen
      title={t.projects.title}
      // `full` again: three cards side by side and a three-column table are the shape
      // it exists for. It was `reading` while this was a one-column list.
      width="full"
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

      {/* A NEW project's form only. An edit opens over the card it edits instead -- see
          EditPopover -- so the member never has to look away from the project they
          pressed the pencil on. */}
      {draft && !draft.editing && (
        <DraftForm
          draft={draft}
          saving={saving}
          t={t}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
          className="mt-4 max-w-xl border border-rule bg-elevated"
        />
      )}

      {/* THE PANE'S WIDTH, NOT THE WINDOW'S. This screen sits in the centre pane beside
          the sidebar, so a `sm:` breakpoint read a 1280px window while the pane had
          600px, and the three cards stayed three abreast however narrow it got. The
          cards fit as many 15rem columns as the pane holds (three, then two, then one),
          and the table switches from stacked rows to columns on the container --
          mangrove-screen's `@container` rail is the precedent. */}
      <div className="@container">
        <ul className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
          {/* THE WAY OUT OF A PROJECT, and until 2026-09-12 there was none.
              Every control led further in: the sidebar entered one, the breadcrumb's
              project segment led to this list while keeping `p` (FR-1.5, and still
              right), and nothing at all named the agent's own workspace. A member who
              entered Legal stayed in Legal.

              A card rather than a control in the bar, because leaving is choosing where
              to be next, and this screen is already the list of places to be. It sits
              FIRST, and always renders, for the same reason the agent's own workspace is
              where a member starts: the projects are what they added to it.

              `onBrowse(null)` is the same write a project card makes, with null — so
              `sid` and `msg` are dropped exactly as they are on the way in, and `v` with
              them, which is what lands the member in the workspace instead of back on
              this list. */}
          <li className="relative">
            <button
              type="button"
              onClick={() => onBrowse(null)}
              aria-current={browsedProject === null ? "true" : undefined}
              // DASHED, OPEN AND NEUTRAL: it is not a project, and the edge is what says so
              // at a glance -- the place every project was split off from, drawn as an
              // outline of one. `edge-dashed-open` in globals.css, for the dash spacing
              // `border-dashed` cannot set.
              className={card({ current: browsedProject === null, dashed: true })}
            >
              <span className="flex min-w-0 items-center gap-2">
                <House
                  size={16}
                  className={`shrink-0 ${browsedProject === null ? "text-accent" : "text-fg-muted"}`}
                  aria-hidden
                />
                <span className="min-w-0 truncate font-display text-base font-semibold text-fg">
                  {t.projects.mainAgent}
                </span>
                {browsedProject === null && <CurrentBadge t={t} />}
              </span>
              <span className="line-clamp-2 text-sm text-fg-muted">
                {t.projects.mainAgentHint}
              </span>
            </button>
          </li>
          {projects.slice(0, CARDED).map((p) => {
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
                  className={card({ current: here, actions: true })}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folders
                      size={16}
                      className={`shrink-0 ${here ? "text-accent" : "text-fg-muted"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate font-display text-base font-semibold text-fg">
                      {p.name}
                    </span>
                    {here && <CurrentBadge t={t} />}
                  </span>
                  {p.instructions && (
                    <span className="line-clamp-2 text-sm text-fg-muted">{p.instructions}</span>
                  )}
                  {/* On the card's floor, so three cards of different blurbs still put
                      their dates on one line. */}
                  {created && <span className="mt-auto text-xs text-fg-muted">{created}</span>}
                </button>
                <RowActions project={p} t={t} onEdit={edit} onDelete={setPendingDelete} />
                {draft?.editing?.id === p.id && (
                  <EditPopover
                    draft={draft}
                    saving={saving}
                    t={t}
                    onChange={setDraft}
                    onSave={() => void save()}
                    onCancel={() => setDraft(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {projects.length === 0 && !draft && (
          <div className="mt-4">
            <p className="text-sm text-fg">{t.projects.none}</p>
            <p className="mt-1 text-sm text-fg-muted">{t.projects.noneHint}</p>
          </div>
        )}

        {/* No table at all until there is a project past the cards: an empty table is a
            header over nothing, which reads as a list that failed to load. */}
        {projects.length > CARDED && (
          <>
            {/* The column names, and only where there ARE columns -- below `sm` a header
                over a stack would label its first line and nothing else. */}
            <div
              aria-hidden
              className="mt-6 hidden items-center gap-3 px-4 pr-16 text-xs font-medium uppercase tracking-wide text-fg-muted @xl:flex"
            >
              {/* The folder glyph's footprint, so the first name sits over the name. */}
              <span className="w-4 shrink-0" />
              <span className={cells}>
                <span className="min-w-0 flex-1 truncate">{t.projects.columns.name}</span>
                <span className="min-w-0 flex-[2] truncate">
                  {t.projects.columns.instructions}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.projects.columns.created}</span>
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {projects.slice(CARDED).map((p) => {
                const here = p.id === browsedProject;
                const created = formatCreated(p.createdAt, tag);
                return (
                  <li key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => onBrowse(p.id)}
                      aria-current={here ? "true" : undefined}
                      className={row({ current: here })}
                    >
                      <Folders
                        size={16}
                        className={`shrink-0 ${here ? "text-accent" : "text-fg-muted"}`}
                        aria-hidden
                      />
                      <span className={cells}>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 truncate font-display text-sm font-semibold text-fg">
                            {p.name}
                          </span>
                          {here && <CurrentBadge t={t} />}
                        </span>
                        {/* The cells render even when empty, so the columns stay columns. */}
                        <span className="min-w-0 flex-[2] truncate text-xs text-fg-muted">
                          {p.instructions}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                          {created}
                        </span>
                      </span>
                    </button>
                    <RowActions project={p} t={t} onEdit={edit} onDelete={setPendingDelete} />
                    {draft?.editing?.id === p.id && (
                      <EditPopover
                        draft={draft}
                        saving={saving}
                        t={t}
                        onChange={setDraft}
                        onSave={() => void save()}
                        onCancel={() => setDraft(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <DeleteDialog
        target={pendingDelete}
        t={t}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </DestinationScreen>
  );
}

interface DraftProps {
  draft: Draft;
  saving: boolean;
  t: ChatDict;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}

function DraftForm({
  draft,
  saving,
  t,
  onChange,
  onSave,
  onCancel,
  className,
}: DraftProps & { className: string }) {
  return (
    <form
      className={`flex flex-col gap-2 rounded-xl p-4 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <h2 className="font-display text-base font-semibold text-fg">
        {draft.editing ? t.projects.editTitle : t.projects.createTitle}
      </h2>
      <Input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder={t.projects.namePlaceholder}
        aria-label={t.projects.nameLabel}
        autoFocus
        required
      />
      <Textarea
        value={draft.instructions}
        onChange={(e) => onChange({ ...draft, instructions: e.target.value })}
        placeholder={t.projects.instructionsPlaceholder}
        aria-label={t.projects.instructionsLabel}
        rows={4}
        className="field rounded-lg px-3 py-2"
      />
      <p className="text-xs text-fg-muted">{t.projects.instructionsHint}</p>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="text" size="sm" onClick={onCancel}>
          {t.projects.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={saving || !draft.name.trim()}>
          {saving ? t.projects.saving : t.projects.save}
        </Button>
      </div>
    </form>
  );
}

/**
 * The edit form, suspended over the card or row being edited.
 *
 * A MINI MODAL rather than the form at the top of the screen it used to share with
 * create: an edit is about one project, and the form opening a screen-height away from
 * the pencil that asked for it made the member hunt for what they had just opened. It
 * hangs from the bottom edge of its own card, above everything after it.
 *
 * The backdrop is transparent and only there to be clicked: a click anywhere else
 * cancels, as Escape does, which is what makes it modal without dimming the screen
 * around a form this small.
 */
function EditPopover(props: DraftProps) {
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-30" onClick={props.onCancel} />
      <div
        role="dialog"
        aria-label={props.t.projects.editTitle}
        className="absolute inset-x-0 top-full z-40 mt-2 min-w-72"
      >
        <DraftForm {...props} className="border border-rule-strong bg-surface shadow-elevated" />
      </div>
    </>
  );
}

function CurrentBadge({ t }: { t: ChatDict }) {
  return (
    // A solid accent fill: this is a state, not an edge, so it may carry the accent
    // the border tokens gave up.
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
      <CircleCheck size={12} aria-hidden />
      {t.projects.current}
    </span>
  );
}

function RowActions({
  project,
  t,
  onEdit,
  onDelete,
}: {
  project: Project;
  t: ChatDict;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  return (
    <div className="absolute right-2 top-2 flex items-center gap-0.5">
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t.projects.edit}
        title={t.projects.edit}
        onClick={() => onEdit(project)}
      >
        <Pencil size={15} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t.projects.delete}
        title={t.projects.delete}
        onClick={() => onDelete(project)}
      >
        <Trash2 size={15} aria-hidden />
      </IconButton>
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
