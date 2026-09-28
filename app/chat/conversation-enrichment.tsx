"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import {
  setAlias,
  upsertTag,
  deleteTag,
  type Tag,
  type ConversationSummary,
} from "@/lib/chatSession";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { commonCopy } from "@/lib/i18n/common";
import { useT } from "@/lib/i18n/context";

// A tag drawn as a mini label: a tag icon + name + (required) value. When the
// tag carries a `metadata.color` it tints the border, a faint fill, and the
// text; otherwise it's neutral. Shared by the list and tree views.
export function TagChip({ tag }: { tag: Tag }) {
  const color = typeof tag.metadata.color === "string" && tag.metadata.color ? tag.metadata.color : undefined;
  const description = typeof tag.metadata.description === "string" ? tag.metadata.description : undefined;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] border border-rule-strong px-1.5 py-0.5 text-[11px] leading-none text-fg-muted"
      // Color is per-tag and dynamic, so it rides on `style` (border + faint fill
      // + text) rather than a className; the base classes cover the no-color case.
      style={color ? { borderColor: color, backgroundColor: `${color}1a`, color } : undefined}
      title={description ?? (tag.value ? `${tag.name}: ${tag.value}` : tag.name)}
    >
      <TagIcon size={10} className="shrink-0" aria-hidden />
      <span className="font-semibold uppercase tracking-[0.04em] opacity-70">{tag.name}</span>
      {tag.value && <span className="font-medium">{tag.value}</span>}
    </span>
  );
}

// Collapsed tag affordance: just a tag icon (with a count when there's more than
// one) so tags don't crowd the row; hovering (or focusing) expands the full
// chips in a small popover to the icon's lower-right. Shared by the browsing
// views.
export function TagCluster({
  tags,
  open = "down",
}: {
  tags: Tag[];
  /**
   * Which way the popover expands. `down` for rows in a scrollable list, which is every
   * caller but one; `up` for the background-turn dock, which is pinned to the bottom of
   * the viewport where a downward popover opens off-screen entirely.
   */
  open?: "down" | "up";
}) {
  const t = useT(chatCopy);
  if (tags.length === 0) return null;
  // Tint the mini-tag with the first colored tag's color (border + faint fill +
  // icon), mirroring TagChip; falls back to neutral when no tag carries a color.
  const color = tags
    .map((tg) => (typeof tg.metadata.color === "string" && tg.metadata.color ? tg.metadata.color : undefined))
    .find(Boolean);
  return (
    <span className="group/tags relative inline-flex shrink-0">
      <span
        tabIndex={0}
        aria-label={
          tags.length === 1 ? t.enrichment.tagsOne : t.enrichment.tagsOther.replace("{n}", String(tags.length))
        }
        className="inline-flex items-center gap-0.5 rounded-[4px] border border-rule-strong px-1 py-0.5 text-fg-muted transition-colors hover:border-brand hover:text-fg group-focus-within/tags:border-brand group-focus-within/tags:text-fg"
        style={color ? { borderColor: color, backgroundColor: `${color}1a`, color } : undefined}
      >
        <TagIcon size={11} className="shrink-0" aria-hidden />
        {tags.length > 1 && (
          <span className="text-[10px] font-semibold leading-none tabular-nums">{tags.length}</span>
        )}
      </span>
      {/* The pt-1/pb-1 (not mt/mb) bridges the icon-to-popover gap so moving the
          cursor into the popover keeps the group hovered. */}
      <span
        className={`absolute right-0 z-30 hidden group-hover/tags:block group-focus-within/tags:block ${
          open === "up" ? "bottom-full pb-1" : "top-full pt-1"
        }`}
      >
        <span className="flex max-w-[240px] flex-wrap justify-end gap-1 rounded-lg border border-rule-strong bg-elevated p-1.5 shadow-lg">
          {tags.map((tag) => (
            <TagChip key={tag.name} tag={tag} />
          ))}
        </span>
      </span>
    </span>
  );
}

