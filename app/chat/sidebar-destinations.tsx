"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Folders, Share2, type LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import {
  SECTIONS,
  SECTION_ORDER,
  nextSidebarValue,
  type Section,
} from "./workspace-sections";
import { SectionLabel } from "./sidebar-section";
import type { RailPanel } from "./resizable-pane";
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
//
// THE TWO KINDS ARE NOW DRAWN, not merely true. The list was flat, and a flat list
// said the six rows were six of the same thing — so the difference between "this
// becomes the screen" and "this opens beside the screen" was discoverable only by
// pressing one. They are two GROUPS under two labels now, which is the owner's
// request of 2026-09-22: screens and tools.

/** One row, and which of the two things a click on it means. */
export type DestinationRow = { kind: "projects" } | { kind: "section"; section: Section };

export type DestinationGroupKey = "places" | "tools";

/** One labelled group of rows, and whether the member may fold it away. */
export interface DestinationGroup {
  key: DestinationGroupKey;
  /**
   * OPTIONAL, and its absence is what puts New chat and Projects together.
   *
   * There were two labelled groups. The mangrove became a right-pane section, which
   * left the first one a heading over a list of ONE -- a word that earns nothing, and
   * a line between Projects and the New chat button directly above it. Unlabelled, the
   * two read as what they are: the places this column can take you.
   */
  label?: (t: ChatDict) => string;
  /**
   * ONLY TOOLS FOLDS, and the asymmetry is the point rather than an omission.
   *
   * Screens is where the member can BE — two rows, always the same two, and a
   * column whose "where am I" list can be hidden is a column that can be left
   * saying nothing. Tools is five rows of things opened for a minute and closed
   * again, so a member who is reading rather than managing can put them away.
   * A chevron on Screens would be a control whose only use is making the sidebar
   * worse.
   */
  collapsible: boolean;
  rows: DestinationRow[];
}

// ONE SOURCE OF TRUTH, GROUPED — and the flat list below is derived from it rather
// than written beside it. Spelling the rows out twice is how the sidebar and the
// collapsed rail would end up disagreeing about what a workspace holds, which is the
// whole reason SECTION_ORDER exists; spelling the GROUPS out twice is the same bug one
// level up, now that the rail draws a hairline between them.
export const DESTINATION_GROUPS: DestinationGroup[] = [
  {
    key: "places",
    // No label: see DestinationGroup.label. One row, sitting under the New chat
    // button, which is the other thing that takes you somewhere.
    collapsible: false,
    rows: [{ kind: "projects" }],
  },
  {
    key: "tools",
    label: (t) => t.shell.groups.tools,
    collapsible: true,
    rows: SECTION_ORDER.map((section) => ({ kind: "section", section }) as const),
  },
];

/**
 * Every row, in the order the column reads them.
 *
 * DERIVED, not declared. It exists because several callers only ever wanted "all of
 * them" — a count, an order check — and making each of those learn the group shape
 * would be churn for nothing. What it must never become is a second hand-written list.
 */
export const DESTINATION_ROWS: DestinationRow[] = DESTINATION_GROUPS.flatMap(
  (group) => group.rows,
);

// Projects has no entry in SECTIONS -- it is not something a workspace CONTAINS, it is
// what the other five are scoped BY. So its label and glyph are named here, and the
// five keep coming from the module that owns them.
export function rowKey(row: DestinationRow): string {
  if (row.kind === "projects") return "projects";
  return row.section;
}

export function rowLabel(row: DestinationRow, t: ChatDict): string {
  if (row.kind === "projects") return t.projects.title;
  return SECTIONS[row.section].label(t);
}

export function rowIcon(row: DestinationRow): LucideIcon {
  if (row.kind === "projects") return Folders;
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
  return SECTIONS[row.section].blurb(t);
}

/** What the member can actually press: the group's rows, less the ones hidden. */
/**
 * Which rows this member can be offered at all.
 *
 * ONE FILTER FOR BOTH, because the sidebar and the collapsed rail read it and
 * the file's own comments already say what a second hand-written answer costs.
 */
// STILL BOTH, and the mangrove's flag survived its move between the two lists.
//
// It gates a real thing: a deployment that never configured the mangrove offered the
// row anyway and answered it with a blank pane, which is what #100 fixed. Becoming a
// SECTION does not make that go away -- the row is drawn from SECTION_ORDER now, so
// the filter has to reach into section rows rather than only into the named ones.
export type HiddenRows = { projects?: boolean; mangrove?: boolean };

