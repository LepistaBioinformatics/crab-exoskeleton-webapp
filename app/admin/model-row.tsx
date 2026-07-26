"use client";

import { cva } from "class-variance-authority";
import { Pencil, Copy, PowerOff, Power, Archive, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { inactiveReason, type InventoryModel } from "@/lib/models";

// Variants rather than interpolated className strings, per the codebase's
// convention.
const row = cva(
  "flex items-center gap-2 rounded-lg border px-3 py-1.5",
  {
    variants: {
      state: {
        active: "border-brand/30 bg-elevated",
        inactive: "border-brand/20 bg-elevated/60 opacity-80",
      },
    },
    defaultVariants: { state: "active" },
  },
);

export function ModelRow({
  model,
  busy,
  onEdit,
  onDuplicate,
  onToggle,
  onDeprecate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  model: InventoryModel;
  busy: boolean;
  onEdit: (m: InventoryModel) => void;
  onDuplicate: (m: InventoryModel) => void;
  onToggle: (m: InventoryModel) => void;
  onDeprecate: (m: InventoryModel) => void;
  onDelete: (m: InventoryModel) => void;
  // Reorder arrows live INSIDE the row so the list stays <ul><li>: wrapping the
  // row in a positioning <div> would put a non-li child in the <ul> and nest the
  // <li> inside it, which is invalid markup. Absent means not reorderable.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const inUse = model.in_use_count > 0;
  // Delete and disable share one precondition — nothing may reference the model.
  // Deprecation is the tool for retiring something in use, so it stays available.
  const lockReason = inUse ? `in use by ${model.in_use_count}` : "";
  const reason = inactiveReason(model);

  return (
    <li className={row({ state: model.status === "active" ? "active" : "inactive" })}>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col">
          <button type="button" aria-label={`Move ${model.model_name} up`} className="text-xs text-fg-muted"
            disabled={busy || !onMoveUp} onClick={onMoveUp}>
            ↑
          </button>
          <button type="button" aria-label={`Move ${model.model_name} down`} className="text-xs text-fg-muted"
            disabled={busy || !onMoveDown} onClick={onMoveDown}>
            ↓
          </button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-xs text-fg">{model.model_name}</span>
        <span className="truncate text-[11px] text-fg-muted">
          {model.provider}
          {model.api_base ? ` · ${model.api_base}` : ""}
        </span>
        {model.fallbacks.length > 0 && (
          <span className="truncate text-[11px] text-fg-muted">
            fallbacks: {model.fallbacks.join(" → ")}
          </span>
        )}
      </div>

      {reason && <Badge tone="neutral">{reason}</Badge>}
      {model.imported_orphan && <Badge tone="neutral">imported</Badge>}
      {model.has_key && <Badge tone="neutral">key</Badge>}
      {inUse && <Badge tone="accent">{lockReason}</Badge>}

      <IconButton variant="ghost" size="sm" aria-label={`Edit ${model.model_name}`} title="Edit"
        disabled={busy} onClick={() => onEdit(model)}>
        <Pencil size={15} aria-hidden />
      </IconButton>
      <IconButton variant="ghost" size="sm" aria-label={`Duplicate ${model.model_name}`} title="Duplicate"
        disabled={busy} onClick={() => onDuplicate(model)}>
        <Copy size={15} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`${model.status === "active" ? "Disable" : "Enable"} ${model.model_name}`}
        title={inUse && model.status === "active" ? `Cannot disable: ${lockReason}` : "Enable / disable"}
        disabled={busy || (inUse && model.status === "active")}
        onClick={() => onToggle(model)}
      >
        {model.status === "active" ? <PowerOff size={15} aria-hidden /> : <Power size={15} aria-hidden />}
      </IconButton>
      {model.status === "active" && (
        <IconButton variant="ghost" size="sm" aria-label={`Deprecate ${model.model_name}`}
          title="Deprecate (retire while keeping existing users on it)"
          disabled={busy} onClick={() => onDeprecate(model)}>
          <Archive size={15} aria-hidden />
        </IconButton>
      )}
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`Delete ${model.model_name}`}
        title={inUse ? `Cannot delete: ${lockReason}` : "Delete"}
        disabled={busy || inUse}
        onClick={() => onDelete(model)}
      >
        <Trash2 size={15} aria-hidden />
      </IconButton>
    </li>
  );
}
