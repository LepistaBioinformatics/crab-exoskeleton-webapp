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
export function useMangrove(workspace: Workspace | null, reading: MangroveReading) {
  const [timeline, setTimeline] = useState<MangroveTimeline | null>(null);
  const [caps, setCaps] = useState<MangroveCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const [tl, cp] = await Promise.all([
        readTimeline(workspace, reading),
        readCapabilities(workspace),
      ]);
      setTimeline(tl);
      setCaps(cp);
      setError(null);
    } catch (err) {
      setTimeline(null);
      setError(err instanceof MangroveError ? err.code : "unknown");
    } finally {
      setLoading(false);
    }
  }, [workspace, reading]);

  useEffect(() => {
    void load();
  }, [load]);

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
