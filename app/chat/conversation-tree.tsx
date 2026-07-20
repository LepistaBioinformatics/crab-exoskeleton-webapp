"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { Tags } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { IconButton } from "@/components/ui/icon-button";
import { setFragmentSid, type Workspace } from "./fragment";
import { onConversationsUpdated, type ConversationSummary } from "@/lib/chatSession";
import { TagChip, ConversationEditor } from "./conversation-enrichment";
import { getHistory } from "./history-cache";

// The "Tree" view: a single vertical timeline where each conversation is a
// colored lane and each *visit* is a node -- a visit ("burst") is a run of
// consecutive messages in the same conversation with no other conversation's
// message between them in time. Ordered most-recent on top (HEAD). It reconciles
// the agent's continuous per-session transcript with the web's recency-first
// list -- the git-graph look comes from activity hopping between lanes over time,
// and returning to a conversation makes a NEW node, so the interleaving stays
// visible without a dot per message (see .specs/features/conversation-tree-view/).

interface TreeEvent {
  conversationId: string;
  label: string; // conversation title/alias (for the row tooltip)
  content: string; // the message text shown on the node
  createdAt: string; // raw created_at (scroll anchor)
  ts: number; // parsed created_at (ms)
  seq: number; // original line index within its conversation, for tiebreaks
}

// A visit: a run of consecutive same-conversation messages. This is the rendered
// unit (one node per burst), keeping the interleaving without a dot per message.
// text/anchor/ts describe the burst's most-recent message -- the one the node
// shows and the one clicking it scrolls to.
interface Burst {
  conversationId: string;
  label: string;
  text: string;
  anchor: string; // most-recent message (scroll target + shown time/text)
  startAnchor: string; // oldest message of the visit -- a stable key as it grows
  ts: number;
  count: number;
  isLatest: boolean; // the most-recent visit of its conversation (shows alias + tags)
}

// Hard cap on rendered lane columns so the gutter can't grow unbounded in the
// narrow sidebar (NFR-3). Lanes recycle (a column frees once its conversation's
// last visit has passed), so the count is the max *simultaneously-active*
// conversations, not the total -- this cap is only hit under extreme
// interleaving, where the last column is shared as graceful degradation.
const MAX_LANE_COLUMNS = 8;

// A stable per-conversation color via the golden angle: hashing the id into a
// hue spreads many conversations across the wheel with few collisions (vs. a
// small fixed palette). Applied via inline `style` (not className) since the set
// is per-conversation and unbounded -- same approach as the tag-color chips in
// history-sidebar.tsx. Fixed S/L stay legible in either theme.
function laneColor(id: string, alpha = 1): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360;
  return alpha < 1
    ? `hsl(${hue.toFixed(1)} 65% 55% / ${alpha})`
    : `hsl(${hue.toFixed(1)} 65% 55%)`;
}

// The first tag color a conversation carries, if any.
function tagColorOf(conv: ConversationSummary | undefined): string | undefined {
  const tag = conv?.tags.find((t) => typeof t.metadata.color === "string" && t.metadata.color);
  return tag ? (tag.metadata.color as string) : undefined;
}

// #rrggbb -> #rrggbbaa, for the faint rail tint.
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

