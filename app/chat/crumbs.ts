import type { ChatDict } from "@/lib/i18n/chat";
import type { Project } from "@/lib/projects";
import type { Destination } from "./destination";
import type { Workspace } from "./fragment";

// WHAT THE TOP BAR SAYS about where the member is standing — `subscription · agent /
// Projects / project / the place itself` (FR-1).
//
// Its own module because the presence rules are the part that gets read wrong, and the
// one that did was containment: `Projects` used to be the LAST segment, so standing in a
// project and asking for the list read `agent / Legal / Projects` — the list rendered as
// a child of a project it contains. It sits above the project now, which is the order a
// member walks: through the list, into a project, into a conversation.
//
// A rule that can only be checked by mounting a bar is a rule nobody checks — so this is
// React-free and DOM-free, like destination.ts and for the same reason (the suite runs
// `environment: "node"`).
//
// Navigation arrives as callbacks rather than as a call into fragment.ts's setters:
// importing those would put a browser back between this module and its test, which is
// the whole thing this split exists to avoid.

export interface Crumb {
  key: "workspace" | "projects" | "project" | "mangrove" | "leaf";
  label: string;
  /** Absent on the last crumb, unless that crumb is the root. */
  go?: () => void;
}

export function buildCrumbs({
  workspace,
  subscription,
  project,
  conversationTitle,
  destination,
  t,
  onWorkspace,
  onProjects,
  onProject,
}: {
  workspace: Workspace | null;
  /** The subscription's own name, already resolved by the shell. Null until the tree loads. */
  subscription: string | null;
  project: Project | null;
  conversationTitle: string | null;
  destination: Destination | null;
  t: ChatDict;
  /** Leave the workspace: the agent grid. */
  onWorkspace: () => void;
  /** The projects grid, keeping the project the member is in (FR-1.5). */
  onProjects: () => void;
  /**
   * Back up to the project itself — its landing, not the list of projects.
   *
   * This used to be the list, which was the navigation half of the inversion above:
   * clicking a project's own name answered with the list of every project. With
   * `Projects` above it carrying that link, one level up from a conversation is the
   * project, and the project is a place with a screen of its own.
   */
  onProject: () => void;
}): Crumb[] {
  // No workspace means the agent grid, which names itself. A lone crumb over it would
  // be a path to the screen already being looked at.
  if (!workspace) return [];

  const crumbs: Crumb[] = [
    {
      key: "workspace",
      // The subscription leads and the agent qualifies it, the way today's chat header
      // reads it: the subscription is what tells two otherwise identical agents apart.
      // With no name to lead with, the header falls back to the agent alone and so does
      // this — the only other thing a workspace carries is `s`, a uuid, and a uuid in
      // the slot a member reads for "where am I" is worse than the shorter answer.
      label: subscription
        ? `${subscription} · ${workspace.r}`
        : `${t.view.agentPrefix} ${workspace.r}`,
      go: onWorkspace,
    },
  ];

  // `Projects` is present when there is a project to contain OR a list being looked at,
  // and absent otherwise (FR-1.5). An agent with neither is not somewhere below a list
  // of projects — it is the agent — and a segment naming one would be a level the
  // member never walked through.
  if (project || destination === "projects") {
    crumbs.push({ key: "projects", label: t.projects.title, go: onProjects });
  }


  if (project) crumbs.push({ key: "project", label: project.name, go: onProject });

  // THE MANGROVE IS NOT HERE ANY MORE, and the rule below is the reason. It was a
  // centre destination and got a crumb; it is a right-pane section now, and the
  // paragraph under this one says why no section ever appears in the path: a pane
  // beside the transcript is not a place you are standing.

  // The conversation, and only when the centre is showing it. On the projects list the
  // path ends at the project (or at `Projects` with none open): the list is where the
  // member came through and the project is where they are, which the grid also marks.
  //
  // THE FIVE SECTION NAMES NEVER APPEAR HERE, and that is the correction of 2026-09-12.
  // They were leaves for as long as they were centre destinations; they open in a pane
  // beside the conversation now, and a pane is not a place you are standing — a
  // breadcrumb reading `… / Files` while the transcript is still on screen would name
  // somewhere the member has not gone.
  if (!destination && conversationTitle) {
    crumbs.push({ key: "leaf", label: conversationTitle });
  }

  // THE LAST CRUMB HAS NO LINK, unless it is the root. Rebuilt without `go` rather than
  // overwritten with undefined, because a bar that renders a `<button>` for the place
  // you are already standing is a control that looks like it goes somewhere and does
  // not.
  //
  // The exception is not a special case bolted on: the workspace segment is the ONLY way
  // to the agent grid, so stripping its link when the path is one crumb long — an agent
  // with no conversation open — left the member with no way back out of it at all.
  const last = crumbs[crumbs.length - 1];
  if (last.key !== "workspace") {
    crumbs[crumbs.length - 1] = { key: last.key, label: last.label };
  }
  return crumbs;
}
