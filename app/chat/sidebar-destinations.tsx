"use client";

import { Folders, Share2, type LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import {
  SECTIONS,
  SECTION_ORDER,
  nextSidebarValue,
  type Section,
} from "./workspace-sections";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import type { Destination } from "./destination";

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
export type DestinationRow =
  | { kind: "projects" }
  | { kind: "reef" }
  | { kind: "section"; section: Section };

// Projects first, then the workspace's own sections in the order that module already
// owns. Spelling the five out again here is how the sidebar and the collapsed rail
// would end up disagreeing about what a workspace holds — the whole reason SECTION_ORDER
// exists — so the rail reads THIS list rather than building a second one.
export const DESTINATION_ROWS: DestinationRow[] = [
  { kind: "projects" },
  // The reef sits with Projects rather than with the five sections, and the
  // distinction is the one this file already draws: a section is scoped BY a
  // workspace and opens beside a conversation, while these replace the centre.
  // The reef spans subscriptions and tenants and is not read alongside one
  // conversation, so it is a destination.
  { kind: "reef" },
  ...SECTION_ORDER.map((section) => ({ kind: "section", section }) as const),
];

// Projects has no entry in SECTIONS -- it is not something a workspace CONTAINS, it is
// what the other five are scoped BY. So its label and glyph are named here, and the
// five keep coming from the module that owns them.
export function rowKey(row: DestinationRow): string {
  if (row.kind === "projects") return "projects";
  if (row.kind === "reef") return "reef";
  return row.section;
}

export function rowLabel(row: DestinationRow, t: ChatDict): string {
  if (row.kind === "projects") return t.projects.title;
  if (row.kind === "reef") return t.reef.title;
  return SECTIONS[row.section].label(t);
}

export function rowIcon(row: DestinationRow): LucideIcon {
  if (row.kind === "projects") return Folders;
  if (row.kind === "reef") return Share2;
  return SECTIONS[row.section].Icon;
}

/**
 * One line saying what the row opens, for the COLLAPSED RAIL and nothing else.
 *
 * A labelled row does not need it — that is why these were deleted once. A rail entry is
 * a glyph with no label at all, so the sentence is what the tooltip has to say.
 *
 * Projects has a `blurb` of its own rather than borrowing `projects.hint`: the hint is a
 * paragraph the projects screen can afford, and at tooltip width in small type it runs to
 * four lines beside five one-line neighbours.
 */
export function rowBlurb(row: DestinationRow, t: ChatDict): string {
  if (row.kind === "projects") return t.projects.blurb;
  if (row.kind === "reef") return t.reef.blurb;
  return SECTIONS[row.section].blurb(t);
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
  openDestination,
  openSection,
  onDestination,
  onSection,
  hideProjects = false,
}: {
  /**
   * The destination the centre pane is showing, or null -- the fragment's `v`.
   *
   * IT IS THE DESTINATION, NOT A BOOLEAN, and that distinction arrived with the
   * second one. `projectsOpen: boolean` was right while `Destination` had a
   * single value and became a bug the moment it had two: every destination lit
   * the Projects row, because "a destination is open" and "Projects is open"
   * were the same expression.
   */
  openDestination: Destination | null;
  /** The section open in the pane beside the conversation, or null -- the fragment's `rs`. */
  openSection: Section | null;
  onDestination: (to: Destination) => void;
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
            entry.kind === "section"
              ? openSection === entry.section
              : openDestination === entry.kind;
          return (
            <li key={rowKey(entry)}>
              <button
                type="button"
                onClick={() =>
                  entry.kind === "section"
                    ? onSection(nextSidebarValue(openSection, entry.section))
                    : onDestination(entry.kind)
                }
                // `page` for Projects, `true` for a section, and the difference is the
                // whole change: `page` is the value the spec reserves for the
                // destination within this document that the member is ON, and a pane
                // open beside the conversation is not where they are. Both can be
                // marked at once, which is exactly the coexistence being asserted.
                aria-current={here ? (entry.kind === "section" ? true : "page") : undefined}
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
