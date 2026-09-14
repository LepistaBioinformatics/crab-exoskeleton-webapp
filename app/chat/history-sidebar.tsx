"use client";


import { useEffect, useState } from "react";
import {
  Check,
  GitBranch,
  List,
  MessageSquare,
  Pencil,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteConversation,
  renameConversation,
  type ConversationSummary,
} from "@/lib/chatSession";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cva } from "class-variance-authority";
import {
  useFragment,
  setFragmentSid,
  setHistoryView,
  type Workspace,
} from "./fragment";
import ConversationTree from "./conversation-tree";
import { TagCluster, ConversationEditor } from "./conversation-enrichment";
import ConversationSearchBar from "./conversation-search-bar";
import SidebarPanel from "./sidebar-panel";
import { SectionHeader, SectionLabel } from "./sidebar-section";
import { useConversationSearch } from "./use-conversation-search";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import { useConversations } from "./use-conversations";

const conversationRow = cva(
  // Column on mobile (name on top, actions below); row on desktop with the
  // actions absolutely positioned so they reserve no width (the name never
  // truncates just to make room for hidden buttons). `group/row` scopes the
  // per-row hover/focus reveal so only the row under the cursor shows actions.
  "group/row relative flex w-full flex-col rounded-lg transition md:flex-row md:items-center md:pr-1",
  {
    variants: {
      active: { true: "bg-accent/12", false: "hover:bg-elevated/60" },
    },
    defaultVariants: { active: false },
  },
);

