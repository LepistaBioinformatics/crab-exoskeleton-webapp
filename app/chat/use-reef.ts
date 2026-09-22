"use client";

import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "./fragment";
import {
  readCapabilities,
  readTimeline,
  ReefError,
  type ReefCapabilities,
  type ReefReading,
  type ReefTimeline,
} from "@/lib/reef";

/**
 * The reef's data for one workspace and one reading.
 *
 * FOUR STATES, NOT TWO. `loading` is not `empty`, and neither is an error; and
 * `off` is not an error at all. A deployment that never enabled the reef must
 * see the tab disappear, not a tab that loads and then apologises — the same
 * treatment `projects_unsupported` gets, for the same reason.
 */
export function useReef(workspace: Workspace | null, reading: ReefReading) {
  const [timeline, setTimeline] = useState<ReefTimeline | null>(null);
  const [caps, setCaps] = useState<ReefCapabilities | null>(null);
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
      setError(err instanceof ReefError ? err.code : "unknown");
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
    /** The operator never switched the reef on. Hide the tab, do not explain it. */
    off: error === "reef_off",
  };
}
