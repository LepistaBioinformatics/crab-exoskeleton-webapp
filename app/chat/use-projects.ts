"use client";

import { useCallback, useEffect, useState } from "react";
import { listProjects, onProjectsUpdated, type Project } from "@/lib/projects";
import type { Workspace } from "./fragment";

// The workspace's projects, shared between the sidebar's projects section and the
// collapsed rail that lists them as shortcuts.
//
// Shared for the reason useWorkspaceGroups is: two copies of this list would disagree
// the moment one of them changed it. Creating a project from the section has to make
// it appear on the rail, and deleting one has to remove it from both — with separate
// fetches the rail would keep offering a shortcut into a project that no longer
// exists, and the failure would look like a routing bug rather than a stale list.
//
// `reload` rather than a mutation API: the writes already go through lib/projects and
// return the server's own row, so the honest refresh is to re-read.
//
// The `onProjectsUpdated` subscription lives HERE rather than in each consumer, which
// is what actually makes the list shared -- and it is what this hook claimed and did
// not do. Two components call it, the projects screen and the shell; the screen
// reloaded its own copy after a create and the shell's went on describing the
// workspace as it was before, so the breadcrumb would not name the project the member
// had just been dropped into until the page was reloaded. The key is
// tenant|subscription|role, which a create does not change, so nothing else was ever
// going to re-read it.
export function useProjects(workspace: Workspace | null): {
  projects: Project[];
  /** An error CODE, resolved to a sentence at render time so a locale switch re-renders it. */
  error: string | null;
  reload: () => Promise<void>;
} {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Primitives in the dep list, never the object: ChatShell rebuilds `workspace` on
  // every one of its own renders, so depending on its identity re-fetches the list on
  // any unrelated re-render. `p` is deliberately absent — a project's siblings are the
  // same set from inside any one of them.
  const key = workspace ? `${workspace.t}|${workspace.s}|${workspace.r}` : null;

  const reload = useCallback(async () => {
    if (!workspace) return;
    try {
      setProjects(await listProjects(workspace));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!key) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listProjects(workspace!);
        if (!cancelled) {
          setProjects(list);
          setError(null);
        }
      } catch (e) {
        // An agent that has no projects at all answers `projects_unsupported` — only
        // an older proxy does, but the case is kept because it costs one branch. It is
        // not a failure to report, yet the code is still surfaced so callers can render
        // nothing rather than an empty section with a create button that cannot work.
        if (!cancelled) {
          setProjects([]);
          setError(e instanceof Error ? e.message : "unknown");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A write anywhere re-reads here. `reload` is already keyed on the same scope and
  // no-ops without a workspace, so a copy mounted on another scope costs one function
  // call and asks nothing.
  useEffect(() => onProjectsUpdated(() => void reload()), [reload]);

  return { projects, error, reload };
}
