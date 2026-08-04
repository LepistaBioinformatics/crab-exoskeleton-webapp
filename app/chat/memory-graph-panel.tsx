"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { Clock, Network, Search, Share2 } from "lucide-react";
import {
  openNodes,
  readGraph,
  recentChanges,
  relationsFor,
  searchGraph,
  type Entity,
  type FullGraph,
  type RecentChanges,
  type Relation,
  type SummaryGraph,
} from "@/lib/memoryGraph";
import { setFragmentSid, type Workspace } from "./fragment";
import { listConversations, type ConversationSummary } from "@/lib/chatSession";
import MemoryGraphView from "./memory-graph-view";
import {
  BrowseList,
  EntityDetail,
  RecentList,
  SearchList,
} from "./memory-graph-views";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { chatCopy } from "@/lib/i18n/chat";
import { BCP47 } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/context";

// A read-only view of the agent's knowledge graph, living INSIDE the workspace
// panel's sliding track rather than in an overlay drawer.
//
// It was a drawer first. A drawer stacks a second surface on top of the panel the
// member opened it from, and on mobile the panel is itself an overlay — so the two
// competed for the same edge and the backdrop landed behind the still-interactive
// sidebar. The track is the idiom this app already uses for "go deeper into the
// thing you picked" (see unified-sidebar), and it inherits the panel's width, which
// is what makes a graph legible.
//
// Nothing here writes. The agent writes through its MCP tools; the member reads.