// The per-conversation alias + tag editor, as a MODAL.
//
// It used to expand inline under the row it was opened from. That worked while the list
// was flat and stopped working when the tree became the only rendering: a row there is one
// VISIT of a conversation, opening the editor pushed the rest of the timeline down, and
// nothing in it said which of the threads on screen was being edited. The dialog names the
// conversation in its heading -- the same `alias || title` the list, the breadcrumb and the
// landing all use -- so that answer is on screen instead of inferred from where a panel
// happened to sprout.
//
// Local state for the alias draft and the new-tag fields; writes go through the
// owner-scoped client fns and update the parent lists optimistically via onApply.
export function ConversationEditor({
  conversation,
  onApply,
  onClose,
}: {
  conversation: ConversationSummary;
  onApply: (fn: (c: ConversationSummary) => ConversationSummary) => void;
  onClose: () => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);
  const [aliasDraft, setAliasDraft] = useState(conversation.alias ?? "");
  const [tagName, setTagName] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [tagColor, setTagColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveAlias(): Promise<boolean> {
    const alias = aliasDraft.trim();
    setError(null);
    setBusy(true);
    try {
      await setAlias(conversation.id, alias);
      onApply((c) => ({ ...c, alias: alias || null }));
      return true;
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : null));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTag(): Promise<boolean> {
    const name = tagName.trim();
    const value = tagValue.trim();
    if (!name) {
      setError(t.enrichment.nameEmpty);
      return false;
    }
    if (!value) {
      setError(t.enrichment.valueRequired);
      return false;
    }
    const tag: Tag = {
      name,
      value,
      metadata: tagColor ? { color: tagColor } : {},
    };
    setError(null);
    setBusy(true);
    try {
      await upsertTag(conversation.id, tag);
      onApply((c) => ({ ...c, tags: [...c.tags.filter((t) => t.name !== name), tag] }));
      setTagName("");
      setTagValue("");
      setTagColor("");
      return true;
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : null));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // "Done" commits anything typed but not explicitly saved (an alias change, or a
  // tag whose name is filled) before closing -- so saving doesn't require also
  // clicking the check/plus icons. Stays open if a write fails, so the error shows.
  async function handleDone() {
    if (aliasDraft.trim() !== (conversation.alias ?? "")) {
      if (!(await saveAlias())) return;
    }
    if (tagName.trim()) {
      if (!(await addTag())) return;
    }
    onClose();
  }

  // Escape and the backdrop go through `handleDone`, NOT through a bare close. This editor
  // has never had a discard path: its one exit COMMITS what was typed, precisely so a
  // member who filled the alias and did not press the check does not lose it. Closing on
  // Escape without that would be a new way to lose work, not a convention honoured.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") void handleDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function removeTag(name: string) {
    setError(null);
    setBusy(true);
    try {
      await deleteTag(conversation.id, name);
      onApply((c) => ({ ...c, tags: c.tags.filter((t) => t.name !== name) }));
    } catch (err) {
      setError(errorText(e, err instanceof Error ? err.message : null));
    } finally {
      setBusy(false);
    }
  }

  // What the list calls this conversation. Read off the conversation and not off the draft,
  // so the heading does not rewrite itself under the member as they type the alias.
  const name = conversation.alias?.trim() || conversation.title;

  // Portalled to <body> for the reason ConfirmDialog records: the sidebar is a stacking
  // context, and a pane at z-40 paints over an in-tree modal whatever its own z-index.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => void handleDone()}
        aria-hidden
      />
      <Surface
        level={1}
        bordered
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-auto p-5"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {t.history.aliasAndTags}
          </span>
          {/* WHICH conversation. The whole reason this is a dialog rather than a panel
              that sprouted somewhere: on a tree of visits, "the one I clicked" is not
              something the member can still see once the modal is over it. */}
          <h2 className="truncate font-display text-base font-semibold text-fg" title={name}>
            {name}
          </h2>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Alias
          </label>
          {/* No save of its own. The dialog has ONE commit — the button at the foot —
              and a second one beside the field made two answers to "how do I keep this",
              one of which left the dialog open and looked like it had not worked. Enter
              goes through the same commit, so the keyboard reaches it too. */}
          <Input
            inputSize="sm"
            value={aliasDraft}
            placeholder={conversation.title}
            onChange={(e) => setAliasDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleDone();
              }
            }}
            aria-label={t.enrichment.aliasAria}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Tags
          </span>
          {conversation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conversation.tags.map((tag) => (
                <span key={tag.name} className="inline-flex items-center gap-0.5">
                  <TagChip tag={tag} />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label={`${t.enrichment.removeTagPrefix} ${tag.name}`}
                    title={t.enrichment.removeTag}
                    onClick={() => removeTag(tag.name)}
                    disabled={busy}
                    className="h-6 w-6"
                  >
                    <X size={12} aria-hidden />
                  </IconButton>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            <Input
              inputSize="sm"
              value={tagName}
              placeholder={t.enrichment.namePlaceholder}
              onChange={(e) => setTagName(e.target.value)}
              aria-label={t.enrichment.tagNameAria}
            />
            <Input
              inputSize="sm"
              value={tagValue}
              placeholder={t.enrichment.valuePlaceholder}
              onChange={(e) => setTagValue(e.target.value)}
              aria-label={t.enrichment.tagValueAria}
            />
            <input
              type="color"
              value={tagColor || "#888888"}
              onChange={(e) => setTagColor(e.target.value)}
              aria-label={t.enrichment.tagColor}
              title={t.enrichment.tagColor}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-brand bg-elevated"
            />
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t.enrichment.addTag}
              title={t.enrichment.addTag}
              onClick={addTag}
              disabled={busy}
            >
              <Plus size={16} aria-hidden />
            </IconButton>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end">
          <Button variant="filled" size="sm" onClick={handleDone} disabled={busy} autoFocus>
            {c.actions.save}
          </Button>
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
