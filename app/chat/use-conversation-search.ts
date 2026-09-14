"use client";

import { useEffect, useState } from "react";
import type { ConversationSummary } from "@/lib/chatSession";
import type { Workspace } from "./fragment";
import {
  applyContentFilter,
  applySyncFilters,
  isEmptyQuery,
  parseFilterQuery,
} from "./conversation-filter";
import { getHistory } from "./history-cache";

// SEARCHING A CONVERSATION LIST, shared by the two surfaces that do it.
//
// It lived inside HistorySidebar, which was right while the sidebar was the only place
// a member could search. The landing searches the same conversations with the same
// grammar, and two copies of a query parser is how two surfaces start accepting
// different queries — a `date:` that works in one column and not in the other is a bug
// nobody would think to look for.
//
// Two-stage on purpose: a synchronous predicate (tag/alias/date) narrows the set
// instantly, then an async content stage (`text:`) runs only over the survivors, reading
// message history from the shared cache. The AbortController guarantees
// latest-query-wins, so a slow earlier keystroke cannot clobber fresh results.
export function useConversationSearch(
  workspace: Workspace,
  conversations: ConversationSummary[],
): {
  query: string;
  setQuery: (query: string) => void;
  /**
   * Null while the query is empty — "no filter", which is not the same as "filtered to
   * nothing" and must not render as an empty list.
   */
  results: ConversationSummary[] | null;
  /** A content pass is running. Only `text:` reaches this; the rest is synchronous. */
  searching: boolean;
  /** Patches the results in place, for the optimistic rename/delete the sidebar does. */
  applyToResults: (fn: (list: ConversationSummary[]) => ConversationSummary[]) => void;
} {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConversationSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const parsed = parseFilterQuery(query, Date.now());
    if (isEmptyQuery(parsed)) {
      setResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      const synced = applySyncFilters(conversations, parsed);
      if (parsed.texts.length === 0) {
        setResults(synced);
        setSearching(false);
        return;
      }
      setSearching(true);
      const matched = await applyContentFilter(
        synced,
        parsed.texts,
        (c) => getHistory(workspace, c),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResults(matched);
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // Primitives, never the workspace object: every caller rebuilds it on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, conversations, workspace.t, workspace.s, workspace.r]);

  return {
    query,
    setQuery,
    results,
    searching,
    applyToResults: (fn) => setResults((prev) => (prev ? fn(prev) : prev)),
  };
}