// The List | Tree segmented control (see .specs/features/conversation-tree-view).
const viewToggle = cva(
  "flex h-6 w-7 items-center justify-center rounded-md transition-colors",
  {
    variants: {
      active: { true: "bg-accent/15 text-accent", false: "text-fg-muted hover:text-fg" },
    },
    defaultVariants: { active: false },
  },
);

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

  // Tree (default) vs. List view, persisted in the URL (fragment `hv`) so a
  // reload or shared link keeps the chosen mode.
  const view: "list" | "tree" = fragment?.hv === "list" ? "list" : "tree";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

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

  // Every conversation in this list belongs to THIS page's project (the list is
  // filtered on exactly that), so opening one is a plain sid change — no project
  // to restore, and no way for the two to disagree. That is the property the
  // route buys: with the project in the fragment, a conversation and a project
  // could drift apart, and the drift was silent.
  function onOpenConversation(id: string) {
    setFragmentSid(id);
    onSelect?.();
  }

  function startRename(conversation: ConversationSummary) {
    setEditingId(conversation.id);
    setDraft(conversation.title);
    setRenameError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setRenameError(null);
  }

  async function submitRename(id: string) {
    const title = draft.trim();
    if (!title) {
      setRenameError(t.history.titleEmpty);
      return;
    }
    try {
      const saved = await renameConversation(id, title);
      const apply = (list: ConversationSummary[]) =>
        list.map((c) => (c.id === id ? { ...c, title: saved } : c));
      applyToConversations(apply);
      applyToResults(apply);
      setEditingId(null);
      setRenameError(null);
    } catch (err) {
      setRenameError(errorText(e, err instanceof Error ? err.message : null));
    }
  }

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
      {/* The magnifier and the List|Tree switch sit at the HEAD OF THE LIST they act
          on. That placement is the one thing worth carrying over from the three-section
          version: these controls used to live in the panel's top row, separated from
          their list by an entire projects section, and moving them down was the fix.
          Dissolving the sections must not quietly undo it.

          The fold is gone with the sections. There is one list here now, and "show me
          less of the only thing in this column" is not something to want. */}
      <SectionHeader
        label={<SectionLabel>{chatsLabel}</SectionLabel>}
        actions={
          <>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={t.search.placeholder}
                aria-expanded={searchOpen}
                onClick={() => {
                  // Closing clears the query, for the reason the workspace filter does:
                  // a hidden search still narrowing the list is the worst of both, since
                  // the reason conversations are missing is off screen.
                  if (searchOpen) setQuery("");
                  setSearchOpen((v) => !v);
                }}
              >
                <Search size={16} aria-hidden />
              </IconButton>
              <div className="flex shrink-0 items-center rounded-lg border border-rule-strong bg-elevated p-0.5">
                <button
                  type="button"
                  onClick={() => setHistoryView("list")}
                  className={viewToggle({ active: view === "list" })}
                  aria-label={t.history.listView}
                  aria-pressed={view === "list"}
                  title={t.history.list}
                >
                  <List size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryView("tree")}
                  className={viewToggle({ active: view === "tree" })}
                  aria-label={t.history.treeView}
                  aria-pressed={view === "tree"}
                  title={t.history.tree}
                >
                  <GitBranch size={14} aria-hidden />
                </button>
              </div>
          </>
        }
      />

      {searchOpen && (
        <div className="shrink-0 px-2 pb-3 pt-2">
          <ConversationSearchBar
            value={query}
            onChange={setQuery}
            conversations={conversations}
            searching={searching}
          />
        </div>
      )}

      {/* Unmounted while folded, not merely hidden: ConversationTree measures its own
          layout in a useLayoutEffect, and `display:none` would have it measure zero and
          come back wrong. Remounting re-measures. */}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {view === "tree" ? (
          <ConversationTree
            workspace={workspace}
            conversations={visible}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
            onApply={applyToLists}
          />
        ) : (
          <>
        {searching && (
          <div className="flex justify-center py-4">
            <Spinner size={20} />
          </div>
        )}
        {!searching &&
          visible.length === 0 &&
          (query.trim() ? (
            <PanelEmpty
              icon={Search}
              title={t.history.noMatches}
              body={t.history.noMatchesHint}
            />
          ) : (
            <PanelEmpty
              icon={MessageSquare}
              title={t.history.noneYet}
              body={t.history.noneYetHint}
            />
          ))}
        {!searching &&
          visible.map((conversation) => {
            const active = conversation.id === activeSessionId;
            if (editingId === conversation.id) {
              return (
                <form
                  key={conversation.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename(conversation.id);
                  }}
                  className="flex flex-col gap-1 px-1 py-1"
                >
                  <div className="flex items-center gap-1">
                    <Input
                      inputSize="sm"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelRename();
                      }}
                      aria-label={t.history.renameAria}
                    />
                    <IconButton type="submit" variant="ghost" size="sm" aria-label={c.actions.save} title={c.actions.save}>
                      <Check size={16} aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={c.actions.cancel}
                      title={c.actions.cancel}
                      onClick={cancelRename}
                    >
                      <X size={16} aria-hidden />
                    </IconButton>
                  </div>
                  {renameError && <p className="px-1 text-xs text-red-500">{renameError}</p>}
                </form>
              );
            }
            const enriching = enrichingId === conversation.id;
            return (
              <div key={conversation.id}>
                <div className={conversationRow({ active })}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conversation.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="w-full truncate text-sm text-fg">
                        {conversation.title}
                      </span>
                      {conversation.alias && (
                        // The title (derived from the message) stays primary; the
                        // user's alias sits below it in smaller, muted type.
                        <span className="w-full truncate text-xs text-fg-muted">
                          {conversation.alias}
                        </span>
                      )}
                    </span>
                    {conversation.tags.length > 0 && <TagCluster tags={conversation.tags} />}
                  </button>
                  {/* Mobile: an always-visible action row below the name. Desktop:
                      an absolute box on the right, revealed on hover, so it costs
                      the name no width.

                      NO RULE above it on mobile: it sits INSIDE the row it acts on,
                      which already has its own surface, and a hairline there split one
                      row into two. */}
                  <div className="flex items-center gap-0.5 px-2 pb-1 md:absolute md:right-1 md:top-1/2 md:z-10 md:-translate-y-1/2 md:rounded-lg md:border-0 md:bg-surface/95 md:px-0.5 md:py-0.5 md:opacity-0 md:shadow-sm md:backdrop-blur md:transition-opacity md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t.history.aliasAndTags}
                      title={t.history.aliasAndTags}
                      onClick={() => setEnrichingId(enriching ? null : conversation.id)}
                      aria-expanded={enriching}
                    >
                      <Tags size={14} aria-hidden />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t.history.renameAria}
                      title={t.history.rename}
                      onClick={() => startRename(conversation)}
                    >
                      <Pencil size={14} aria-hidden />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label={t.history.deleteAria}
                      title={c.actions.delete}
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingId(conversation.id);
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </IconButton>
                  </div>
                </div>
                {enriching && (
                  <ConversationEditor
                    conversation={conversation}
                    onApply={(fn) => applyToLists(conversation.id, fn)}
                    onClose={() => setEnrichingId(null)}
                  />
                )}
              </div>
            );
          })}
          </>
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
