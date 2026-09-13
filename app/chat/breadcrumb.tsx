"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cva } from "class-variance-authority";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { deleteConversation, renameConversation } from "@/lib/chatSession";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Crumb } from "./crumbs";
import { chatCopy } from "@/lib/i18n/chat";
import { commonCopy } from "@/lib/i18n/common";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { useT } from "@/lib/i18n/context";

// WHERE THE MEMBER IS, in one line across the top of the shell (FR-3).
//
// It replaces the chat view's own header, which named the subscription and the agent
// while the sidebar separately named the project. Those are one location — a chat IN a
// project — and reading it meant looking at two opposite corners of the screen.
//
// The segments themselves are decided by `crumbs.ts`, which is React-free so the
// presence rules can be tested without mounting a bar. This file is only the painting
// and the one control that hangs off the end of it, and it takes the last crumb's
// linklessness as given: `buildCrumbs` strips `go` from the last segment, and a bar that
// added one back would be a control that looks like it goes somewhere and does not.
//
// The menu's positioning — portal to <body>, capture the trigger's rect, nudge back
// inside the viewport — is COPIED from `app/admin/breadcrumb.tsx`, not shared with it.
// That component's crumbs are the admin column model's; generalising one component over
// both would couple two navigation models that have no reason to move together.

const segment = cva(
  [
    "flex min-h-11 min-w-0 items-center rounded-lg px-2 text-sm",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  ],
  {
    variants: {
      here: {
        true: "font-semibold text-fg",
        false: "font-medium text-fg-muted hover:bg-elevated hover:text-fg",
      },
    },
    defaultVariants: { here: false },
  },
);

// Below `md` this bar shares the top row with the hamburger the shell renders, and two
// segments is what fits. The ones kept are the TRAILING ones (FR-3.5): a member knows
// which agent they signed into; what they need on a phone is the thing they are
// standing on and the one step back from it.
const MOBILE_TAIL = 2;

