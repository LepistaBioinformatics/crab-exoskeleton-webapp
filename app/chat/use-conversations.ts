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
    } catch {
      setError("connectivity");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!key) {
      setConversations([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await listConversations(workspace!, () => router.push("/signin"));
        if (!cancelled) {
          setConversations(list);
          setError(null);
        }
      } catch {
        // The list is LEFT ALONE, unlike useProjects, which empties it. A conversation
        // list that blanks itself on one failed poll loses the member's place; the
        // error code says the last read failed, and the rows on screen are still the
        // last answer the server gave.
        if (!cancelled) setError("connectivity");
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

  return { conversations, error, reload, apply };
}