// A conversation's lane color: its tag color when set (so a user-assigned color
// carries into the tree), else the stable golden-angle hash.
function laneColorFor(conv: ConversationSummary | undefined, id: string, alpha = 1): string {
  const tc = tagColorOf(conv);
  if (tc) return alpha < 1 ? withAlpha(tc, alpha) : tc;
  return laneColor(id, alpha);
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short" });
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
  const [events, setEvents] = useState<TreeEvent[] | null>(null);

  // Conversation metadata (alias/title/tags) by id, for identity lines, tag
  // chips, and tag-derived lane colors on each node.
  const convById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations],
  );

  // Which node has its alias/tags editor expanded.
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  // Hovered conversation: while set it becomes the "focused" thread, overriding
  // the selected one. The focused thread stays vivid; the rest fade back.
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

      const built: TreeEvent[] = [];
      for (const { c, messages } of lists) {
        messages.forEach((m, seq) => {
          const parsed = m.created_at ? Date.parse(m.created_at) : NaN;
          // Fall back to the conversation's recency (+ line order) when a
          // per-message timestamp is missing/unparseable -- e.g. an older proxy
          // build that didn't surface created_at. Keeps the tree populated
          // (degraded ordering) instead of showing nothing.
          const ts = Number.isNaN(parsed) ? c.updatedAt + seq : parsed;
          built.push({
            conversationId: c.id,
            label: c.alias || c.title,
            content: m.content,
            createdAt: m.created_at ?? "",
            ts,
            seq,
          });
        });
      }
      // Most recent on top. Same-conversation ties fall back to line order; the
      // sort is on parsed instants, never raw strings (NFR-2).
      built.sort((a, b) => b.ts - a.ts || (a.conversationId === b.conversationId ? b.seq - a.seq : 0));
      setEvents(built);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey, signature, tick]);

  const model = useMemo(() => {
    if (!events) return null;
    // Collapse consecutive same-conversation messages into visits. Since events
    // are globally time-sorted (desc), adjacency here means no other
    // conversation's message fell between them -> exactly one visit. The first
    // element of a run is the most recent, so its ts positions the burst.
    const bursts: Burst[] = [];
    const seenConv = new Set<string>(); // first burst seen per conv (desc) = its latest
    for (const e of events) {
      const last = bursts[bursts.length - 1];
      if (last && last.conversationId === e.conversationId) {
        // events are desc, so the run's first element (kept below) is already the
        // most recent; older ones only add to the count and push startAnchor back.
        last.count += 1;
        last.startAnchor = e.createdAt;
      } else {
        const isLatest = !seenConv.has(e.conversationId);
        seenConv.add(e.conversationId);
        bursts.push({
          conversationId: e.conversationId,
          label: e.label,
          text: e.content,
          anchor: e.createdAt,
          startAnchor: e.createdAt,
          ts: e.ts,
          count: 1,
          isLatest,
        });
      }
    }
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
    for (const c of convs) {
      let lane = laneLastRow.findIndex((lastRow) => lastRow < c.first);
      if (lane === -1) lane = laneLastRow.length;
      laneLastRow[lane] = c.last;
      dotLaneOf.set(c.id, Math.min(lane, MAX_LANE_COLUMNS - 1));
    }
    const laneCount = Math.min(laneLastRow.length, MAX_LANE_COLUMNS);
    // Per-lane segments (after clamping) so a row can look up which conversation
    // occupies each lane column and draw its rail in the right color.
    const laneSegments: { first: number; last: number; id: string }[][] = Array.from(
      { length: laneCount },
      () => [],
    );
    range.forEach((r, id) => {
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
    return <p className="py-4 text-center text-sm text-fg-muted">No conversations yet.</p>;
  }

  const { bursts, dotLaneOf, laneCount, laneSegments } = model;

  return (
    <div role="tree" aria-label="Conversation tree" className="flex flex-col">
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
        // Focused thread = hovered (if any) else the selected conversation; the
        // others fade back so one thread stands out. With nothing selected and
        // nothing hovered the whole tree stays at full emphasis (nada esmaecido);
        // a selected chat fades the rest, and hovering overrides that focus.
        const focused = hoveredConv ?? activeSessionId ?? null;
        const dimmed = focused != null && b.conversationId !== focused;

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
                    // Focused thread's rail is boosted; others fade back.
                    const railAlpha = focused == null ? 0.4 : seg && seg.id === focused ? 0.65 : 0.1;
                    return (
                      <span key={l} className="relative w-3.5">
                        {seg && (
                          <span
                            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-[background-color] duration-200"
                            style={{ backgroundColor: laneColorFor(convById.get(seg.id), seg.id, railAlpha) }}
                          />
                        )}
                        {dotHere && (
                          <span
                            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-opacity duration-200"
                            style={{ backgroundColor: color, opacity: dimmed ? 0.3 : 1 }}
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
                  className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 pr-2 transition-opacity duration-200"
                  style={{ opacity: dimmed ? 0.4 : 1 }}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{b.text}</span>
                    {b.count > 1 && (
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted" title={`${b.count} messages`}>
                        ·{b.count}
                      </span>
                    )}
                    {isHead && (
                      <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wide text-accent">
                        HEAD
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{formatWhen(b.ts)}</span>
                  </span>
                  {b.isLatest && alias && (
                    <span className="w-full truncate text-xs text-fg-muted">{alias}</span>
                  )}
                  {b.isLatest && tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <TagChip key={tag.name} tag={tag} />
                      ))}
                    </span>
                  )}
                </span>
              </button>

              {onApply && conv && (
                <div className="absolute right-1 top-1 z-10 flex items-center rounded-lg bg-surface/95 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Alias and tags"
                    title="Alias and tags"
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
