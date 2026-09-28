"use client";


import { useState } from "react";
import { Search } from "lucide-react";
import { deleteConversation, type ConversationSummary } from "@/lib/chatSession";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFragment, type Workspace } from "./fragment";
import ConversationTree from "./conversation-tree";
import ConversationSearchBar from "./conversation-search-bar";
import SidebarPanel from "./sidebar-panel";
import { SectionHeader, SectionLabel } from "./sidebar-section";
import { useConversationSearch } from "./use-conversation-search";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import { useConversations } from "./use-conversations";

// The conversation list, and only that.
//
// It used to be a three-section panel: the workspace it belonged to, the projects
// beside it, and the chats. The first two are places now — the workspace is named by
// the breadcrumb across the top, projects are a screen of their own — so what is left
// is one list with the two controls that act on it.
export default function HistorySidebar({
  workspace,
  project,
  onSelect,
}: {
  workspace: Workspace;
  /** agent-projects: the project being browsed, from the fragment's `p`. */
  project: string | null;
  onSelect?: () => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);
  const fragment = useFragment();
  const activeSessionId = fragment?.sid;

  // agent-projects: which project's conversations this list shows. It comes from
  // the ROUTE, so it cannot disagree with the page the user is on.
  const browsedProject = project;

  // The list itself is not this panel's to own any more: the shell reads the same one
  // to name the open conversation in its breadcrumb. See use-conversations.ts.
  const { conversations, apply: applyToConversations } = useConversations(workspace);
  // Query, results and the two-stage filter behind them belong to the HOOK now: the
  // landing searches the same conversations with the same grammar, and two copies of a
  // query parser is how two surfaces start accepting different queries.
  const {
    query,
    setQuery,
    results: searchResults,
    searching,
    applyToResults,
  } = useConversationSearch(workspace, conversations);
  // Behind a magnifier, matching the workspaces panel. The search and its filter pills
  // are a four-row block, and they sat permanently above a list whose first rows are
  // what a member came here to click.
  const [searchOpen, setSearchOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Applies a change to a single conversation across both the base list and the
  // (optional) search results, mirroring the optimistic updates rename/delete do.
  function applyToLists(id: string, fn: (c: ConversationSummary) => ConversationSummary) {
    const map = (list: ConversationSummary[]) => list.map((c) => (c.id === id ? fn(c) : c));
    applyToConversations(map);
    applyToResults(map);
  }


  // A project's conversations are a SEPARATE list, not a subset shown alongside
  // the others: entering a project replaces what the sidebar lists, and the
  // unscoped list shows only the chats that belong to no project. Mixing them
  // would defeat the point of a project, which is to keep a subject apart.
  //
  // Filtered client-side because the full list is already fetched for search and
  // for the tree view, both of which need every conversation to build from.
  const inBrowsedProject = (c: ConversationSummary) => (c.project ?? null) === browsedProject;
  const visible = (searchResults ?? conversations).filter(inBrowsedProject);

  async function onDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteConversation(id);
      const drop = (list: ConversationSummary[]) => list.filter((c) => c.id !== id);
      applyToConversations(drop);
      applyToResults(drop);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(errorText(e, err instanceof Error ? err.message : null));
    }
  }

  const pendingDelete = deletingId ? visible.find((c) => c.id === deletingId) : null;

  // Whose chats these are: the project's while inside one, the agent's own otherwise.
  // Two separate lists, not one list filtered — a project's transcripts live in that
  // project's workspace directory.
  const chatsLabel = browsedProject ? t.projects.projectChats : t.history.globalChats;

  return (
    // NO HEADER. The panel used to lead with the subscription and agent, doubling as
    // the way back to the workspace list. Both jobs moved: the breadcrumb across the top
    // of the shell names the workspace, and the way out is its root segment. A header
    // here would be the same information twice, in the corner furthest from the other
    // copy — which is the complaint this whole feature answers.
    <SidebarPanel scrollBody={false}>
      {/* The magnifier sits at the HEAD OF THE LIST it acts on. That placement is the one
          thing worth carrying over from the three-section version: it used to live in the
          panel's top row, separated from its list by an entire projects section, and moving
          it down was the fix. Dissolving the sections must not quietly undo it.

          The List|Tree switch stood beside it until the tree became the only rendering.
          There is nothing to switch between now, and a control with one state is a control
          that teaches the member to expect a second one. */}
      <SectionHeader
        label={<SectionLabel>{chatsLabel}</SectionLabel>}
        actions={
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.search.placeholder}
            aria-expanded={searchOpen}
            onClick={() => {
              // Closing clears the query, for the reason the workspace filter does: a
              // hidden search still narrowing the list is the worst of both, since the
              // reason conversations are missing is off screen.
              if (searchOpen) setQuery("");
              setSearchOpen((v) => !v);
            }}
          >
            <Search size={16} aria-hidden />
          </IconButton>
        }
      />

      {searchOpen && (
        <div className="shrink-0 px-2 pb-3 pt-2">
          <ConversationSearchBar
            value={query}
            onChange={setQuery}
            conversations={conversations}
            searching={searching}
            // Mounting IS opening here: this bar exists only while the magnifier is on.
            autoFocus
          />
        </div>
      )}

      {/* Unmounted while folded, not merely hidden: ConversationTree measures its own
          layout in a useLayoutEffect, and `display:none` would have it measure zero and
          come back wrong. Remounting re-measures. */}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {searching && (
          <div className="flex justify-center py-4">
            <Spinner size={20} />
          </div>
        )}
        {/* The tree owns "no conversations yet" — it is what knows whether the histories
            came back empty. It knows nothing about the SEARCH, though, so a query that
            matched nothing is said here; left to the tree, a member with forty
            conversations would be told they have none. */}
        {!searching && query.trim() && visible.length === 0 ? (
          <PanelEmpty
            icon={Search}
            title={t.history.noMatches}
            body={t.history.noMatchesHint}
          />
        ) : (
          !searching && (
            <ConversationTree
              workspace={workspace}
              conversations={visible}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onApply={applyToLists}
              // The confirmation and the optimistic drop stay HERE: the drop has to reach
              // the conversation list and the search results both, and this is the only
              // component holding the two.
              onDelete={(conversation) => {
                setDeleteError(null);
                setDeletingId(conversation.id);
              }}
            />
          )
        )}
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title={t.history.deleteTitle}
        message={
          deleteError ??
          t.history.deleteMessage.replace("{title}", pendingDelete?.title ?? t.history.deleteFallbackTitle)
        }
        confirmLabel={c.actions.delete}
        onConfirm={() => deletingId && onDelete(deletingId)}
        onCancel={() => {
          setDeletingId(null);
          setDeleteError(null);
        }}
      />
    </SidebarPanel>
  );
}
