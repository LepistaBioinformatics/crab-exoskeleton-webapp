"use client";

import { useEffect, useState } from "react";
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
// THE EXIT IS OWNED HERE, not by the caller. workspace-pane splits this into
// `closing` + `onClosed` because the SHELL owns the state that opens it and has
// to keep the node mounted itself. Nothing else needs to know a sheet is
// leaving, so the phase stays inside and every caller keeps the same two props
// it always had: `open` and `onClose`.
//
// Scroll is locked on <body> for as long as the sheet is on screen -- including
// while it leaves. Without the lock, a short sheet over a long page scrolls the
// PAGE when the pointer leaves the panel, which reads as the sheet having lost
// the content.
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
  // `mounted` is "in the tree", `leaving` is "playing the exit". They are not
  // the same state: between the member pressing Escape and the animation
  // ending, the sheet is mounted AND leaving.
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Re-opening mid-exit cancels the exit rather than queueing behind it.
      setLeaving(false);
    } else if (mounted) {
      setLeaving(true);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* The backdrop is a button so a pointer click and a keyboard user get the
          same way out; the visible control is the X in the header. */}
      <button
        type="button"
        aria-label={c.actions.close}
        className={`absolute inset-0 bg-black/40 ${leaving ? "backdrop-out" : "backdrop-in"}`}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 85vh rather than full height: the strip of page left showing is what
        // says this is a layer over the list rather than a new screen.
        className={`relative flex max-h-[85vh] flex-col rounded-t-2xl border-t border-rule-strong bg-surface shadow-2xl ${
          leaving ? "sheet-fall" : "sheet-rise"
        }`}
        // ONLY THE SHEET'S OWN ANIMATION ENDS THE EXIT. Anything inside that
        // animates -- a spinner, a fading row, a highlighted code block --
        // bubbles its `animationend` through here too, and one of those firing
        // would drop the sheet mid-slide. workspace-pane learned this first.
        onAnimationEnd={
          leaving
            ? (e) => {
                if (e.target !== e.currentTarget) return;
                setLeaving(false);
                setMounted(false);
              }
            : undefined
        }
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
        <div className="overflow-y-auto px-5 py-4">
          {/* The same reading column the screen uses. A sheet spans the whole
              viewport, and prose across 1900px is the problem this was opened to
              escape. Half a viewport under it so the last line comes to rest in
              the middle rather than against the bottom edge. */}
          <div className="mx-auto max-w-3xl pb-[50vh]">{children}</div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