function visibleRows(group: DestinationGroup, hidden: HiddenRows): DestinationRow[] {
  return group.rows.filter((row) => {
    if (row.kind === "projects") return !hidden.projects;
    // The one section with a switch. The other five exist wherever a workspace does.
    if (row.section === "mangrove") return !hidden.mangrove;
    return true;
  });
}

/** Which of the two currents this row holds, if either. */
function isHere(
  row: DestinationRow,
  openDestination: Destination | null,
  openSection: Section | null,
): boolean {
  return row.kind === "section" ? openSection === row.section : openDestination === row.kind;
}

/**
 * THE COLLAPSED RAIL'S GROUPS, built from the same structure the expanded column reads.
 *
 * It lives here rather than inline in the shell for the reason the rows themselves do:
 * the rail is a second rendering of this list, and a second rendering assembled
 * somewhere else is a second list that will drift. The rail has no room for the two
 * labels, so the grouping reads there as the hairline `ResizablePane` already draws
 * between groups — one group in, one group out, and no member has to be told which
 * side of the line a glyph is on to press it.
 *
 * The rail ignores the Tools fold on purpose: the fold is the expanded column's answer
 * to "I am reading, put these away", and a rail that hid five of its seven glyphs when
 * the column was folded would be a way OUT of the tools with no way back in.
 */