export default function Breadcrumb({
  crumbs,
  sessionId,
  onChanged,
  onDeleted,
}: {
  /** Already built by `buildCrumbs`. The last one never has `go` — it is where you are. */
  crumbs: Crumb[];
  /**
   * The conversation the last crumb names, when it names one. Null when the leaf is the
   * projects screen or when no conversation is open: the chevron menu acts on a
   * conversation, so with none there is nothing for it to do and it is not rendered.
   *
   * An open workspace pane does NOT null it. The pane is beside the conversation, not
   * instead of it, so the leaf still names the transcript and the menu still acts on it.
   */
  sessionId: string | null;
  /** A rename landed; the caller re-reads the conversation list. */
  onChanged: () => void;
  /** The conversation was deleted; the caller navigates away from it. */
  onDeleted: () => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Both hold the conversation they act on rather than a boolean, the way the sidebar's
  // `editingId` and `deletingId` do: the member can navigate while a dialog is up, and an
  // id says which conversation the pending action was aimed at.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((focus = false) => {
    setMenu(null);
    if (focus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close(true);
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as Node;
      // BOTH refs. The menu is portalled out of the bar, so `bar.contains(target)` is
      // false for a click on one of its own items — checking only the bar would close the
      // menu on mousedown and swallow the click that was choosing something.
      if (!bar.current?.contains(target) && !pop.current?.contains(target)) close();
    };
    // The position is captured once, so anything that moves the bar invalidates it.
    const onMove = () => close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [menu, close]);

  // Nudge the menu back inside the viewport once it has a measured width. The chevron
  // sits at the end of the path, so on a narrow screen it is exactly where a menu opened
  // at the trigger's left edge would run off the right one.
  useLayoutEffect(() => {
    if (!menu || !pop.current) return;
    const rect = pop.current.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 8);
    if (overflow > 0) pop.current.style.left = `${Math.max(8, menu.x - overflow)}px`;
  }, [menu]);

  // No crumbs is the agent grid, which names itself. An empty bar over it would be a
  // path to the screen already being looked at.
  if (crumbs.length === 0) return null;

  const leaf = crumbs[crumbs.length - 1];
  // Both are held only while the leaf is STILL the conversation the action was started
  // on. Navigating away mid-edit would otherwise leave the input sitting over a different
  // place's name, and the confirm dialog warning about deleting a conversation whose
  // title it no longer has — the id is captured and correct either way, but the member
  // would be reading the wrong name in the sentence asking them to be sure.
  const renaming = editing === sessionId ? editing : null;
  const pendingDelete = deleting === sessionId ? deleting : null;

  async function submitRename(id: string) {
    const title = draft.trim();
    if (!title) {
      setRenameError(t.history.titleEmpty);
      return;
    }
    try {
      await renameConversation(id, title);
      setEditing(null);
      setRenameError(null);
      onChanged();
    } catch (err) {
      setRenameError(errorText(e, err instanceof Error ? err.message : null));
    }
  }

  async function onDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteConversation(id);
      setDeleting(null);
      onDeleted();
    } catch (err) {
      setDeleteError(errorText(e, err instanceof Error ? err.message : null));
    }
  }

  return (
    <>
      <nav
        ref={bar}
        aria-label={t.shell.path}
        className="flex min-w-0 items-center gap-1 px-3 py-1"
      >
        {/* An ordered list, because the segments are a sequence and their order is the
            relationship. The `/` between them is decoration on top of that, which is why
            it is hidden rather than read out three times. */}
        <ol className="flex min-w-0 items-center gap-1">
          {crumbs.length > MOBILE_TAIL && (
            <li aria-hidden className="shrink-0 text-sm text-fg-muted md:hidden">…</li>
          )}
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li
                key={crumb.key}
                className={
                  "min-w-0 items-center gap-1 " +
                  // The elided ones are dropped from the layout below `md` rather than
                  // squeezed: a segment truncated to three characters names nothing.
                  (i >= crumbs.length - MOBILE_TAIL ? "flex" : "hidden md:flex")
                }
              >
                {i > 0 && <span aria-hidden className="shrink-0 text-sm text-fg-muted">/</span>}
                {crumb.go ? (
                  <button type="button" onClick={crumb.go} className={segment()}>
                    <span className="max-w-[12rem] truncate">{crumb.label}</span>
                  </button>
                ) : last && renaming ? (
                  <form
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      submitRename(renaming);
                    }}
                    className="flex min-w-0 flex-col gap-1 py-1"
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <Input
                        inputSize="sm"
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onKeyDown={(ev) => ev.key === "Escape" && setEditing(null)}
                        aria-label={t.history.renameAria}
                      />
                      <IconButton
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={c.actions.save}
                        title={c.actions.save}
                      >
                        <Check size={16} aria-hidden />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={c.actions.cancel}
                        title={c.actions.cancel}
                        onClick={() => setEditing(null)}
                      >
                        <X size={16} aria-hidden />
                      </IconButton>
                    </div>
                    {renameError && <p className="px-1 text-xs text-red-500">{renameError}</p>}
                  </form>
                ) : (
                  // `page`, not `true`: these are places within one document, and that is
                  // the value the spec reserves for exactly this.
                  <span aria-current={last ? "page" : undefined} className={segment({ here: true })}>
                    <span className="max-w-[12rem] truncate">{crumb.label}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Outside the list: it is not a place on the path, it is what can be done to the
            thing at the end of it. Absent with no conversation open — the actions it holds
            are a conversation's, so with none there is nothing for it to do. */}
        {sessionId && renaming === null && (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            aria-label={t.shell.crumbActions}
            title={t.shell.crumbActions}
            className="flex min-h-11 shrink-0 items-center rounded-lg px-1 text-fg-muted transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={(ev) => {
              if (menu) return close(true);
              const rect = ev.currentTarget.getBoundingClientRect();
              trigger.current = ev.currentTarget;
              setMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        )}
      </nav>

      {/* Portalled to <body>, for the reason ConfirmDialog already records: an in-tree
          overlay is at the mercy of every ancestor's clipping and stacking context. */}
      {menu &&
        sessionId &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            style={{ position: "fixed", left: menu.x, top: menu.y }}
            className="z-[60] w-max min-w-[10rem] rounded-lg border border-rule-strong bg-surface p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
              onClick={() => {
                close();
                setDraft(leaf.label);
                setRenameError(null);
                setEditing(sessionId);
              }}
            >
              <Pencil size={14} aria-hidden />
              {t.history.rename}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
              onClick={() => {
                close();
                setDeleteError(null);
                setDeleting(sessionId);
              }}
            >
              <Trash2 size={14} aria-hidden />
              {c.actions.delete}
            </button>
          </div>,
          document.body,
        )}

      {/* The same copy the sidebar's row asks with — one conversation deleted two ways
          should not read as two different warnings. `danger` is the one difference, and
          deliberate: the leaf is the conversation the member is READING, so the dialog is
          covering the thing it is about to remove. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={t.history.deleteTitle}
        message={deleteError ?? t.history.deleteMessage.replace("{title}", leaf.label)}
        confirmLabel={c.actions.delete}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
      />
    </>
  );
}
