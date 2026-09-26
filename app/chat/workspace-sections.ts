import { BookText, Brain, CalendarClock, FileText, KeyRound, Network, Share2 } from "lucide-react";
import type { ChatDict } from "@/lib/i18n/chat";

// What a workspace holds, and the one list every rendering of it reads.
//
// Written when three surfaces showed these — the right rail, the mobile expander and
// the sidebar's own legacy menu pane. All three are gone and the reason survived them:
// the sidebar's section rows, the collapsed rail and the pane's own heading read this
// list now, and three copies of a list is three places that can disagree about what a
// workspace has.
//
// Ordered deliberately: the mangrove leads, then memory and the graph are what a
// member asks about ("what does it know about me"), scheduled tasks are what it does
// on its own, and files, secrets and skills are what they manage.
export type Section =
  | "mangrove"
  | "memory"
  | "graph"
  | "tasks"
  | "files"
  | "secrets"
  | "skills";

// THE MANGROVE IS FIRST, and it used to be last for a reason that stopped being true.
//
// The old argument: everything else is scoped BY this workspace and shared memory is
// not, so last is where a reader looks for the odd one out. That held while the
// mangrove was a SCREEN a member navigated to. It is a tool in this pane now, opened
// beside a live conversation so posts can be managed while talking to the agent --
// and the whole point of that move was reach. A row a member has to scroll past six
// others to find is the move half-made.
//
// So the ordering rule changed rather than being violated: the list now leads with
// what the member came here to do, and the taxonomy below orders the rest. The odd
// one out is still the odd one out; being named first is not a claim that it is
// scoped by this workspace, and nothing reads position to decide scope.
export const SECTION_ORDER: Section[] = [
  "mangrove",
  "memory",
  "graph",
  "tasks",
  "files",
  "secrets",
  // BESIDE SECRETS. Skills join the run of things the member manages about THIS
  // workspace, which is what the order's last clause names.
  "skills",
];

// THE BLURB IS BACK, and the reason it was deleted is the reason it returns.
//
// It went when the pane that listed the five sections with a sentence under each did:
// the sidebar's rows are LABELLED, and a row already reading "Files" does not need a
// line saying Files holds files. That argument holds wherever the label is on screen.
// The COLLAPSED RAIL is where it does not — there the row is a bare glyph, and with
// `title` replaced by a real tooltip the sentence is the only thing that says what the
// glyph opens. So the blurb has exactly one reader again, and a different one.
export const SECTIONS: Record<
  Section,
  {
    Icon: typeof Brain;
    label: (t: ChatDict) => string;
    blurb: (t: ChatDict) => string;
  }
> = {
  memory: { Icon: Brain, label: (t) => t.memory.title, blurb: (t) => t.uploads.sections.memory },
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
  files: { Icon: FileText, label: (t) => t.uploads.files, blurb: (t) => t.uploads.sections.files },
  secrets: {
    Icon: KeyRound,
    label: (t) => t.secrets.title,
    blurb: (t) => t.uploads.sections.secrets,
  },
  // Three layers of skill reach an agent and only one of them is the member's, so
  // the label is the plain noun and the pane is where the distinction gets made.
  skills: {
    Icon: BookText,
    label: (t) => t.skills.title,
    blurb: (t) => t.uploads.sections.skills,
  },
  // IT USED TO BE A DESTINATION, one of two things that replaced the centre. Reading
  // what a colleague shared meant putting the conversation away, which is the opposite
  // of what it is for: the member manages posts WITH the agent, and the agent is in the
  // conversation.
  mangrove: {
    Icon: Share2,
    label: (t) => t.mangrove.title,
    blurb: (t) => t.uploads.sections.mangrove,
  },
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
