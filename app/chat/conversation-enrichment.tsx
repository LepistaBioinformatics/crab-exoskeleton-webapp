"use client";

import { useState } from "react";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
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

// A tag drawn as a mini label: a tag icon + name + (required) value. When the
// tag carries a `metadata.color` it tints the border, a faint fill, and the
// text; otherwise it's neutral. Shared by the list and tree views.
export function TagChip({ tag }: { tag: Tag }) {
  const color = typeof tag.metadata.color === "string" && tag.metadata.color ? tag.metadata.color : undefined;
  const description = typeof tag.metadata.description === "string" ? tag.metadata.description : undefined;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] border border-brand/40 px-1.5 py-0.5 text-[11px] leading-none text-fg-muted"
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

// The per-conversation alias + tag editor, expanded under a row (list or tree).
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
      setError(err instanceof Error ? err.message : "Couldn't save the alias.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTag(): Promise<boolean> {
    const name = tagName.trim();
    const value = tagValue.trim();
    if (!name) {
      setError("Tag name can't be empty.");
      return false;
    }
    if (!value) {
      setError("Tag value is required.");
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
      setError(err instanceof Error ? err.message : "Couldn't add the tag.");
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

  async function removeTag(name: string) {
    setError(null);
    setBusy(true);
    try {
      await deleteTag(conversation.id, name);
      onApply((c) => ({ ...c, tags: c.tags.filter((t) => t.name !== name) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the tag.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-1 flex flex-col gap-3 rounded-lg bg-elevated/60 px-3 py-3">
      <div className="flex flex-col gap-1">
        <label className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Alias
        </label>
        <div className="flex items-center gap-1">
          <Input
            inputSize="sm"
            value={aliasDraft}
            placeholder={conversation.title}
            onChange={(e) => setAliasDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveAlias();
              }
            }}
            aria-label="Conversation alias"
          />
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Save alias"
            title="Save alias"
            onClick={saveAlias}
            disabled={busy}
          >
            <Check size={16} aria-hidden />
          </IconButton>
        </div>
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
                  aria-label={`Remove tag ${tag.name}`}
                  title="Remove tag"
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
            placeholder="name"
            onChange={(e) => setTagName(e.target.value)}
            aria-label="Tag name"
          />
          <Input
            inputSize="sm"
            value={tagValue}
            placeholder="value (required)"
            onChange={(e) => setTagValue(e.target.value)}
            aria-label="Tag value"
          />
          <input
            type="color"
            value={tagColor || "#888888"}
            onChange={(e) => setTagColor(e.target.value)}
            aria-label="Tag color"
            title="Tag color"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-brand bg-elevated"
          />
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Add tag"
            title="Add tag"
            onClick={addTag}
            disabled={busy}
          >
            <Plus size={16} aria-hidden />
          </IconButton>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end">
        <Button variant="text" size="sm" onClick={handleDone} disabled={busy}>
          Done
        </Button>
      </div>
    </div>
  );
}
