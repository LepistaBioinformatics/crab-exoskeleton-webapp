"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { MessageSquare, Tags } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { IconButton } from "@/components/ui/icon-button";
import { setFragmentSid, type Workspace } from "./fragment";
import { onConversationsUpdated, type ConversationSummary } from "@/lib/chatSession";
import { TagCluster, ConversationEditor } from "./conversation-enrichment";
import { getHistory } from "./history-cache";
import {
  laneColorFor,
  buildEvents,
  aggregateBursts,
  type TreeEvent,
  type Burst,
} from "./conversation-bursts";
import { useT, useLocale } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";
import { BCP47 } from "@/lib/i18n/format";

// The "Tree" view: a single vertical timeline where each conversation is a
// colored lane and each *visit* is a node -- a visit ("burst") is a run of
// consecutive messages in the same conversation with no other conversation's
// message between them in time. Ordered most-recent on top (HEAD). It reconciles
// the agent's continuous per-session transcript with the web's recency-first
// list -- the git-graph look comes from activity hopping between lanes over time,
// and returning to a conversation makes a NEW node, so the interleaving stays
// visible without a dot per message (see .specs/features/conversation-tree-view/).

// Hard cap on rendered lane columns so the gutter can't grow unbounded in the
// narrow sidebar (NFR-3). Lanes recycle (a column frees once its conversation's
// last visit has passed), so the count is the max *simultaneously-active*
// conversations, not the total -- this cap is only hit under extreme
// interleaving, where the last column is shared as graceful degradation.
const MAX_LANE_COLUMNS = 8;

// Takes the BCP 47 tag rather than reading the browser default, so a pt-BR
// reader on an en-US machine gets Portuguese dates next to Portuguese copy.
function formatWhen(ts: number, tag: string): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(tag, { day: "2-digit", month: "short" });
}

const eventRow = cva(
  "group relative flex w-full items-stretch gap-1 rounded-lg text-left transition-colors",
  {
    variants: {
      active: { true: "bg-accent/12", false: "hover:bg-elevated/60" },
    },
    defaultVariants: { active: false },
  },
);

