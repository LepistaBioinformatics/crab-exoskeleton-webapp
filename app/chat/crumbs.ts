import type { ChatDict } from "@/lib/i18n/chat";
import type { Project } from "@/lib/projects";
import type { Destination } from "./destination";
import type { Workspace } from "./fragment";

// WHAT THE TOP BAR SAYS about where the member is standing — `subscription · agent /
// project / the place itself` (FR-3.2).
//
// Its own module because the presence rules are the part that gets read wrong, and the
// one that does is `v=projects` inside a project: the project stays named, because the
// member is still in it (FR-1.5). A rule that can only be checked by mounting a bar is
// a rule nobody checks — so this is React-free and DOM-free, like destination.ts and
// for the same reason (the suite runs `environment: "node"`).
//
// Navigation arrives as callbacks rather than as a call into fragment.ts's setters:
// importing those would put a browser back between this module and its test, which is
// the whole thing this split exists to avoid.

export interface Crumb {
  key: "workspace" | "project" | "leaf";
  label: string;
  /** Absent on the last crumb: the place you already are is not a link. */
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

  if (project) crumbs.push({ key: "project", label: project.name, go: onProject });

  // The last segment is one thing at a time: the projects screen replaces the
  // conversation's title rather than sitting beside it, because the breadcrumb states
  // where the member IS and the projects screen is instead of the transcript.
  //
  // THE FIVE SECTION NAMES NEVER APPEAR HERE, and that is the correction of 2026-09-12.
  // They were leaves for as long as they were centre destinations; they open in a pane
  // beside the conversation now, and a pane is not a place you are standing — a
  // breadcrumb reading `… / Files` while the transcript is still on screen would name
  // somewhere the member has not gone.
  const leaf = destination ? t.projects.title : conversationTitle;
  if (leaf) crumbs.push({ key: "leaf", label: leaf });

  // The LEAF has no link, and only the leaf. Rebuilt without `go` rather than
  // overwritten with undefined, because a bar that renders a `<button>` for the place
  // you are already standing is a control that looks like it goes somewhere and does
  // not.
  //
  // "The last crumb" was the rule for a while and it was subtly wrong: with a workspace
  // open and nothing else — an agent whose conversation has not been chosen yet — the
  // workspace IS the last crumb, and stripping its link left the agent grid with no way
  // back to it at all. The grid is reached from this segment and nowhere else, so the
  // root keeps its link however short the path is.
  const last = crumbs[crumbs.length - 1];
  if (last.key === "leaf") {
    crumbs[crumbs.length - 1] = { key: last.key, label: last.label };
  }
  return crumbs;
}
