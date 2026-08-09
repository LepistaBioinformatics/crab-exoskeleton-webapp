"use client";


import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronLeft,
  GitBranch,
  List,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Search,
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
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cva } from "class-variance-authority";
import {
  useFragment,
  setFragmentSid,
  setHistoryView,
  setFragmentProject,
  type Workspace,
} from "./fragment";
import ConversationTree from "./conversation-tree";
import { TagCluster, ConversationEditor } from "./conversation-enrichment";
import ConversationSearchBar from "./conversation-search-bar";
import SidebarPanel from "./sidebar-panel";
import { SectionHeader, SectionLabel, SectionSplitter } from "./sidebar-section";
import { splitBoxStyles } from "./split-boxes";
import { parseFilterQuery, applySyncFilters, applyContentFilter, isEmptyQuery } from "./conversation-filter";
import { getHistory } from "./history-cache";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";
import ProjectsBar from "@/app/chat/projects-bar";

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

export default function HistorySidebar({
  workspace,
  project,
  subscription,
  onSelect,
  onBack,
}: {
  workspace: Workspace;
  /** agent-projects: the project being browsed, from the fragment's `p`. */
  project: string | null;
  /**
   * The subscription these conversations belong to. Null while the workspace tree is
   * still loading, and for a subscription with no name of its own.
   */
  subscription: string | null;
  onSelect?: () => void;
  /**
   * Slides the sidebar back to the workspace tree. It writes NOTHING to the fragment:
   * the selection stays, so the chat on the right keeps rendering while another
   * workspace is chosen — and if none is, nothing was lost.
   */
  onBack: () => void;
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

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState("");
  // Behind a magnifier, matching the workspaces panel. The search and its filter pills
  // are a four-row block, and they sat permanently above a list whose first rows are
  // what a member came here to click.
  const [searchOpen, setSearchOpen] = useState(false);
  // The two lower sections' fold. Deliberately NOT persisted: unified-sidebar.tsx
  // records that this sidebar used to keep per-group collapse in localStorage and that
  // it was removed on purpose. Both start open, so nothing is hidden from a member who
  // never touches the control.
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  // How the two boxes divide the space below the workspace row: the projects box's
  // share, 0..1. Equal by default, which is what makes the seam discoverable — an
  // even split reads as two boxes, where a content-sized projects box would just read
  // as a header.
  const [projectsShare, setProjectsShare] = useState(0.5);
  const splitBox = useRef<HTMLDivElement>(null);
  const [searchResults, setSearchResults] = useState<ConversationSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
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
    setConversations(map);
    setSearchResults((prev) => (prev ? map(prev) : prev));
  }

  // `workspace.p` IS a dependency. It used not to be, because entering a project was a
  // route change and the whole panel was remounted — the refetch came for free. Now
  // that the project is a fragment write there is no remount, so without this the list
  // would keep showing the previous project's conversations.
  useEffect(() => {
    const refresh = () => listConversations(workspace).then(setConversations);
    refresh();
    return onConversationsUpdated(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r, workspace.p]);

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

  // A project's conversations are a SEPARATE list, not a subset shown alongside
  // the others: entering a project replaces what the sidebar lists, and the
  // unscoped list shows only the chats that belong to no project. Mixing them
  // would defeat the point of a project, which is to keep a subject apart.
  //
  // Filtered client-side because the full list is already fetched for search and
  // for the tree view, both of which need every conversation to build from.
  const inBrowsedProject = (c: ConversationSummary) => (c.project ?? null) === browsedProject;
  const visible = (searchResults ?? conversations).filter(inBrowsedProject);

  async function onNewChat() {
    // A new chat is born in the project this page IS, so "new chat" inside a
    // project stays in that project.
    const conversation = await createConversation(workspace, browsedProject);
    setFragmentSid(conversation.id);
    onSelect?.();
  }

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

  // Names the section AND interpolates into its fold control, so the two never
  // disagree about what is being folded.
  const chatsLabel = browsedProject ? t.projects.projectChats : t.history.globalChats;

  // Inside a project the projects box is a fixed context header, not a resizable list:
  // it does not fold (see ProjectsBar) and there is no list in it to give more room to.
  // So the seam exists only while browsing the project LIST, and only while both boxes
  // are open — dragging against a collapsed box would be dragging against its header.
  // `!= null`, NOT `!== null`: the prop is optional, so "no project" arrives as
  // undefined as well as null — and `undefined !== null` is true, which made every
  // ordinary visit look like it was inside a project and hid the way back to the
  // workspaces. unified-sidebar.test.tsx catches exactly this.
  const insideProject = browsedProject != null;
  const splittable = !insideProject && projectsOpen && chatsOpen;

  // Neither box may be dragged below this; the seam stops rather than letting a box
  // vanish behind its own header.
  const MIN_BOX_PX = 96;

  function startSplitDrag(e: React.MouseEvent) {
    e.preventDefault();
    const box = splitBox.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.height <= 0) return;

    const onMove = (ev: globalThis.MouseEvent) => {
      const offset = ev.clientY - rect.top;
      const min = MIN_BOX_PX / rect.height;
      // Symmetric clamp: 1 - min is the same floor measured from the other end, so
      // neither box can be squeezed past the limit the other one respects.
      setProjectsShare(Math.min(Math.max(offset / rect.height, min), 1 - min));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    // On the BODY for the duration of the drag: without this the cursor flickers back
    // to a caret whenever the pointer outruns the 8px seam, and text under it selects.
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  // See split-boxes.ts for the rule. It is a module rather than two ternaries here
  // because the version that WAS two ternaries left the non-splittable case
  // undefined — which reads as "no style needed" and is actually `flex: 0 1 auto`,
  // so a collapsed box still shrank and its header ended up underneath the box
  // below it.
  const { projects: projectsStyle, chats: chatsStyle } = splitBoxStyles({
    splittable,
    projectsShare,
    projectsOpen,
    chatsOpen,
  });

  return (
    <SidebarPanel
      // SECTION 1 of three: the workspace. The back control is the section -- it names
      // the subscription and agent, and it is the way out -- but it now wears the same
      // eyebrow as the two below it, because "which of these three am I looking at"
      // was the thing the panel could not answer.
      //
      // It does not fold. It is the panel's own header row, and folding away the only
      // exit from the panel would be a trap.
      scrollBody={false}
      header={
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2">
          <SectionLabel>{t.sections.workspace}</SectionLabel>
          {/* Inside a project this is STATIC TEXT, not a control: leaving happens one
              level at a time, and the way out is the project's own back arrow. Jumping
              straight to the workspace list from inside a project skipped a level and
              put two "back"s on screen competing. The identity stays visible either
              way — without it you cannot tell whose project you are in. */}
          <button
            type="button"
            onClick={onBack}
            disabled={insideProject}
            aria-label={insideProject ? undefined : t.nav.backToWorkspaces}
            title={insideProject ? undefined : t.nav.backToWorkspaces}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 text-left transition-colors enabled:hover:bg-elevated/60 disabled:cursor-default"
          >
          {!insideProject && (
            <ChevronLeft size={16} className="shrink-0 text-fg-muted" aria-hidden />
          )}
          {/* The SUBSCRIPTION leads and the agent sits under it in lighter type. Which
              subscription a workspace belongs to is what a member navigates by — it is
              the billing and membership boundary, and it is what distinguishes two
              otherwise identical agents. The agent name is the qualifier within it, not
              the heading.

              With no subscription name to show, the agent takes the line alone rather
              than being demoted under a uuid. */}
          {subscription ? (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-fg" title={subscription}>
                {subscription}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-[11px] capitalize text-fg-muted">
                <Bot size={11} className="shrink-0" aria-hidden />
                <span className="truncate">{workspace.r}</span>
              </span>
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <Bot size={14} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize text-fg">
                {workspace.r}
              </span>
            </span>
          )}
          </button>
        </span>
      }
    >
      {/* SECTION 2: projects. Everything about PROJECTS first, then the conversations.
          Each section owns its own create control, and that is the point rather than a
          duplication: "new" means a different thing in each — a new project, or a new
          chat — and one shared button at the top could only ever mean one of them.
          Inside a project the section below is replaced by that project's own chats,
          because the two lists are separate, not one list filtered. */}
      <div ref={splitBox} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-col" style={projectsStyle}>
      <ProjectsBar
        workspace={workspace}
        browsedProject={browsedProject}
        onBrowse={setFragmentProject}
        open={projectsOpen}
        onToggle={() => setProjectsOpen((v) => !v)}
      />
      </div>

      {splittable && (
        <SectionSplitter label={t.sections.resize} onDragStart={startSplitDrag} />
      )}

      <div className="flex min-h-0 flex-col" style={chatsStyle}>

      {/* SECTION 3: the chats. The magnifier and the List|Tree switch live HERE, not in
          the panel's top row where they used to: both act on the list directly below
          them, and from the workspace row they were separated from it by the whole
          projects section. */}
      <SectionHeader
        open={chatsOpen}
        onToggle={() => setChatsOpen((v) => !v)}
        toggleLabel={(chatsOpen ? t.sections.collapse : t.sections.expand).replace(
          "{name}",
          chatsLabel,
        )}
        label={<SectionLabel>{chatsLabel}</SectionLabel>}
        actions={
          // Nothing is offered while the list is hidden: searching, switching between
          // list and tree, and adding to what you cannot see are all no-ops that would
          // still look clickable.
          chatsOpen ? (
            <>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={t.search.placeholder}
                aria-expanded={searchOpen}
                onClick={() => {
                  // Closing clears the query, for the reason the workspace filter does:
                  // a hidden search still narrowing the list is the worst of both, since
                  // the reason conversations are missing is off screen. Note this is the
                  // MAGNIFIER closing, not the section folding — folding says nothing
                  // about the filter and leaves the query alone.
                  if (searchOpen) setQuery("");
                  setSearchOpen((v) => !v);
                }}
              >
                <Search size={16} aria-hidden />
              </IconButton>
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
            </>
          ) : null
        }
      />

      {chatsOpen && searchOpen && (
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
      {chatsOpen && (
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
      )}
      </div>
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
