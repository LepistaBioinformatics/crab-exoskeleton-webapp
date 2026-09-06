"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PanelRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import { SECTION_ORDER, SECTIONS, nextSidebarValue, type Section } from "./workspace-sections";

/**
 * The mobile half of the right rail: one header control that expands into the same
 * five sections, WITH their labels.
 *
 * The rail itself is desktop-only — on a phone it would take a tenth of the width, and
 * an icon-only control cannot be read without a hover that touch does not have. So the
 * control the member already has in the header becomes the expander, and the labels
 * that the rail leaves to a tooltip are printed here.
 *
 * Not a floating action button: the composer is pinned to the bottom of the screen with
 * the turn dock above it, so the bottom-right corner is already spoken for (DEC-5).
 *
 * Portaled and fixed, like the composer's attach menu, so no overflow container can
 * clip it.
 */
export default function SectionMenu({
  open,
  onSelect,
  className,
}: {
  /** The raw fragment value (`rs`), so the legacy `"menu"` pane is handled too. */
  open: string | null;
  onSelect: (next: Section | null) => void;
  className?: string;
}) {
  const t = useT(chatCopy);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes and hands focus back, because the trigger is where the member's
  // attention was and a dismissed menu that leaves focus on <body> strands a keyboard.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setExpanded(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <span className={className}>
      <IconButton
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label={t.uploads.workspace}
        title={t.uploads.workspace}
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          // Right-aligned under the trigger: the menu is wider than the button and
          // the button lives at the right edge of the header.
          if (rect) setPos({ x: Math.max(8, rect.right - 208), y: rect.bottom + 6 });
          setExpanded((v) => !v);
        }}
      >
        <PanelRight size={18} aria-hidden />
      </IconButton>

      {expanded &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setExpanded(false)}
              aria-hidden
            />
            <div
              role="menu"
              aria-label={t.uploads.workspace}
              style={{ position: "fixed", left: pos.x, top: pos.y }}
              className="z-[60] w-52 rounded-lg border border-brand bg-surface p-1 shadow-xl"
            >
              {SECTION_ORDER.map((key) => {
                const { Icon, label } = SECTIONS[key];
                const name = label(t);
                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    aria-current={open === key ? "true" : undefined}
                    onClick={() => {
                      setExpanded(false);
                      onSelect(nextSidebarValue(open, key));
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg transition-colors hover:bg-elevated"
                  >
                    <Icon size={16} className="shrink-0 text-fg-muted" aria-hidden />
                    {name}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}
