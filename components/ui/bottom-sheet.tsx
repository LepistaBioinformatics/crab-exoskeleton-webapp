"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useT } from "@/lib/i18n/context";
import { commonCopy } from "@/lib/i18n/common";

// A panel that rises from the bottom of the viewport and holds something long.
//
// A SHEET RATHER THAN A DIALOG, and the difference is what it is for. A dialog
// asks a question and wants an answer before anything else happens; a sheet
// shows MORE OF SOMETHING THE READER IS ALREADY LOOKING AT. Reading a long
// memory is not a decision, so it does not get a decision's shape: no confirm,
// no cancel, one way out, and the page behind it stays visible at the top.
//
// It follows ConfirmDialog's mechanics because those are the ones that work
// here: a portal to <body> so the overlay escapes the sidebar's stacking
// context (a z-40 pane paints over an in-tree modal whatever its z-index),
// Escape to close, and backdrop click to close.
//
// Scroll is locked on <body> while it is open. Without that, a short sheet over
// a long page scrolls the PAGE when the pointer leaves the panel, which reads as
// the sheet having lost the content.
export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  /** A second line -- who wrote it, when, where it travelled. */
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = useT(commonCopy);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* The backdrop is a button so a pointer click and a keyboard user get the
          same way out; the visible control is the X in the header. */}
      <button
        type="button"
        aria-label={c.actions.close}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 85vh rather than full height: the strip of page left showing is what
        // says this is a layer over the list rather than a new screen.
        className="relative flex max-h-[85vh] flex-col rounded-t-2xl border-t border-rule-strong bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule-strong px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
          </div>
          <IconButton aria-label={c.actions.close} onClick={onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        {/* The only scroll container. The sheet itself never scrolls, so the
            header stays put while a long memory moves under it. */}
        {/* The same reading column the screen uses. A sheet spans the whole
            viewport, and prose across 1900px is the problem this was opened to
            escape. pb-16 keeps the last line off the rim. */}
        <div className="overflow-y-auto px-5 py-4">
          <div className="mx-auto max-w-3xl pb-16">{children}</div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