export default function ConversationTree({
  workspace,
  conversations,
  activeSessionId,
  onSelect,
  onApply,
}: {
  workspace: Workspace;
  conversations: ConversationSummary[];
  activeSessionId?: string;
  onSelect?: () => void;
  // Optimistic update of a conversation's metadata (alias/tags), so editing from
  // the tree updates the shared list the same way the list view does.
  onApply?: (id: string, fn: (c: ConversationSummary) => ConversationSummary) => void;
}) {
  const t = useT(chatCopy);
  const tag = BCP47[useLocale().locale];
  const [events, setEvents] = useState<TreeEvent[] | null>(null);

  // Conversation metadata (alias/title/tags) by id, for identity lines, tag
  // chips, and tag-derived lane colors on each node.
  const convById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations],
  );

  // Which node has its alias/tags editor expanded.
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  // Hovered conversation: while set it is the spotlighted thread and the others
  // fade back. Nothing fades at rest -- the selection is marked by its row
  // background alone.
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);

  // Always-current active sid, read inside the fetch effect without making it a
  // dependency (navigating shouldn't refetch; only sends/completions should).
  const activeRef = useRef(activeSessionId);
  activeRef.current = activeSessionId;

  // A turn completing doesn't advance `updatedAt`, so the signature-based cache
  // wouldn't refetch. `tick` bumps on every conversations-updated event and
  // force-refetches the active conversation, so a just-finished reply shows up.
  const [tick, setTick] = useState(0);
  useEffect(() => onConversationsUpdated(() => setTick((t) => t + 1)), []);

  // FLIP animation state: element per node key, their previous top offsets, and
  // a flag so the very first populated render doesn't animate the whole list in.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPos = useRef<Map<string, number>>(new Map());
  const firstAnimRun = useRef(true);

  // A signature that changes only when a conversation is added/removed or gets a
  // new message (updatedAt bump) -- so the fetch effect doesn't re-run on every
  // parent re-render even though `conversations` is a fresh array each time.
  const signature = conversations.map((c) => `${c.id}:${c.updatedAt}`).join(",");

  // Reset to the spinner only when the workspace actually changes -- refetches
  // (new message, tick) keep the current spine visible so it never flashes.
  const wsKey = `${workspace.t}:${workspace.s}:${workspace.r}`;
  const prevWsKey = useRef(wsKey);

  useEffect(() => {
    let cancelled = false;
    if (prevWsKey.current !== wsKey) {
      setEvents(null);
      prevWsKey.current = wsKey;
    }
    const active = activeRef.current;
    (async () => {
      const lists = await Promise.all(
        conversations.map(async (c) => {
          const messages = await getHistory(workspace, c, c.id === active);
          return { c, messages };
        }),
      );
      if (cancelled) return;
      // Most recent on top; see buildEvents (conversation-bursts.ts) for the
      // created_at parse, the updatedAt+seq fallback, and the instant-based sort.
      setEvents(buildEvents(lists));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey, signature, tick]);

  const model = useMemo(() => {
    if (!events) return null;
    // Collapse consecutive same-conversation messages into visits (bursts) --
    // see aggregateBursts (conversation-bursts.ts).
    const bursts: Burst[] = aggregateBursts(events);
    // The [first,last] burst-index span of each conversation -> the vertical
    // extent of its rail.
    const range = new Map<string, { first: number; last: number }>();
    bursts.forEach((b, i) => {
      const r = range.get(b.conversationId);
      if (!r) range.set(b.conversationId, { first: i, last: i });
      else r.last = i;
    });
    // Lane packing with recycling: assign each conversation (top-to-bottom, i.e.
    // by recency) to the first lane whose current occupant has already ended
    // (its last row is above this conversation's first row). A lane thus hosts
    // several non-overlapping conversations over its height; the column count is
    // the max overlap depth = simultaneously-active conversations. Colors stay
    // per-conversation (not per-lane), so identity survives reuse.
    const convs = [...range.entries()]
      .map(([id, r]) => ({ id, first: r.first, last: r.last }))
      .sort((a, b) => a.first - b.first);
    const laneLastRow: number[] = []; // laneLastRow[l] = bottom-most row still in lane l
    const dotLaneOf = new Map<string, number>();
    // Conversations whose real lane exceeds the column cap: they're clamped onto
    // the last column for their dot, but must NOT contribute a rail segment there
    // -- their span overlaps whoever legitimately owns that column, and a shared
    // column can only draw one continuous 1px rail. Adding them would let the
    // first-sorted segment steal the others' rails, leaving their dots detached
    // and mis-colored. So overflow lanes keep their dots but forgo the rail.
    const overflowIds = new Set<string>();
    for (const c of convs) {
      let lane = laneLastRow.findIndex((lastRow) => lastRow < c.first);
      if (lane === -1) lane = laneLastRow.length;
      laneLastRow[lane] = c.last;
      if (lane >= MAX_LANE_COLUMNS) overflowIds.add(c.id);
      dotLaneOf.set(c.id, Math.min(lane, MAX_LANE_COLUMNS - 1));
    }
    const laneCount = Math.min(laneLastRow.length, MAX_LANE_COLUMNS);
    // Per-lane segments so a row can look up which conversation occupies each lane
    // column and draw its rail in the right color. Overflow lanes are skipped so
    // they never corrupt the owning conversation's rail (see above).
    const laneSegments: { first: number; last: number; id: string }[][] = Array.from(
      { length: laneCount },
      () => [],
    );
    range.forEach((r, id) => {
      if (overflowIds.has(id)) return;
      laneSegments[dotLaneOf.get(id)!].push({ first: r.first, last: r.last, id });
    });
    laneSegments.forEach((segs) => segs.sort((a, b) => a.first - b.first));
    return { bursts, dotLaneOf, laneCount, laneSegments };
  }, [events]);

  // FLIP: after each order change, slide rows from their old positions to the
  // new ones and fade new nodes in. Uses the Web Animations API (no leftover
  // inline styles) and honors prefers-reduced-motion.
  const orderSig = model ? model.bursts.map((b) => `${b.conversationId}-${b.startAnchor}`).join(",") : "";
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const newPos = new Map<string, number>();
    rowRefs.current.forEach((el, key) => newPos.set(key, el.offsetTop));
    if (!firstAnimRun.current && !reduce) {
      newPos.forEach((top, key) => {
        const el = rowRefs.current.get(key);
        if (!el) return;
        const prev = prevPos.current.get(key);
        if (prev === undefined) {
          el.animate(
            [
              { opacity: 0, transform: "translateY(-6px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        } else if (prev !== top) {
          el.animate(
            [{ transform: `translateY(${prev - top}px)` }, { transform: "none" }],
            { duration: 260, easing: "ease-out" },
          );
        }
      });
    }
    prevPos.current = newPos;
    if (newPos.size > 0) firstAnimRun.current = false;
  }, [orderSig]);

  if (!events || !model) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size={20} />
      </div>
    );
  }
  if (model.bursts.length === 0) {
    // Same copy as the list view: the two are two renderings of one conversation
    // set, so an empty one is the same fact stated in the same words.
    return (
      <PanelEmpty
        icon={MessageSquare}
        title={t.history.noneYet}
        body={t.history.noneYetHint}
      />
    );
  }

  const { bursts, dotLaneOf, laneCount, laneSegments } = model;

  // Hover-only spotlight: at rest the whole tree is lit, and only while one
  // thread is hovered do the others fade back so its lane reads as one strand.
  const isDimmed = (id: string) => hoveredConv != null && id !== hoveredConv;

  return (
    <div role="tree" aria-label={t.history.treeAria} className="flex min-h-full flex-col">
      {bursts.map((b, i) => {
        const dotLane = dotLaneOf.get(b.conversationId)!;
        const conv = convById.get(b.conversationId);
        const color = laneColorFor(conv, b.conversationId);
        const active = b.conversationId === activeSessionId;
        const isHead = i === 0; // single HEAD = the most recent visit overall
        const key = `${b.conversationId}-${b.startAnchor}`;
        const title = conv?.title ?? b.label;
        const alias = conv?.alias ?? null;
        const tags = conv?.tags ?? [];
        const editing = enrichingId === key;
        const dimmed = isDimmed(b.conversationId);

        return (
          <div
            key={key}
            role="none"
            ref={(el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
            className="group relative"
            onMouseEnter={() => setHoveredConv(b.conversationId)}
            onMouseLeave={() => setHoveredConv(null)}
          >
            <div className={eventRow({ active })}>
              <button
                type="button"
                role="treeitem"
                aria-selected={active}
                onClick={() => {
                  // Open the conversation AND scroll to this exact message (the
                  // one shown on the node), not the end of the chat.
                  setFragmentSid(b.conversationId, b.anchor);
                  onSelect?.();
                }}
                className="flex min-w-0 flex-1 items-stretch gap-1 text-left"
                title={alias || title}
              >
                {/* Gutter: one column per active lane, each carrying a vertical
                    colored line where its conversation spans this row, plus the
                    dot in the current visit's lane. Colors come from the tag
                    color when set, else the stable hash. */}
                <span className="relative flex shrink-0" style={{ width: laneCount * 14 }} aria-hidden>
                  {Array.from({ length: laneCount }, (_, l) => {
                    const seg = laneSegments[l].find((s) => i >= s.first && i <= s.last);
                    const dotHere = l === dotLane;
                    return (
                      <span key={l} className="relative w-3.5">
                        {seg && (
                          <span
                            // Full lane color + opacity dim, so the connecting
                            // line matches its dot exactly (same color and fade)
                            // instead of a washed-out low-alpha tint. The dim
                            // is a class, not an inline opacity, so it can be
                            // scoped to hover-capable pointers (globals.css).
                            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-opacity duration-200${
                              isDimmed(seg.id) ? " spotlight-dim-strong" : ""
                            }`}
                            style={{ backgroundColor: laneColorFor(convById.get(seg.id), seg.id) }}
                          />
                        )}
                        {dotHere && (
                          <span
                            className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-opacity duration-200${
                              dimmed ? " spotlight-dim-strong" : ""
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        )}
                      </span>
                    );
                  })}
                </span>

                {/* Message exchanged at this point (primary). Alias (secondary)
                    and tags show only on the conversation's most recent visit;
                    everything fades when another thread is focused. */}
                <span
                  className={`flex min-w-0 flex-1 flex-col gap-0.5 py-2 pr-2 transition-opacity duration-200${
                    dimmed ? " spotlight-dim" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{b.text}</span>
                    {b.count > 1 && (
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted" title={t.history.messagesOther.replace("{n}", String(b.count))}>
                        ·{b.count}
                      </span>
                    )}
                    {isHead && (
                      <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wide text-accent">
                        HEAD
                      </span>
                    )}
                    {b.isLatest && tags.length > 0 && <TagCluster tags={tags} />}
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{formatWhen(b.ts, tag)}</span>
                  </span>
                  {b.isLatest && alias && (
                    <span className="w-full truncate text-xs text-fg-muted">{alias}</span>
                  )}
                </span>
              </button>

              {onApply && conv && (
                <div className="absolute right-1 top-1 z-10 flex items-center rounded-lg bg-surface/95 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label={t.history.aliasAndTags}
                    title={t.history.aliasAndTags}
                    onClick={() => setEnrichingId(editing ? null : key)}
                    aria-expanded={editing}
                  >
                    <Tags size={14} aria-hidden />
                  </IconButton>
                </div>
              )}
            </div>

            {editing && conv && onApply && (
              <ConversationEditor
                conversation={conv}
                onApply={(fn) => onApply(b.conversationId, fn)}
                onClose={() => setEnrichingId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
