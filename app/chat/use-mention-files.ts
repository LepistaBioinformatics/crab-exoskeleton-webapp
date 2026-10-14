"use client";

import { useEffect, useState } from "react";
import { listWorkspaceMedia } from "@/lib/media";
import type { MentionCandidate } from "@/lib/fileMentions";
import { subscribeToMediaChanged } from "./media-refresh-bus";
import type { Workspace } from "./fragment";

/**
 * What `@` can reference in this workspace -- or this project, through `p`.
 *
 * Shared by the conversation and the landing, the two places a composer sits. Each
 * holds its own copy because each also RESOLVES what was typed against it at send time,
 * and the menu and the resolution must not disagree about what exists. Refreshed by the
 * media bus, so a file uploaded from anywhere is mentionable at once.
 */
export function useMentionFiles(workspace: Workspace): MentionCandidate[] {
  const [files, setFiles] = useState<MentionCandidate[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => subscribeToMediaChanged(() => setRefresh((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    listWorkspaceMedia(workspace)
      .then((list) => {
        if (cancelled) return;
        // Folders are branches, not things to reference.
        setFiles(list.filter((f) => !f.isDir).map((f) => ({ name: f.name, path: f.path })));
      })
      .catch(() => {
        // A failed listing means `@` offers nothing; it must never break composing.
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r, workspace.p, refresh]);

  return files;
}
