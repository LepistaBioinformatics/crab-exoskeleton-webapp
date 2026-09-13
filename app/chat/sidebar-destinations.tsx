"use client";

import { Folders, type LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import {
  SECTIONS,
  SECTION_ORDER,
  nextSidebarValue,
  type Section,
} from "./workspace-sections";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// WHERE THE MEMBER CAN GO, listed once.
//
// These used to be two unrelated things in two places: the project list sat in the
// chats sidebar, above the conversations it separated, and the five workspace sections
// sat behind an icon rail on the opposite edge of the screen. One list is still the
// right answer — a member looking for Files should not have to know that Files is a
// different KIND of thing from Projects.
//
// But the two kinds are real, and this is the one surface that has to show both: the
// Projects row REPLACES the conversation with the projects screen, and a section row
// OPENS BESIDE it. The owner reversed the version where all six replaced the
// conversation, on 2026-09-12, for the reason the pane exists — the chat has to be
// readable next to the files, the graph and the tasks. So a section row also toggles,
// which a destination never did: pressing the one already open closes the pane.

/** One row, and which of the two things a click on it means. */
export type DestinationRow = { kind: "projects" } | { kind: "section"; section: Section };

// Projects first, then the workspace's own sections in the order that module already
// owns. Spelling the five out again here is how the sidebar and the collapsed rail
// would end up disagreeing about what a workspace holds — the whole reason SECTION_ORDER
// exists — so the rail reads THIS list rather than building a second one.
export const DESTINATION_ROWS: DestinationRow[] = [
  { kind: "projects" },
  ...SECTION_ORDER.map((section) => ({ kind: "section", section }) as const),
];

// Projects has no entry in SECTIONS -- it is not something a workspace CONTAINS, it is
// what the other five are scoped BY. So its label and glyph are named here, and the
// five keep coming from the module that owns them.
export function rowKey(row: DestinationRow): string {
  return row.kind === "projects" ? "projects" : row.section;
}

export function rowLabel(row: DestinationRow, t: ChatDict): string {
  return row.kind === "projects" ? t.projects.title : SECTIONS[row.section].label(t);
}

export function rowIcon(row: DestinationRow): LucideIcon {
  return row.kind === "projects" ? Folders : SECTIONS[row.section].Icon;
}

const row = cva(
  [
    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
    "transition-colors",
  ],
  {
    variants: {
      current: {
        true: "bg-accent/12 font-medium text-fg",
        false: "text-fg-muted hover:bg-elevated hover:text-fg",
      },
    },
    defaultVariants: { current: false },
  },
);

export default function SidebarDestinations({
  projectsOpen,
  openSection,
  onProjects,
  onSection,
  hideProjects = false,
}: {
  /** The centre pane is showing the projects screen -- the fragment's `v`. */
  projectsOpen: boolean;
  /** The section open in the pane beside the conversation, or null -- the fragment's `rs`. */
  openSection: Section | null;
  onProjects: () => void;
  /**
   * The section the pane should show next, or null to close it. The TOGGLE is decided
   * here rather than by the caller, with `nextSidebarValue`, because the collapsed rail
   * asks the same question and the two must answer it the same way.
   */
  onSection: (next: Section | null) => void;
  /**
   * An agent whose proxy predates projects reports `projects_unsupported`, and the row
   * is then not rendered at all rather than rendered inert. A disabled control swallows
   * its own click: the member sees a way in, presses it, and nothing happens -- which is
   * worse than the row simply not being there.
   */
  hideProjects?: boolean;
}) {
  const t = useT(chatCopy);
  const rows = hideProjects
    ? DESTINATION_ROWS.filter((r) => r.kind !== "projects")
    : DESTINATION_ROWS;

  return (
    <nav aria-label={t.shell.destinations}>
      <ul className="flex flex-col gap-0.5 px-2">
        {rows.map((entry) => {
          const Icon = rowIcon(entry);
          const name = rowLabel(entry, t);
          const here =
            entry.kind === "projects" ? projectsOpen : openSection === entry.section;
          return (
            <li key={rowKey(entry)}>
              <button
                type="button"
                onClick={() =>
                  entry.kind === "projects"
                    ? onProjects()
                    : onSection(nextSidebarValue(openSection, entry.section))
                }
                // `page` for Projects, `true` for a section, and the difference is the
                // whole change: `page` is the value the spec reserves for the
                // destination within this document that the member is ON, and a pane
                // open beside the conversation is not where they are. Both can be
                // marked at once, which is exactly the coexistence being asserted.
                aria-current={here ? (entry.kind === "projects" ? "page" : true) : undefined}
                className={row({ current: here })}
              >
                <Icon size={16} className="shrink-0" aria-hidden />
                <span className="truncate">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
