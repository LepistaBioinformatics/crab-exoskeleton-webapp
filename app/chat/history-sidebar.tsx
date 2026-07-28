"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  GitBranch,
  List,
  MessageSquarePlus,
  Pencil,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  createConversation,
  deleteConversation,
  listConversations,
  onConversationsUpdated,
  renameConversation,
  type ConversationSummary,
} from "@/lib/chatSession";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cva } from "class-variance-authority";
import { useFragment, setFragmentSid, setHistoryView, type Workspace } from "./fragment";
import ConversationTree from "./conversation-tree";
import { TagCluster, ConversationEditor } from "./conversation-enrichment";
import ConversationSearchBar from "./conversation-search-bar";
import SidebarGroup from "./sidebar-group";
import { parseFilterQuery, applySyncFilters, applyContentFilter, isEmptyQuery } from "./conversation-filter";
import { getHistory } from "./history-cache";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

const conversationRow = cva(
  // Column on mobile (name on top, actions below); row on desktop with the
  // actions absolutely positioned so they reserve no width (the name never
  // truncates just to make room for hidden buttons). `group/row` scopes the
  // per-row hover/focus reveal so only the row under the cursor shows actions.
  "group/row relative flex w-full flex-col rounded-lg transition md:flex-row md:items-center md:pr-1",
  {
    variants: {
      active: { true: "bg-accent/12", false: "hover:bg-elevated/60" },
      // When another conversation is hovered, the rest fade back so the row
      // under the cursor is spotlighted. `spotlight-dim` is inert without a
      // hovering pointer (globals.css), so on touch the list is never faded --
      // there is no cursor there to lift the dim again.
      dimmed: { true: "spotlight-dim", false: "opacity-100" },
    },
    defaultVariants: { active: false, dimmed: false },
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

export default function HistorySidebar({
  workspace,
  onSelect,
  open,
  onToggle,
  bodyRef,
}: {
  workspace: Workspace;
  onSelect?: () => void;
  /** Group open/closed, owned by the unified sidebar so it can be persisted. */
  open: boolean;
  onToggle: () => void;
  /** So the sidebar can scroll this group into view when opened from mobile. */
  bodyRef?: React.Ref<HTMLDivElement>;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const e = useT(errorCopy);
  const fragment = useFragment();
  const activeSessionId = fragment?.sid;

  // Tree (default) vs. List view, persisted in the URL (fragment `hv`) so a
  // reload or shared link keeps the chosen mode.
  const view: "list" | "tree" = fragment?.hv === "list" ? "list" : "tree";

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  // The conversation currently under the cursor: the others dim (spotlight).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Whether the cursor is anywhere over the sidebar. At rest the whole list is
  // dimmed (only the active chat stays lit); hovering the sidebar lifts the dim,
  // and hovering one row then spotlights just that chat.
  const [sidebarHovered, setSidebarHovered] = useState(false);

  // Applies a change to a single conversation across both the base list and the
  // (optional) search results, mirroring the optimistic updates rename/delete do.
  function applyToLists(id: string, fn: (c: ConversationSummary) => ConversationSummary) {
    const map = (list: ConversationSummary[]) => list.map((c) => (c.id === id ? fn(c) : c));
    setConversations(map);
    setSearchResults((prev) => (prev ? map(prev) : prev));
  }

  useEffect(() => {
    const refresh = () => listConversations(workspace).then(setConversations);
    refresh();
    return onConversationsUpdated(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r]);

  // Two-stage filter: a synchronous predicate (tag/alias/date) narrows the set
  // instantly, then an async content stage (text:) runs only over survivors,
  // reading message history from the shared cache. AbortController guarantees
  // latest-query-wins so a slow earlier keystroke can't clobber fresh results.
  useEffect(() => {
    const parsed = parseFilterQuery(query, Date.now());
    if (isEmptyQuery(parsed)) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      const synced = applySyncFilters(conversations, parsed);
      if (parsed.texts.length === 0) {
        setSearchResults(synced);
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
        setSearchResults(matched);
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, conversations, workspace.t, workspace.s, workspace.r]);

  const visible = searchResults ?? conversations;

  async function onNewChat() {
    const conversation = await createConversation(workspace);
    setFragmentSid(conversation.id);
    onSelect?.();
  }

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
      setConversations(apply);
      setSearchResults((prev) => (prev ? apply(prev) : prev));
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
      setConversations(drop);
      setSearchResults((prev) => (prev ? drop(prev) : prev));
      setDeletingId(null);
    } catch (err) {
      setDeleteError(errorText(e, err instanceof Error ? err.message : null));
    }
  }

  const pendingDelete = deletingId ? visible.find((c) => c.id === deletingId) : null;

  return (
    <SidebarGroup
      title={t.shell.conversations}
      open={open}
      onToggle={onToggle}
      bodyRef={bodyRef}
      // The agent whose conversations these are. It used to be this sidebar's own
      // 16px header; in one pane that would be a second title bar six rows under
      // the brand.
      identity={
        <span className="flex min-w-0 shrink items-center gap-1.5">
          <Bot size={14} className="shrink-0 text-fg-muted" aria-hidden />
          <span
            className="max-w-24 truncate text-[11px] capitalize text-fg-muted"
            title={`${t.view.agentPrefix} ${workspace.r}`}
          >
            {workspace.r}
          </span>
        </span>
      }
      actions={
        <>
          <div className="flex shrink-0 items-center rounded-lg border border-brand/40 bg-elevated p-0.5">
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
    >
      <div
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
      {/* Always present, never behind a threshold: history grows without bound and
          this is the rich query (tag:, content search). A field that appears once a
          count is crossed is a moving target. */}
      {/* Roomy above and below. The search plus its filter chips is one block
          (ConversationSearchBar stacks them), so this wrapper is the only place the
          spacing belongs — and it has to separate the block from the group header
          above it and from the new-chat row below it, neither of which is its own
          section divider. */}
      <div className="shrink-0 px-2 pb-3 pt-3">
        <ConversationSearchBar
          value={query}
          onChange={setQuery}
          conversations={conversations}
          searching={searching}
        />
      </div>

      {/* Under the search, on the row the first conversation would occupy, and right
          aligned. Icon-only with the label as its title: the plus already reads as
          "add one of these" from where it sits — directly above the list of them —
          and the generous vertical padding is what separates it from the first row so
          it does not read as a conversation itself. */}
      <div className="flex justify-end px-3 py-2.5">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t.history.newChat}
          title={t.history.newChat}
          onClick={onNewChat}
          className="text-accent"
        >
          <MessageSquarePlus size={18} aria-hidden />
        </IconButton>
      </div>

      <div className="px-2 pb-2">
        {view === "tree" ? (
          <ConversationTree
            workspace={workspace}
            conversations={visible}
            activeSessionId={activeSessionId}
            sidebarHovered={sidebarHovered}
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
        {!searching && visible.length === 0 && (
          <p className="py-4 text-center text-sm text-fg-muted">
            {query.trim() ? t.history.noMatches : t.history.noneYet}
          </p>
        )}
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
            // Resting: dim all but the active chat. Sidebar hovered (no row):
            // everything lit. A row hovered: only that chat stays lit.
            const dimmed =
              hoveredId !== null
                ? hoveredId !== conversation.id
                : sidebarHovered
                  ? false
                  : !active;
            return (
              <div key={conversation.id}>
                <div
                  onMouseEnter={() => setHoveredId(conversation.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === conversation.id ? null : cur))
                  }
                  className={conversationRow({ active, dimmed })}
                >
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
                      the name no width. */}
                  <div className="flex items-center gap-0.5 border-t border-brand/10 px-2 py-1 md:absolute md:right-1 md:top-1/2 md:z-10 md:-translate-y-1/2 md:rounded-lg md:border-0 md:bg-surface/95 md:px-0.5 md:py-0.5 md:opacity-0 md:shadow-sm md:backdrop-blur md:transition-opacity md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100">
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
      </div>
    </SidebarGroup>
  );
}