export function railDestinationGroups({
  t,
  openDestination,
  openSection,
  hidden = {},
  onDestination,
  onSection,
}: {
  t: ChatDict;
  openDestination: Destination | null;
  openSection: Section | null;
  /** Rows to leave out entirely -- absent, never present-and-dead. */
  hidden?: HiddenRows;
  onDestination: (to: Destination) => void;
  onSection: (next: Section | null) => void;
}): RailPanel[][] {
  return DESTINATION_GROUPS.map((group) =>
    visibleRows(group, hidden).map((row) => ({
      key: rowKey(row),
      Icon: rowIcon(row),
      label: rowLabel(row, t),
      blurb: rowBlurb(row, t),
      active: isHere(row, openDestination, openSection),
      // The same toggle the expanded row runs, from the same helper, so pressing the
      // open section closes the pane at either width.
      onSelect: () =>
        row.kind === "section"
          ? onSection(nextSidebarValue(openSection, row.section))
          : onDestination(row.kind),
    })),
  ).filter((group) => group.length > 0);
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

// The group heading. `px-2` inside a `px-2` wrapper puts the label on the same x as the
// rows' GLYPHS rather than their text, which is the indent that reads as a heading over
// the list instead of a seventh row in it.
//
// TIGHTER THAN `SectionHeader`'s `pb-2 pt-4`, deliberately. That row heads a scrolling
// list that fills the rest of the column; these two head two and five rows set at
// `py-1.5` with `gap-0.5` between them, and the taller rhythm turned six rows into
// something that read as three separate regions.
const groupHeader = cva(
  "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left",
  {
    variants: { pressable: { true: "transition-colors hover:bg-elevated/60", false: "" } },
    defaultVariants: { pressable: false },
  },
);

// THE CHEVRON TRAILS THE LABEL, which is not where `SectionHeader` puts it.
//
// Only one of the two groups folds, and a leading chevron would start the Tools label
// ~24px to the right of the Screens label — two headings of the same rank, visibly out
// of line, with the misalignment reading as hierarchy that is not there. On the trailing
// edge it marks the one group that folds without moving either label.
const chevron = cva("ml-auto shrink-0 text-fg-muted transition-colors group-hover/grp:text-fg");

// Remembered, because the fold answers a question about how the member WORKS rather
// than about where they are: somebody who never opens the graph put it away once and
// means it. (Where they are lives in the fragment for the opposite reason — see
// destination.ts.) Storage can be unavailable or throw, so both ends are guarded and the
// column opens with Tools showing when it is: the default reveals rows rather than
// hiding them.
const TOOLS_KEY = "chat-sidebar-tools";

export default function SidebarDestinations({
  openDestination,
  openSection,
  onDestination,
  onSection,
  hidden = {},
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
  /** Rows to leave out entirely -- absent, never present-and-dead. */
  hidden?: HiddenRows;
}) {
  const t = useT(chatCopy);
  // OPEN until storage says otherwise, restored in an effect rather than read while
  // rendering: this component renders on the server too, and a first paint that
  // depended on one browser's storage is a hydration mismatch.
  const [toolsOpen, setToolsOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(TOOLS_KEY) === "closed") setToolsOpen(false);
    } catch {
      // storage unavailable -- the group just opens, which is the safe default
    }
  }, []);

  // Written from the handler, not from an effect on `toolsOpen`: an effect would also
  // run on mount, writing the default over the very value the restore above is reading.
  //
  // And written BESIDE the state update rather than inside the updater, which has to
  // stay pure -- StrictMode double-invokes it in development, so a write in there is
  // two writes. There is one control, so reading the current value from the closure is
  // sound.
  function toggleTools() {
    const next = !toolsOpen;
    setToolsOpen(next);
    try {
      localStorage.setItem(TOOLS_KEY, next ? "open" : "closed");
    } catch {
      // storage unavailable -- the fold just won't outlive the tab
    }
  }

  return (
    <nav aria-label={t.shell.destinations} className="flex flex-col">
      {DESTINATION_GROUPS.map((group) => {
        const rows = visibleRows(group, hidden);
        // A heading over nothing is worse than no heading. Nothing empties a group
        // today -- `hideProjects` leaves the mangrove behind -- but a group that can
        // be filtered can be emptied.
        if (rows.length === 0) return null;

        const open = group.collapsible ? toolsOpen : true;
        const name = group.label?.(t);
        const listId = `destinations-${group.key}`;
        const Chevron = open ? ChevronDown : ChevronRight;

        return (
          <div key={group.key} className="px-2 pb-1 pt-3">
            {/* No heading at all when the group has no label -- not an empty one.
                A blank header would still take the vertical space that separates
                Projects from the New chat button above it, which is the gap this
                change exists to close. */}
            {name === undefined ? null : group.collapsible ? (
              <button
                type="button"
                onClick={toggleTools}
                aria-expanded={open}
                // Only while the list exists: `aria-controls` naming an id that is not
                // in the document is a dangling reference, and the rows are removed
                // rather than hidden (see below).
                aria-controls={open ? listId : undefined}
                aria-label={`${open ? t.nav.collapse : t.pane.expand} ${name}`}
                className={`group/grp ${groupHeader({ pressable: true })}`}
              >
                <span id={`${listId}-label`}>
                  <SectionLabel>{name}</SectionLabel>
                </span>
                <Chevron size={14} className={chevron()} aria-hidden />
              </button>
            ) : (
              <div className={groupHeader()}>
                <span id={`${listId}-label`}>
                  <SectionLabel>{name}</SectionLabel>
                </span>
              </div>
            )}

            {/* Not rendered at all while folded, rather than hidden: the rows are
                buttons, and a hidden button is still tabbable.

                `aria-labelledby` is what makes the grouping more than a drawing. Two
                bare lists announce as "list, 2 items" and "list, 5 items", which is
                exactly as undifferentiated as the flat list this replaced — the heading
                is on screen, so a reader has to be told it belongs to the rows under
                it. */}
            {open && (
              <ul
                id={listId}
                // Only when a heading exists to point at. `aria-labelledby` naming an
                // id that is not in the document is the same dangling reference the
                // `aria-controls` above is careful to avoid.
                aria-labelledby={name === undefined ? undefined : `${listId}-label`}
                className="flex flex-col gap-0.5"
              >
                {rows.map((entry) => {
                  const Icon = rowIcon(entry);
                  const label = rowLabel(entry, t);
                  const here = isHere(entry, openDestination, openSection);
                  return (
                    <li key={rowKey(entry)}>
                      <button
                        type="button"
                        onClick={() =>
                          entry.kind === "section"
                            ? onSection(nextSidebarValue(openSection, entry.section))
                            : onDestination(entry.kind)
                        }
                        // `page` for Projects, `true` for a section, and the difference is
                        // the whole change: `page` is the value the spec reserves for the
                        // destination within this document that the member is ON, and a
                        // pane open beside the conversation is not where they are. Both
                        // can be marked at once, which is exactly the coexistence being
                        // asserted.
                        aria-current={
                          here ? (entry.kind === "section" ? true : "page") : undefined
                        }
                        className={row({ current: here })}
                      >
                        <Icon size={16} className="shrink-0" aria-hidden />
                        <span className="truncate">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
