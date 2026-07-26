"use client";

import { cva } from "class-variance-authority";
import { Pencil, Copy, PowerOff, Power, Archive, Trash2, Link2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { type InventoryModel } from "@/lib/models";
import { Ident } from "./field";
import { adminCopy } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/context";

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
  const t = useT(adminCopy);
  const inUse = model.in_use_count > 0;
  // Delete and disable share one precondition — nothing may reference the model.
  // Deprecation is the tool for retiring something in use, so it stays available.
  // The phrasing names what holds it rather than a bare count, because "3
  // workspaces" tells an admin where to look and "in use by 3" does not.
  const lockReason = inUse
    ? model.in_use_count === 1
      ? t.modelRow.inUseOne
      : t.modelRow.inUseOther.replace("{n}", String(model.in_use_count))
    : "";
  const toggleLabel = model.status === "active" ? t.modelRow.disable : t.modelRow.enable;

  return (
    <li className={row({ state: model.status === "active" ? "active" : "inactive" })}>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col pt-0.5 leading-none">
          <button
            type="button"
            aria-label={`${t.modelRow.movePrefix} ${model.model_name} ${t.modelRow.moveUpSuffix}`}
            className="px-0.5 text-xs text-fg-muted hover:text-fg disabled:text-fg-muted/40"
            disabled={busy || !onMoveUp}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${t.modelRow.movePrefix} ${model.model_name} ${t.modelRow.moveDownSuffix}`}
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
          {model.has_key && <Badge tone="neutral">{t.modelRow.keyStored}</Badge>}
          {model.status === "disabled" && <Badge tone="neutral">{t.modelRow.heldBack}</Badge>}
          {model.status === "deprecated" && (
            <span className="rounded bg-retiring-weak px-1.5 py-0.5 text-[11px] font-medium text-retiring">
              {t.modelRow.retiringTo} <Ident>{model.replaced_by ?? "?"}</Ident>
            </span>
          )}
          {model.imported_orphan && <Badge tone="neutral">{t.modelRow.imported}</Badge>}
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
              {t.modelRow.fallsBackTo}{" "}
              {model.fallbacks.map((f, i) => (
                <span key={f}>
                  {i > 0 && <span aria-hidden className="text-fg-muted/60"> → </span>}
                  <Ident>{f}</Ident>
                </span>
              ))}
            </span>
          ) : (
            model.status === "active" && (
              <span className="text-fg-muted/70">{t.modelRow.noFallbacks}</span>
            )
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.modelRow.editPrefix} ${model.model_name}`}
          title={t.modelRow.edit}
          disabled={busy}
          onClick={() => onEdit(model)}
        >
          <Pencil size={15} aria-hidden />
        </IconButton>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.modelRow.duplicatePrefix} ${model.model_name}`}
          title={t.modelRow.duplicate}
          disabled={busy}
          onClick={() => onDuplicate(model)}
        >
          <Copy size={15} aria-hidden />
        </IconButton>
        {onEditChain && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`${t.modelRow.fallbackChainPrefix} ${model.model_name}`}
            title={t.modelRow.fallbackChain}
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
              ? t.modelRow.cannotDisable.replace("{reason}", lockReason)
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
            aria-label={`${t.modelRow.retirePrefix} ${model.model_name}`}
            title={t.modelRow.retireTitle}
            disabled={busy}
            onClick={() => onDeprecate(model)}
          >
            <Archive size={15} aria-hidden />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.modelRow.deletePrefix} ${model.model_name}`}
          title={inUse ? t.modelRow.cannotDelete.replace("{reason}", lockReason) : t.modelRow.deletePrefix}
          disabled={busy || inUse}
          onClick={() => onDelete(model)}
        >
          <Trash2 size={15} aria-hidden />
        </IconButton>
      </div>
    </li>
  );
}
