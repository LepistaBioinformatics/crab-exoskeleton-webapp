"use client";

import { IconButton } from "@/components/ui/icon-button";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import { SECTION_ORDER, SECTIONS, nextSidebarValue, type Section } from "./workspace-sections";

/**
 * The always-visible column of section controls on the right edge of the chat.
 *
 * It exists because the features behind it were not being found: one unlabelled
 * `PanelRight` in the header, opening a list of four sections, plus a second icon for
 * secrets. Two doors in the same corner, both silent about what is behind them. Five
 * controls that are simply always on screen is the whole mechanism — see
 * `.specs/features/right-rail-discoverability/spec.md`.
 *
 * It renders WITHOUT the sidebar and does not move when the sidebar opens: the sidebar
 * opens to its left, so the rail is the fixed edge of the layout rather than something
 * that appears once you have already found it.
 *
 * A surface with a border, not glyphs floating over the conversation (DEC-2): icons
 * alone read as decoration, a bar reads as a place.
 */
export default function RightRail({
  open,
  onSelect,
}: {
  /** The raw fragment value (`rs`), so the legacy `"menu"` pane is handled too. */
  open: string | null;
  onSelect: (next: Section | null) => void;
}) {
  const t = useT(chatCopy);
  return (
    <div
      // `group`, not `toolbar`: a toolbar's contract is arrow-key navigation with a
      // single tab stop, and these are five ordinary buttons with five tab stops.
      // Claiming the role a screen reader would then act on is worse than naming the
      // group honestly.
      role="group"
      aria-label={t.uploads.workspace}
      className="hidden md:flex w-12 shrink-0 flex-col items-center gap-1 border-l border-brand/30 bg-surface py-2"
    >
      {SECTION_ORDER.map((key) => {
        const { Icon, label } = SECTIONS[key];
        const name = label(t);
        const active = open === key;
        return (
          <IconButton
            key={key}
            variant={active ? "filled" : "ghost"}
            size="sm"
            aria-label={name}
            title={name}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(nextSidebarValue(open, key))}
          >
            <Icon size={18} aria-hidden />
          </IconButton>
        );
      })}
    </div>
  );
}
