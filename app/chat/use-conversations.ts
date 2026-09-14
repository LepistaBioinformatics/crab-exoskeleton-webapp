"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listConversations,
  onConversationsUpdated,
  type ConversationSummary,
} from "@/lib/chatSession";
import type { Workspace } from "./fragment";

// The workspace's conversations, shared between the history sidebar's list and the
// shell, whose breadcrumb ends in the open conversation's title.
//
// Shared for the reason useProjects is: two fetches would drift the moment one of them
// renamed or deleted a conversation. A rename in the sidebar has to change the
// breadcrumb, and a delete has to empty it — with separate fetches the breadcrumb would
// go on naming a conversation that no longer exists, and the failure would look like a
// stale title rather than a stale list.
//
// The `onConversationsUpdated` subscription lives HERE rather than in each consumer,
// which is the other half of the same argument: one listener refreshes everyone, so a
// turn finishing or a tree node being retitled cannot reach one copy of the list and
// miss another.
export function useConversations(workspace: Workspace | null): {
  conversations: ConversationSummary[];
  /**
   * The first read for this scope has come back. `conversations` starts `[]` and fills
   * from an effect, so without this a caller cannot tell "none yet" from "not asked
   * yet" -- and the landing, which is the screen a member lands on four different ways,
   * painted "No conversations yet" for a tick on every one of them.
   *
   * The sidebar has the same flash and does not read this. Left alone deliberately: it
   * predates this feature and fixing it there is a change to a surface nobody reported.
   */
  loaded: boolean;
  /** An error CODE, resolved to a sentence at render time so a locale switch re-renders it. */
  error: string | null;
  reload: () => Promise<void>;
  /**
   * Patches the list in place, for the optimistic rename/delete/enrich the sidebar
   * already does. useProjects deliberately has no mutation API — its writes return the
   * server's own row, so re-reading is the honest refresh — but a conversation's row is
   * edited while the list is on screen, and re-reading instead would make every rename
   * a round trip the member watches.
   */
  apply: (fn: (list: ConversationSummary[]) => ConversationSummary[]) => void;
} {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Primitives in the dep list, never the object: ChatShell rebuilds `workspace` on
  // every one of its own renders.
  //
  // `p` IS part of the key, which is where this hook parts company with useProjects.
  // It used not to be, because entering a project was a route change and the panel was
  // remounted — the refetch came for free. Now that the project is a fragment write
  // there is no remount, so without this the list would keep showing the conversations
  // the member was looking at before they entered.
  const key = workspace
    ? `${workspace.t}|${workspace.s}|${workspace.r}|${workspace.p ?? ""}`
    : null;

  const reload = useCallback(async () => {
    if (!workspace) return;
    try {
      setConversations(await listConversations(workspace, () => router.push("/signin")));
      setError(null);
      setLoaded(true);
    } catch {
      setError("connectivity");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!key) {
      setConversations([]);
      setLoaded(false);
      return;
    }
    // A NEW SCOPE HAS NOT BEEN READ YET. Without this, switching into a project carries
    // the previous scope's `loaded` and the list below reads as settled while it is
    // still the agent's.
    setLoaded(false);
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await listConversations(workspace!, () => router.push("/signin"));
        if (!cancelled) {
          setConversations(list);
          setError(null);
          setLoaded(true);
        }
      } catch {
        // The list is LEFT ALONE, unlike useProjects, which empties it. A conversation
        // list that blanks itself on one failed poll loses the member's place; the
        // error code says the last read failed, and the rows on screen are still the
        // last answer the server gave.
        // `loaded` is set either way: the read finished, and what is on screen is the
        // last answer the server gave. A failed poll must not put the caller back into
        // "still asking" forever.
        if (!cancelled) {
          setError("connectivity");
          setLoaded(true);
        }
      }
    };
    void refresh();
    const unsubscribe = onConversationsUpdated(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // The key ALONE, not the router as well. `useRouter` is a stable reference in
    // Next, but depending on its identity makes this effect hostage to that staying
    // true — and a re-subscribing effect here does not merely re-render, it re-reads
    // the list on every render forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const apply = useCallback(
    (fn: (list: ConversationSummary[]) => ConversationSummary[]) => setConversations(fn),
    [],
  );

  return { conversations, loaded, error, reload, apply };
}
