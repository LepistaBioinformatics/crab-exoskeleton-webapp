"use client";

import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "./fragment";
import {
  readCapabilities,
  readTimeline,
  MangroveError,
  type MangroveCapabilities,
  type MangroveReading,
  type MangroveTimeline,
} from "@/lib/mangrove";

/**
 * The mangrove's data for one workspace and one reading.
 *
 * FOUR STATES, NOT TWO. `loading` is not `empty`, and neither is an error; and
 * `off` is not an error at all. A deployment that never enabled the mangrove must
 * see the tab disappear, not a tab that loads and then apologises — the same
 * treatment `projects_unsupported` gets, for the same reason.
 */
/**
 * How often a mounted mangrove re-reads itself.
 *
 * The mangrove is the one section of this pane whose content is written by SOMEBODY
 * ELSE. Files, memory, the graph and tasks all change because this member or their
 * own agent changed them, so the pane is looking at them when they change; a claim
 * from another member's agent arrives while the member is reading the conversation
 * beside it, and nothing on screen would say so until they closed the pane and opened
 * it again.
 */
const POLL_MS = 60_000;

export function useMangrove(
  workspace: Workspace | null,
  reading: MangroveReading,
  /** Bumped by the pane header's refresh control, the same counter the graph and
   *  tasks panels take. In the deps of the load below rather than of the fetch
   *  itself, so "look again" means exactly what the first read meant. */
  refreshSignal = 0,
) {
  const [timeline, setTimeline] = useState<MangroveTimeline | null>(null);
  const [caps, setCaps] = useState<MangroveCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * `quiet` is the poll, and it differs in BOTH directions.
   *
   * It does not raise `loading` -- which would hide the "nothing yet" state for a
   * beat every minute, so an empty mangrove would flicker between two empty states
   * forever. And it does not clear what is on screen when it fails: a read the
   * member never asked for must not be able to replace a feed they are reading with
   * an error, so a failed poll leaves the last good answer exactly where it is and
   * waits for the next one. A read the member DID ask for still reports.
   */
  const load = useCallback(
    async (quiet = false) => {
      if (!workspace) return;
      if (!quiet) setLoading(true);
      try {
        const [tl, cp] = await Promise.all([
          readTimeline(workspace, reading),
          readCapabilities(workspace),
        ]);
        setTimeline(tl);
        setCaps(cp);
        setError(null);
      } catch (err) {
        if (quiet) return;
        setTimeline(null);
        setError(err instanceof MangroveError ? err.code : "unknown");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [workspace, reading],
  );

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // THE POLL. Skipped while the tab is hidden -- a mangrove left open in a background
  // tab would otherwise read itself all day for nobody -- and not started at all once
  // the deployment has answered `mangrove_off`, which is not a state that changes
  // without an operator restarting the proxy.
  useEffect(() => {
    if (!workspace || error === "mangrove_off") return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, workspace, error]);

  return {
    timeline,
    caps,
    error,
    loading,
    reload: load,
    /** The operator never switched the mangrove on. Hide the tab, do not explain it. */
    off: error === "mangrove_off",
  };
}

/**
 * Whether this deployment has a mangrove at all, for a surface that is not the tab.
 *
 * THREE ANSWERS, AND THE THIRD IS THE POINT. `null` means "not known yet": the files
 * tab and the graph panel offer a share control, and a control that appeared a beat
 * after the panel — or appeared and then vanished — is worse than one that arrives
 * once the answer is in. Callers render on `true` only.
 *
 * Capabilities and not the timeline, because the question is about the DEPLOYMENT and
 * a timeline read is a reading's worth of work for an answer that does not depend on
 * one. A mangrove that is configured but unreachable answers `true`: the tab is there,
 * it says so itself, and hiding the way in would be this app deciding a transient
 * outage means the operator never enabled the feature.
 *
 * A PROJECT WORKSPACE ANSWERS FALSE. The mangrove's routes take a tenant and a
 * subscription and no project, so the proxy resolves a shared file path and an entity
 * name against the agent's OWN workspace — a project file shared from here would
 * publish the wrong file or none. Absent rather than refusing, which is the rule the
 * rest of this tab follows.
 */
export function useMangroveEnabled(workspace: Workspace | null): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // The FIELDS in the deps, not the object. The shell rebuilds the workspace literal on
  // every render of its own (it folds the project onto it), so an effect keyed on the
  // object would re-ask on every unrelated re-render — and this one is asked from a pane
  // that mounts beside a live conversation.
  // The project is in the deps but not in the question: sharing works inside a
  // project, because publish and merge carry it and the proxy resolves the path
  // or the entity name against THAT workspace. It stays a dependency so a
  // project switch re-asks rather than reusing the previous scope's answer.
  const { t, s, r, p } = { t: workspace?.t, s: workspace?.s, r: workspace?.r, p: workspace?.p };

  useEffect(() => {
    if (!t || !s || !r) {
      setEnabled(null);
      return;
    }
    let live = true;
    readCapabilities({ t, s, r }).then(
      () => {
        if (live) setEnabled(true);
      },
      (err) => {
        if (live) setEnabled(!(err instanceof MangroveError && err.code === "mangrove_off"));
      },
    );
    return () => {
      live = false;
    };
  }, [t, s, r, p]);

  return enabled;
}