const tab = cva(
  "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
  {
    variants: {
      active: {
        true: "bg-accent/15 text-accent",
        false: "text-fg-muted hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

// "map" is the node-link view. It reads the SAME browse projection the list does and
// drives the SAME select(), so choosing a node opens the existing detail pane — which
// already answers "where did this come from" with the conversations behind each fact.
// That reuse is the point: the graph adds a way to SEE the shape, not a second data path.
type Mode = "browse" | "map" | "search" | "recent";

// The detail pane's size. It opens roughly half the column so both it and the list
// above are usable at once; the ceiling leaves the list a visible sliver, because a
// pane that swallowed the whole column would hide the thing it was opened FROM.
const MIN_DETAIL_HEIGHT = 120;
const DEFAULT_DETAIL_HEIGHT = 320;

function maxDetailHeight(): number {
  if (typeof window === "undefined") return DEFAULT_DETAIL_HEIGHT;
  return Math.max(MIN_DETAIL_HEIGHT, window.innerHeight - 220);
}

export default function MemoryGraphPanel({
  workspace,
  active,
}: {
  workspace: Workspace;
  /**
   * True when this is the pane the member is looking at. Both panes of the track
   * stay mounted through the slide, so without this the graph would fetch on every
   * workspace change even for a member who never opens it.
   */
  active: boolean;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const { locale } = useLocale();

  const [mode, setMode] = useState<Mode>("browse");
  const [graph, setGraph] = useState<SummaryGraph | null>(null);
  const [hits, setHits] = useState<FullGraph | null>(null);
  const [recent, setRecent] = useState<RecentChanges | null>(null);
  const [detail, setDetail] = useState<FullGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id, so an out-of-order detail response is dropped.
  const selectStamp = useRef(0);
  // Conversations, purely to turn a stored session id into a title a member
  // recognises. Failure is tolerated: without it the provenance list still renders,
  // just as "no longer available" — which is the same treatment a genuinely deleted
  // conversation gets, and better than showing raw uuids.
  const [conversations, setConversations] = useState<
    ConversationSummary[] | null
  >(null);
  // Owned here, not in BrowseList: the list re-fetches on every visit, and a filter
  // that reset itself each time would be useless on the graph it exists for.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // The detail pane's height, in pixels, owned here so it survives selecting another
  // entity — a member who dragged it tall wants it tall for the next one too.
  const [detailHeight, setDetailHeight] = useState(DEFAULT_DETAIL_HEIGHT);

  const reset = useCallback(() => {
    setGraph(null);
    setHits(null);
    setRecent(null);
    setDetail(null);
    setSelected(null);
    setQuery("");
    setError(null);
    setTypeFilter(null);
  }, []);

  // A workspace switch invalidates everything: graphs are per (member, agent).
  useEffect(() => {
    reset();
    setMode("browse");
  }, [workspace.t, workspace.s, workspace.r, reset]);

  // Re-fetched every time the member arrives, never cached: the agent writes to this
  // graph between visits, and a stale list is the one failure that would make the
  // panel actively lie about what the bot knows.
  useEffect(() => {
    if (!active || mode !== "browse") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    readGraph(workspace)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Primitives, NOT `workspace`: ChatShell rebuilds that object on every one of its
    // own renders, so depending on its identity re-fetches on any unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode, workspace.t, workspace.s, workspace.r]);

  useEffect(() => {
    if (!active || mode !== "recent") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    recentChanges(workspace, 24)
      .then((r) => {
        if (!cancelled) setRecent(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode, workspace.t, workspace.s, workspace.r]);

  // Fetched once per workspace when the pane is live, not per selected entity: the
  // list is small and every entity's sources resolve against the same map.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listConversations(workspace)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, workspace.t, workspace.s, workspace.r]);

  // Null means "no such conversation" — either it was deleted, or the list has not
  // arrived. Both render as unavailable rather than as a link that goes nowhere.
  function conversationTitle(sessionId: string): string | null {
    const c = conversations?.find((x) => x.id === sessionId);
    if (!c) return null;
    return c.alias ?? c.title;
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setMode("search");
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelected(null);
    try {
      setHits(await searchGraph(workspace, query.trim()));
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "unknown");
    } finally {
      setLoading(false);
    }
  }

  async function select(name: string) {
    if (selected === name) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(name);
    setDetail(null);
    setError(null);
    const stamp = ++selectStamp.current;
    try {
      const full = await openNodes(workspace, [name]);
      if (stamp === selectStamp.current) setDetail(full);
    } catch (e) {
      if (stamp === selectStamp.current)
        setError(e instanceof Error ? e.message : "unknown");
    }
  }

  // Dragging the handle UPWARD grows the pane, because it is anchored to the bottom.
  function startDetailResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = detailHeight;
    const onMove = (ev: globalThis.MouseEvent) => {
      const next = startHeight + (startY - ev.clientY);
      setDetailHeight(
        Math.max(MIN_DETAIL_HEIGHT, Math.min(next, maxDetailHeight())),
      );
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
  }

  function formatWhen(ms?: number): string {
    if (!ms) return "";
    // Epoch MILLISECONDS from the Go store — not seconds.
    return new Date(ms).toLocaleString(BCP47[locale], {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  const entity: Entity | undefined = detail?.entities.find(
    (e) => e.name === selected,
  );

  // The selected entity's edges come from the list already in hand. open_nodes filters
  // relations to those with BOTH endpoints among the names requested, so asking for a
  // single entity returns an empty relation set every time.
  const contextRelations: Relation[] =
    graph?.relations ?? hits?.relations ?? recent?.recentRelations ?? [];
  const entityRelations = selected
    ? relationsFor(contextRelations, selected)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 px-3 pt-2 text-[11px] leading-snug text-fg-muted">
        {t.memoryGraph.hint}
      </p>

      <div className="shrink-0 px-3 pt-2">
        <div className="flex items-center rounded-lg border border-brand/40 bg-elevated p-0.5">
          <button
            type="button"
            className={tab({ active: mode === "browse" })}
            aria-pressed={mode === "browse"}
            onClick={() => setMode("browse")}
          >
            <Network size={12} aria-hidden />
            {t.memoryGraph.tabs.browse}
          </button>
          <button
            type="button"
            className={tab({ active: mode === "map" })}
            aria-pressed={mode === "map"}
            onClick={() => setMode("map")}
          >
            <Share2 size={12} aria-hidden />
            {t.memoryGraph.tabs.map}
          </button>
          <button
            type="button"
            className={tab({ active: mode === "search" })}
            aria-pressed={mode === "search"}
            onClick={() => setMode("search")}
          >
            <Search size={12} aria-hidden />
            {t.memoryGraph.tabs.search}
          </button>
          <button
            type="button"
            className={tab({ active: mode === "recent" })}
            aria-pressed={mode === "recent"}
            onClick={() => setMode("recent")}
          >
            <Clock size={12} aria-hidden />
            {t.memoryGraph.tabs.recent}
          </button>
        </div>
      </div>

      {mode === "search" && (
        <form onSubmit={onSearch} className="shrink-0 px-3 pt-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.memoryGraph.searchPlaceholder}
            aria-label={t.memoryGraph.searchPlaceholder}
          />
          <p className="mt-1 text-[11px] leading-snug text-fg-muted">
            {t.memoryGraph.searchHint}
          </p>
        </form>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="px-3 pb-2">
            <Alert severity="error">{errorText(err, error)}</Alert>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size={22} />
          </div>
        ) : (
          <>
            {mode === "browse" && graph && (
              <BrowseList
                graph={graph}
                selected={selected}
                onSelect={select}
                emptyTitle={t.memoryGraph.empty.title}
                emptyBody={t.memoryGraph.empty.body}
                observationsLabel={t.memoryGraph.observations}
                relationsLabel={t.memoryGraph.relations}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                allLabel={t.memoryGraph.allTypes}
                noneOfTypeLabel={t.memoryGraph.noneOfType}
              />
            )}

            {mode === "map" && graph && (
              // Fills the pane: a graph in a narrow column is unreadable, and this panel
              // deliberately has no max width (see uploads-sidebar) precisely for this.
              <div className="h-full min-h-[320px]">
                <MemoryGraphView
                  entities={graph.entities}
                  relations={graph.relations}
                  selected={selected}
                  onSelect={(name) => (name ? select(name) : setSelected(null))}
                  emptyLabel={t.memoryGraph.empty.body}
                  expandLabel={t.memoryGraph.expandMap}
                  collapseLabel={t.memoryGraph.collapseMap}
                />
              </div>
            )}

            {mode === "search" && hits && (
              <SearchList
                hits={hits}
                selected={selected}
                onSelect={select}
                noResults={t.memoryGraph.noResults}
              />
            )}

            {mode === "recent" && recent && (
              <RecentList
                recent={recent}
                onSelect={select}
                formatWhen={formatWhen}
                copy={t.memoryGraph.recentCopy}
              />
            )}
          </>
        )}
      </div>

      {entity && (
        <EntityDetail
          entity={entity}
          relations={entityRelations}
          formatWhen={formatWhen}
          copy={t.memoryGraph}
          conversationTitle={conversationTitle}
          // Walking the graph: a theme entity's relations are how a member reaches what
          // it contains, so an endpoint has to open that entity. `select` already
          // handles a name that is NOT in the current list — it calls open_nodes.
          onOpenEntity={select}
          height={detailHeight}
          onResizeStart={startDetailResize}
          onClose={closeDetail}
          // Navigating by fragment is how the whole app switches conversation; the
          // chat view is already listening for it, so no extra plumbing.
          onOpenConversation={setFragmentSid}
        />
      )}
    </div>
  );
}
