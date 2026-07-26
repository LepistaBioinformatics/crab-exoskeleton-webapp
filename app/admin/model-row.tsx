"use client";

import { cva } from "class-variance-authority";
import { Pencil, Copy, PowerOff, Power, Archive, Trash2, Link2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { type InventoryModel } from "@/lib/models";
import { Ident } from "./field";

// Variants rather than interpolated className strings, per the codebase's
// convention. An inactive row is drawn rather than dimmed: a dashed border says
// "present but not serving new workspaces" without making the text harder to read,
// which opacity does.
const row = cva("flex items-start gap-2.5 rounded-lg border px-3 py-2", {
  variants: {
    state: {
      active: "border-brand/30 bg-elevated",
      inactive: "border-dashed border-brand/30 bg-transparent",
    },
  },
  defaultVariants: { state: "active" },
});

// A model's row has to answer three questions before an admin can act on it: who
// depends on it, what it falls back to, and whether a key is stored. Those used to
// be a provider string and a count; they are now the row's whole middle column,
// because they are the three facts that decide which buttons work.
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
  onEditChain,
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
  // Absent on inactive rows: a model that is not active is not materialized
  // anywhere, so editing its chain has no effect worth offering.
  onEditChain?: (m: InventoryModel) => void;
}) {
  const inUse = model.in_use_count > 0;
  // Delete and disable share one precondition — nothing may reference the model.
  // Deprecation is the tool for retiring something in use, so it stays available.
  // The phrasing names what holds it rather than a bare count, because "3
  // workspaces" tells an admin where to look and "in use by 3" does not.
  const lockReason = inUse
    ? `in use by ${model.in_use_count} ${model.in_use_count === 1 ? "reference" : "references"}`
    : "";
  const toggleLabel = model.status === "active" ? "Disable" : "Enable";

  return (
    <li className={row({ state: model.status === "active" ? "active" : "inactive" })}>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col pt-0.5 leading-none">
          <button
            type="button"
            aria-label={`Move ${model.model_name} up`}
            className="px-0.5 text-xs text-fg-muted hover:text-fg disabled:text-fg-muted/40"
            disabled={busy || !onMoveUp}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${model.model_name} down`}
            className="px-0.5 text-xs text-fg-muted hover:text-fg disabled:text-fg-muted/40"
            disabled={busy || !onMoveDown}
            onClick={onMoveDown}
          >
            ↓
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-[13px] font-bold text-fg">{model.model_name}</span>
          {model.has_key && <Badge tone="neutral">key stored</Badge>}
          {model.status === "disabled" && <Badge tone="neutral">held back</Badge>}
          {model.status === "deprecated" && (
            <span className="rounded bg-retiring-weak px-1.5 py-0.5 text-[11px] font-medium text-retiring">
              retiring → <Ident>{model.replaced_by ?? "?"}</Ident>
            </span>
          )}
          {model.imported_orphan && <Badge tone="neutral">imported</Badge>}
          {inUse && (
            <span className="rounded bg-blocked-weak px-1.5 py-0.5 text-[11px] font-medium text-blocked">
              {lockReason}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 text-[11.5px] text-fg-muted">
          <span className="truncate">
            {model.provider}
            {model.api_base ? " · " : ""}
            {model.api_base && <Ident>{model.api_base}</Ident>}
          </span>
          {model.fallbacks.length > 0 ? (
            <span className="truncate">
              falls back to{" "}
              {model.fallbacks.map((f, i) => (
                <span key={f}>
                  {i > 0 && <span aria-hidden className="text-fg-muted/60"> → </span>}
                  <Ident>{f}</Ident>
                </span>
              ))}
            </span>
          ) : (
            model.status === "active" && (
              <span className="text-fg-muted/70">No fallbacks — a failed request has nowhere to go</span>
            )
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`Edit ${model.model_name}`}
          title="Edit"
          disabled={busy}
          onClick={() => onEdit(model)}
        >
          <Pencil size={15} aria-hidden />
        </IconButton>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`Duplicate ${model.model_name}`}
          title="Duplicate"
          disabled={busy}
          onClick={() => onDuplicate(model)}
        >
          <Copy size={15} aria-hidden />
        </IconButton>
        {onEditChain && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`Edit fallback chain for ${model.model_name}`}
            title="Fallback chain"
            disabled={busy}
            onClick={() => onEditChain(model)}
          >
            <Link2 size={15} aria-hidden />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${toggleLabel} ${model.model_name}`}
          title={
            inUse && model.status === "active"
              ? `Cannot disable while ${lockReason} — retire it instead`
              : toggleLabel
          }
          disabled={busy || (inUse && model.status === "active")}
          onClick={() => onToggle(model)}
        >
          {model.status === "active" ? <PowerOff size={15} aria-hidden /> : <Power size={15} aria-hidden />}
        </IconButton>
        {model.status === "active" && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`Retire ${model.model_name}`}
            title="Retire — people already on it keep it, new ones get the replacement"
            disabled={busy}
            onClick={() => onDeprecate(model)}
          >
            <Archive size={15} aria-hidden />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`Delete ${model.model_name}`}
          title={inUse ? `Cannot delete while ${lockReason}` : "Delete"}
          disabled={busy || inUse}
          onClick={() => onDelete(model)}
        >
          <Trash2 size={15} aria-hidden />
        </IconButton>
      </div>
    </li>
  );
}
