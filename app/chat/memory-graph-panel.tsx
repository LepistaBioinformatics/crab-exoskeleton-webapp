"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { Clock, Network, Share2, Waves } from "lucide-react";
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
import { setDestination, setFragmentSid, type Workspace } from "./fragment";
import type { EntityReference } from "@/lib/chatReference";
import { listConversations, type ConversationSummary } from "@/lib/chatSession";
import MemoryGraphView from "./memory-graph-view";
import { MAX_NODES } from "./graph-elements";
import { useMapTools } from "./use-map-tools";
import { countHiddenChecked, useGraphSelection } from "./use-graph-selection";
import { expandByHops, MAX_SHARE_NAMES, type HopRadius } from "./graph-hops";
import { requestMangroveShare } from "./mangrove-share-bus";
import { useMangroveEnabled } from "./use-mangrove";
import { BrowseList, EntityDetail, RecentList } from "./memory-graph-views";
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

// The share's hop control. Its own segmented look rather than the tab's, because it sits in a
// row of text and a tab-sized control there would read as another tab.
const hopSegment = cva(
  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
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

const SHARE_HOPS: HopRadius[] = [1, 2, 3];

// "map" is the node-link view. It reads the SAME browse projection the list does and
// drives the SAME select(), so choosing a node opens the existing detail pane — which
// already answers "where did this come from" with the conversations behind each fact.
// That reuse is the point: the graph adds a way to SEE the shape, not a second data path.
//
// There is no "search" mode, and that is a removal rather than an omission. The Map tab
// already searches — its filter's `contents` scope issues the very same `searchGraph`
// request the tab did, at the map's node ceiling rather than the default ten — so what the
// tab added was a ranked hit LIST, not the ability to search. One fewer tab, and the
// search that remains lands the member on the graph the results belong to.
type Mode = "browse" | "map" | "recent";

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
  refreshSignal = 0,
  onReference,
}: {
  workspace: Workspace;
  /**
   * Puts the open entity in the composer's reference slot — the same slot a scheduled
   * task uses. Absent when there is no chat to reference into.
   */
  onReference?: (ref: EntityReference) => void;
  /**
   * True when this is the pane the member is looking at. Both panes of the track
   * stay mounted through the slide, so without this the graph would fetch on every
   * workspace change even for a member who never opens it.
   */
  active: boolean;
  /**
   * Bumped by the panel header's refresh control. In the deps of every fetch below,
   * for the same reason `active` is: the agent writes to this graph while the member
   * is reading it, and arriving at the section was the only thing that re-read it.
   */
  refreshSignal?: number;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const { locale } = useLocale();

  const [mode, setMode] = useState<Mode>("browse");
  const [graph, setGraph] = useState<SummaryGraph | null>(null);
  const [recent, setRecent] = useState<RecentChanges | null>(null);
  const [detail, setDetail] = useState<FullGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // The multi-select, beside `selected` and not instead of it: `selected` is the one
  // entity the detail pane is showing, this is the set the member ticked to act on
  // several. See use-graph-selection.ts for why a checked name outlives a filter.
  const {
    checked,
    toggle: toggleChecked,
    replace: replaceChecked,
    clear: clearChecked,
  } = useGraphSelection();
  // Sharing the selection into the mangrove. ABSENT where there is no mangrove, the way
  // every other affordance of that feature is — a control that renders and then refuses
  // teaches the wrong thing about who can reach what.
  const mangroveOn = useMangroveEnabled(workspace);
  // How far the SHARED fragment reaches out from the selected nodes, on the map.
  //
  // Deliberately NOT `tools.hopRadius`, which looks like the same number and is not: that one
  // decides how much of the graph stays lit around the single entity the detail pane has open,
  // it lives in a sidebar that is collapsed by default in the column, and a member who widened
  // it to look around would silently be publishing three hops of their graph. What travels is
  // worth its own control, beside the button that sends it.
  const [shareHops, setShareHops] = useState<HopRadius>(1);
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
  // The map's discovery tools, owned here for exactly the same reason: MemoryGraphView
  // unmounts on a tab switch, so state living in it would reset every time the member
  // looked at the entity list and came back.
  const { tools, set: setTool, reset: resetTools } = useMapTools();
  // The map's content-search result: ONLY the hit NAMES. The elements still come wholly from the
  // browse projection, so the map gains a second source of SELECTION, not of structure — which
  // is what keeps NFR-1 intact.
  //
  // Held as STATE, never derived in the render body. A `Set` rebuilt per render is a new identity
  // every time, which would make the view's `built` memo miss, re-run the create effect and
  // re-run the LAYOUT on every render. That presents as "the graph jitters", not as a dependency
  // bug.
  const [matchNames, setMatchNames] = useState<Set<string> | null>(null);
  const [contentSearching, setContentSearching] = useState(false);
  const [contentFailed, setContentFailed] = useState(false);
  const [contentCapped, setContentCapped] = useState(false);
  // Monotonic, like `selectStamp`: an async fetch behind a debounced input will otherwise apply
  // a stale hit set, and the member would be looking at the results of a query they finished
  // typing over.
  const contentStamp = useRef(0);
  // The map's own filter. Under the `names` scope it matches what is already loaded; under
  // `contents` it issues the server-side BM25 request — which is the search the removed
  // Search tab used to run, now landing on the graph instead of on a hit list.
  const [mapQuery, setMapQuery] = useState("");
  // What the MAP is actually filtered by, trailing the input. The graph rebuilds when this
  // changes and the layout is O(n^2) on the main thread, so feeding it every keystroke is how
  // a large graph freezes the tab.
  const [mapQueryApplied, setMapQueryApplied] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setMapQueryApplied(mapQuery), 250);
    return () => clearTimeout(id);
  }, [mapQuery]);
  // The detail pane's height, in pixels, owned here so it survives selecting another
  // entity — a member who dragged it tall wants it tall for the next one too.
  const [detailHeight, setDetailHeight] = useState(DEFAULT_DETAIL_HEIGHT);

  // What the map's reset control clears, as opposed to `reset` below, which throws away the fetched
  // data too. Kept separate because a member asking to clear their filters is not asking to re-read
  // the graph — and the type filter is SHARED with the Entities tab, so this changes that list too,
  // which is why the control's tooltip says so.
  const resetMapFilters = useCallback(() => {
    resetTools();
    setTypeFilter(null);
    setMapQuery("");
  }, [resetTools]);

  const reset = useCallback(() => {
    setGraph(null);
    setRecent(null);
    setDetail(null);
    setSelected(null);
    setError(null);
    setTypeFilter(null);
    // The multi-select goes too, and this is the one place it is dropped without the member
    // asking. Graphs are per (member, agent, project), so a name ticked in one workspace
    // names nothing in the next — carrying it over would be carrying a ghost.
    clearChecked();
    // The tools go too. A relation-type filter naming a type the NEXT workspace's graph does
    // not have would silently hide every edge, and read as "this agent has no relations".
    resetTools();
  }, [resetTools, clearChecked]);

  // A workspace switch invalidates everything: graphs are per (member, agent) —
  // and per PROJECT, since each project agent has its own memory-graph MCP server
  // and its own graph. Without `p` the panel went on showing the previous scope's
  // entities, which is the one failure that makes it lie about what the bot knows.
  useEffect(() => {
    reset();
    setMode("browse");
  }, [workspace.t, workspace.s, workspace.r, workspace.p, reset]);

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
  }, [active, mode, refreshSignal, workspace.t, workspace.s, workspace.r, workspace.p]);

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
  }, [active, mode, refreshSignal, workspace.t, workspace.s, workspace.r, workspace.p]);

  // The map's content search. Only the NAMES of the hits are kept — see `matchNames`.
  //
  // `k` is passed EXPLICITLY and tied to the node ceiling. The default is 10, and ten hits
  // seeding a map reads as the map hiding entities rather than as a cap (GD-D3).
  useEffect(() => {
    if (!active || mode !== "map") return;
    const q = mapQueryApplied.trim();
    if (tools.searchScope !== "contents" || !q) {
      // Bumped so an in-flight response from before the switch cannot land after it.
      contentStamp.current++;
      setMatchNames(null);
      setContentSearching(false);
      setContentFailed(false);
      setContentCapped(false);
      return;
    }
    const stamp = ++contentStamp.current;
    setContentSearching(true);
    setContentFailed(false);
    searchGraph(workspace, q, MAX_NODES)
      .then((r) => {
        if (stamp !== contentStamp.current) return;
        setMatchNames(new Set(r.searchResults.map((h) => h.entity_name)));
        // k and the node ceiling are the same number, so a full page of hits is the one case
        // where the server may have had more and buildElements would report nothing.
        setContentCapped(r.searchResults.length >= MAX_NODES);
      })
      .catch(() => {
        if (stamp !== contentStamp.current) return;
        // An EMPTY set, not null: a failed search must not silently fall back to showing the
        // whole graph as though no filter had been asked for.
        setMatchNames(new Set());
        setContentFailed(true);
        setContentCapped(false);
      })
      .finally(() => {
        if (stamp === contentStamp.current) setContentSearching(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    mode,
    mapQueryApplied,
    tools.searchScope,
    workspace.t,
    workspace.s,
    workspace.r,
    workspace.p,
  ]);

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
  }, [active, workspace.t, workspace.s, workspace.r, workspace.p]);

  // Null means "no such conversation" — either it was deleted, or the list has not
  // arrived. Both render as unavailable rather than as a link that goes nowhere.
  function conversationTitle(sessionId: string): string | null {
    const c = conversations?.find((x) => x.id === sessionId);
    if (!c) return null;
    return c.alias ?? c.title;
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

  /**
   * Picking a node on the map, which is two acts sharing one gesture.
   *
   * A PLAIN click means "this one instead": it replaces the multi-select and opens the detail
   * pane, which is what a bare click on a canvas means everywhere else. A CTRL or CMD click
   * means "this one as well": it toggles the node in the set and leaves the detail pane
   * alone, exactly as the tick beside a list row does — the map gains a second way to reach
   * the same selection, not a second selection.
   *
   * Tapping the BACKGROUND deliberately does not clear the set. It closes the detail pane and
   * nothing else: dropping a selection the member never asked to drop is the failure
   * use-graph-selection.ts is built around, and an empty-canvas click is easy to make by
   * accident while panning.
   */
  function selectOnMap(name: string | null, opts?: { additive?: boolean }) {
    if (!name) {
      setSelected(null);
      setDetail(null);
      return;
    }
    if (opts?.additive) {
      toggleChecked(name);
      return;
    }
    replaceChecked([name]);
    void select(name);
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

  // How much of the selection the list is not showing. Browse re-applies the same type
  // filter the list does — including the `|| "unknown"` normalisation, without which a
  // member filtered to that type would be told every checked name is hidden. One
  // duplicated line beats a shared helper the two sides would then have to keep agreeing
  // on.
  //
  // Only the Entities list answers this. The map draws the same entities as nodes and Recent
  // shows a different projection, so "not in view" there would be a claim about the wrong
  // thing. The COUNT still renders on every tab, and that is what keeps a selection from
  // going quiet.
  const hiddenChecked =
    mode === "browse"
      ? countHiddenChecked(
          checked,
          (graph?.entities ?? [])
            .filter((e) => !typeFilter || (e.type || "unknown") === typeFilter)
            .map((e) => e.name),
        )
      : 0;

  const selection = {
    checked,
    onToggle: toggleChecked,
    label: t.memoryGraph.selection.selectEntity,
  };

  // What a share would actually carry.
  //
  // On the MAP the hop control widens it: the member picked nodes, and the fragment reaches
  // `shareHops` relations out from them in EITHER direction (see graph-hops.ts). Everywhere
  // else it is the ticked names exactly, because those tabs offer no hop control and a
  // payload larger than the count on screen would be a share nobody agreed to.
  //
  // Expanded over the WHOLE graph's relations, not the map's drawn edges: what a member shares
  // must not depend on the spread, the relation-type facet or the node ceiling. The cost is
  // that the fragment can reach entities the map is not drawing — which is exactly why the
  // count below is shown before the share rather than after it.
  const shareNames = useMemo(
    () =>
      mode === "map"
        ? [...expandByHops(checked, graph?.relations ?? [], shareHops)]
        : [...checked],
    [mode, checked, graph?.relations, shareHops],
  );
  // Three hops on a dense graph is most of the graph. Refused rather than trimmed: a
  // truncated fragment is a lie about which entities were shared, and the member has an
  // obvious remedy in the control right beside the message.
  const shareTooMany = shareNames.length > MAX_SHARE_NAMES;

  // The selected entity's edges come from the list already in hand. open_nodes filters
  // relations to those with BOTH endpoints among the names requested, so asking for a
  // single entity returns an empty relation set every time.
  const contextRelations: Relation[] =
    graph?.relations ?? recent?.recentRelations ?? [];
  const entityRelations = selected
    ? relationsFor(contextRelations, selected)
    : [];

  // Built once and placed differently per tab: inside the map's graph column, below the list
  // everywhere else. Same element, same state, two homes — which is why it is a variable rather
  // than duplicated JSX.
  const detailPane = entity ? (
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
      onReference={onReference}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 px-3 pt-2 text-[11px] leading-snug text-fg-muted">
        {t.memoryGraph.hint}
      </p>

      <div className="shrink-0 px-3 pt-2">
        <div className="flex items-center rounded-lg border border-rule-strong bg-elevated p-0.5">
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
            className={tab({ active: mode === "recent" })}
            aria-pressed={mode === "recent"}
            onClick={() => setMode("recent")}
          >
            <Clock size={12} aria-hidden />
            {t.memoryGraph.tabs.recent}
          </button>
        </div>
      </div>

      {/* OUTSIDE the scrolling list below, and outside the tab switch: a checked entity
          that a filter, a search or another tab stopped showing is still checked, and this
          bar is the only thing on screen that says so. Inside the scroll area it would
          leave with the rows it is describing. */}
      {checked.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2 text-[11px]">
          <span className="font-medium text-fg">
            {checked.size === 1
              ? t.memoryGraph.selection.one
              : t.memoryGraph.selection.many.replace(
                  "{count}",
                  String(checked.size),
                )}
          </span>
          {hiddenChecked > 0 && (
            <span className="truncate text-fg-muted">
              {t.memoryGraph.selection.hidden.replace(
                "{count}",
                String(hiddenChecked),
              )}
            </span>
          )}
          {/* How far out of the picked nodes the shared fragment reaches. On the MAP only:
              it is the map that lets a member pick a node in the middle of a neighbourhood
              and want the neighbourhood with it, and a control that silently enlarged a
              list share would be a payload nobody could see. */}
          {mangroveOn === true && mode === "map" && (
            <>
              <div
                role="group"
                aria-label={t.memoryGraph.selection.hopsLabel}
                title={t.memoryGraph.selection.hopsLabel}
                className="flex shrink-0 items-center gap-0.5 rounded-md border border-rule-strong p-0.5"
              >
                {SHARE_HOPS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={shareHops === h}
                    onClick={() => setShareHops(h)}
                    className={hopSegment({ active: shareHops === h })}
                  >
                    {(h === 1
                      ? t.memoryGraph.selection.hops
                      : t.memoryGraph.selection.hopsPlural
                    ).replace("{count}", String(h))}
                  </button>
                ))}
              </div>
              {/* Said BEFORE the share, not discovered after it: the hops are what make the
                  payload bigger than the count the member ticked, so the number that will
                  actually travel has to be on screen next to the button that sends it. */}
              <span className="shrink-0 text-fg-muted">
                {t.memoryGraph.selection.sharing.replace(
                  "{count}",
                  String(shareNames.length),
                )}
              </span>
            </>
          )}
          {mangroveOn === true && (
            <button
              type="button"
              // The names, not the entities: the mangrove extracts them itself, along
              // with the relations among them, so what travels is the same key the graph
              // is indexed by everywhere else in this panel.
              onClick={() => {
                requestMangroveShare({ kind: "entities", names: shareNames });
                setDestination("mangrove");
              }}
              disabled={shareTooMany}
              className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Waves size={12} aria-hidden />
              {t.memoryGraph.selection.share}
            </button>
          )}
          <button
            type="button"
            onClick={clearChecked}
            className={`${mangroveOn === true ? "" : "ml-auto "}shrink-0 rounded px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-elevated hover:text-fg`}
          >
            {t.memoryGraph.selection.clear}
          </button>
          {/* A disabled control with no reason on screen is the thing that makes a member
              think the feature is broken. Its own line, so the remedy sits under the
              control that provides it. */}
          {mangroveOn === true && shareTooMany && (
            <p className="basis-full leading-snug text-fg-muted">
              {t.memoryGraph.selection.shareTooMany
                .replace("{count}", String(shareNames.length))
                .replace("{max}", String(MAX_SHARE_NAMES))}
            </p>
          )}
        </div>
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
                selection={selection}
                onSelect={select}
                emptyTitle={t.memoryGraph.empty.title}
                emptyBody={t.memoryGraph.empty.body}
                observationsLabel={t.memoryGraph.observations}
                relationsLabel={t.memoryGraph.relations}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                allLabel={t.memoryGraph.allTypes}
                noneOfTypeLabel={t.memoryGraph.noneOfType}
                noneOfTypeHint={t.memoryGraph.noneOfTypeHint}
              />
            )}

            {mode === "map" && graph && (
              // Fills whatever the pane is: a graph in a narrow column is unreadable, and
              // the pane it renders in is drag-resizable to the width of the viewport
              // precisely for this (see workspace-pane).
              <div className="flex h-full min-h-[320px] flex-col">
                {/* The filter input is NOT rendered here. It lives inside MemoryGraphView, which
                    is the element fullscreen is requested on — rendered out here it disappeared
                    the moment the member expanded the map. */}
                <MemoryGraphView
                  entities={graph.entities}
                  relations={graph.relations}
                  selected={selected}
                  onSelect={selectOnMap}
                  checked={checked}
                  typeFilter={typeFilter}
                  onTypeFilter={setTypeFilter}
                  onResetFilters={resetMapFilters}
                  detail={detailPane}
                  query={mapQueryApplied}
                  matchNames={matchNames}
                  filter={{
                    value: mapQuery,
                    onChange: setMapQuery,
                    searching: contentSearching,
                    failed: contentFailed,
                    capped: contentCapped,
                    cap: MAX_NODES,
                  }}
                  tools={tools}
                  setTool={setTool}
                  copy={t.memoryGraph}
                />
              </div>
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

      {/* On the MAP the detail pane is handed to MemoryGraphView instead, which renders it inside
          the graph column — see `detail` there. Out here it was a sibling of the whole map, so
          opening it shrank the map area and visibly resized the tools sidebar, pulling the eye off
          the entity the member had just clicked. Every other tab still stacks it below the list,
          which is right for a list. */}
      {mode !== "map" && detailPane}
    </div>
  );
}
