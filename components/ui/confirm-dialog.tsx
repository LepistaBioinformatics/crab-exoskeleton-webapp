"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { useT } from "@/lib/i18n/context";
import { commonCopy } from "@/lib/i18n/common";

// Small confirmation modal. Rendered only when open; Escape and backdrop click
// cancel. Used to guard accidental destructive actions (e.g. logout).
export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel,
  tone = "neutral",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  /** A second line for what the action does to people other than the caller. */
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `danger` for an action that reaches other people and cannot be undone. The
   * dialog then reads as a warning rather than as a neutral "are you sure":
   * a marker, and a confirm button that is not the same accent as every other
   * primary action on the screen.
   */
  tone?: "neutral" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT(commonCopy);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Portal to <body> so the overlay escapes the sidebar's stacking context
  // (a z-40 pane would otherwise paint over an in-tree modal regardless of its
  // own z-index).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden />
      <Surface
        level={1}
        bordered
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-sm p-5"
      >
        <h2 className="flex items-start gap-2 font-display text-lg font-semibold text-fg">
          {tone === "danger" && (
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-blocked" />
          )}
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-fg-muted">{message}</p>}
        {detail && (
          <p className="mt-2 rounded-lg bg-blocked-weak px-3 py-2 text-sm text-blocked">{detail}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="text" onClick={onCancel}>
            {cancelLabel ?? t.actions.cancel}
          </Button>
          {/* Cancel keeps the focus on a danger dialog: autoFocus on Confirm turns
              a stray Enter into the very action the dialog exists to slow down. */}
          <Button
            variant={tone === "danger" ? "outlined" : "filled"}
            className={tone === "danger" ? "border-blocked text-blocked" : undefined}
            onClick={onConfirm}
            autoFocus={tone !== "danger"}
          >
            {confirmLabel ?? t.actions.confirm}
          </Button>
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
