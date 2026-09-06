import { Brain, CalendarClock, FileText, KeyRound, Network } from "lucide-react";
import type { ChatDict } from "@/lib/i18n/chat";

// What a workspace holds, and the one list every rendering of it reads.
//
// Three surfaces show these now — the right rail, the mobile expander, and the
// sidebar's own legacy menu pane — so the order and the labels live here rather than
// in the panel that happens to have owned them first. Three copies of a list is three
// places that can disagree about what a workspace has.
//
// Ordered deliberately: memory and the graph are what a member asks about ("what does
// it know about me"), scheduled tasks are what it does on its own, files and secrets
// are what they manage.
export type Section = "memory" | "graph" | "tasks" | "files" | "secrets";

export const SECTION_ORDER: Section[] = ["memory", "graph", "tasks", "files", "secrets"];

export const SECTIONS: Record<
  Section,
  {
    Icon: typeof Brain;
    label: (t: ChatDict) => string;
    blurb: (t: ChatDict) => string;
  }
> = {
  memory: {
    Icon: Brain,
    label: (t) => t.memory.title,
    blurb: (t) => t.uploads.sections.memory,
  },
  graph: {
    Icon: Network,
    label: (t) => t.memoryGraph.title,
    blurb: (t) => t.uploads.sections.graph,
  },
  tasks: {
    Icon: CalendarClock,
    label: (t) => t.scheduledTasks.title,
    blurb: (t) => t.uploads.sections.tasks,
  },
  files: {
    Icon: FileText,
    label: (t) => t.uploads.files,
    blurb: (t) => t.uploads.sections.files,
  },
  secrets: {
    Icon: KeyRound,
    label: (t) => t.secrets.title,
    blurb: (t) => t.uploads.sections.secrets,
  },
};

/**
 * What the sidebar should show after a rail (or expander) entry is clicked.
 *
 * The rail is the only control that can both open and close the sidebar, so the rule
 * lives beside the list rather than inside a component: clicking the section that is
 * already open closes it, anything else opens what was clicked.
 *
 * `current` is the raw fragment value, so it can also be `"menu"` — the legacy list
 * pane a shared link may still land on (FR-5.1). From there every click is an open.
 */
export function nextSidebarValue(current: string | null, clicked: Section): Section | null {
  return current === clicked ? null : clicked;
}

/**
 * The fragment's `rs` value as a Section, or null.
 *
 * `rs` is text a member can hand-edit or receive in a link, and the panel indexes
 * `SECTIONS` by whatever it is given: an unchecked cast turned `rs=garbage` into
 * `SECTIONS[…].label(t)` on `undefined`. `"menu"` is a legitimate value of `rs` and
 * still not a section — it is the legacy list pane — so it reads as null here too.
 */
export function asSection(value: string | null | undefined): Section | null {
  return SECTION_ORDER.includes(value as Section) ? (value as Section) : null;
}
