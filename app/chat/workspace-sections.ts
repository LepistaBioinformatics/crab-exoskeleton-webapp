import { Brain, CalendarClock, FileText, KeyRound, Network } from "lucide-react";
import type { ChatDict } from "@/lib/i18n/chat";

// What a workspace holds, and the one list every rendering of it reads.
//
// Written when three surfaces showed these — the right rail, the mobile expander and
// the sidebar's own legacy menu pane. All three are gone and the reason survived them:
// the sidebar's section rows, the collapsed rail and the pane's own heading read this
// list now, and three copies of a list is three places that can disagree about what a
// workspace has.
//
// Ordered deliberately: memory and the graph are what a member asks about ("what does
// it know about me"), scheduled tasks are what it does on its own, files and secrets
// are what they manage.
export type Section = "memory" | "graph" | "tasks" | "files" | "secrets";

export const SECTION_ORDER: Section[] = ["memory", "graph", "tasks", "files", "secrets"];

// A one-line blurb under each label used to live here too. It had one reader — the
// menu pane that listed the five sections inside the right-hand panel — and that pane
// is gone: the sidebar's rows are labelled, and a row that is already named does not
// need a sentence explaining that Files holds files.
export const SECTIONS: Record<
  Section,
  {
    Icon: typeof Brain;
    label: (t: ChatDict) => string;
  }
> = {
  memory: { Icon: Brain, label: (t) => t.memory.title },
  graph: { Icon: Network, label: (t) => t.memoryGraph.title },
  tasks: { Icon: CalendarClock, label: (t) => t.scheduledTasks.title },
  files: { Icon: FileText, label: (t) => t.uploads.files },
  secrets: { Icon: KeyRound, label: (t) => t.secrets.title },
};

/**
 * What the right-hand pane should show after a section row is clicked.
 *
 * The sidebar row is the only control that can both open and close the pane, so the
 * rule lives beside the list rather than inside a component: clicking the section that
 * is already open closes it, anything else opens what was clicked. The collapsed rail
 * offers the same rows and asks the same question, which is the second reason this is
 * not a component's private branch.
 *
 * `current` is the raw fragment value, so it can be anything a member typed or a stale
 * link carries — `"menu"`, the list pane this product no longer has, among them. From
 * anything that is not the section being clicked, every click is an open.
 */
export function nextSidebarValue(current: string | null, clicked: Section): Section | null {
  return current === clicked ? null : clicked;
}

/**
 * The fragment's `rs` value as a Section, or null.
 *
 * `rs` is user-editable text. It was cast straight to a Section once, and the panel
 * indexes `SECTIONS` by it and calls `.label(t)` on the result — so `rs=garbage` was a
 * crash reachable from a hand-edited link. `"menu"` reads as null here too: it named a
 * list pane that is gone, and a link still carrying it asks for something this shell
 * cannot draw.
 */
export function asSection(value: string | null | undefined): Section | null {
  return SECTION_ORDER.includes(value as Section) ? (value as Section) : null;
}
