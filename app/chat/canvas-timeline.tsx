"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import MessageContent from "@/app/chat/message-content";
import {
  listConversations,
  onConversationsUpdated,
  type ConversationSummary,
} from "@/lib/chatSession";
import { getHistory } from "./history-cache";
import {
  buildEvents,
  aggregateBursts,
  deriveLanes,
  laneColorFor,
  type Burst,
  type ConversationLane,
} from "./conversation-bursts";
import { setFragmentSid, setView, type Workspace } from "./fragment";
import ViewModeToggle from "./view-mode-toggle";

// The Canvas timeline: an alternative, graphics-forward view of a workspace's
// conversations (see .specs/features/canvas-timeline-view/). Time flows left ->
// right; each conversation is a STABLE lane (one per conversation, never popping
// in/out), its activity bursts are dots -- the very "pontinhos" of the tree,
// built from the shared model so colors/aggregation match exactly. An aggregate
// "agent pulse" strip above conveys volume accumulating over time. Read-only:
// clicking a lane previews it; "Full transcript" hands off to the traditional
// chat. Paging is horizontal scroll (the cap below bounds drawing, not fetch).

// Bound the number of lanes drawn (graceful overflow: least-active collapse),
// same spirit as the tree's MAX_LANE_COLUMNS. Fetch stays O(all conversations).
const MAX_LANES = 40;
const NBUCKETS = 40;

const PAD_L = 30;
const PAD_R = 190; // room for the leaf label
const LANE_H = 48;
const PAD_TOP = 10;
const INNER_W = 1500; // fallback time-axis width before the stage is measured
const FIT_MIN = 480; // narrowest the axis is allowed to fit to
const MIN_PX_PER_DAY = 6; // long histories exceed the width (scroll) instead of cramming
const MS_PER_DAY = 86400000;
const PULSE_H = 54;

const FG = "var(--fg)";
const MUTED = "var(--fg-muted)";
const LINE = "color-mix(in srgb, var(--brand) 30%, transparent)";

// Theme-aware pixel-art quadriculado: a fine cell grid + a stronger every-5th
// cell, brand-tinted so it reads in light and dark from one declaration.
const GRID_BG = [
  "repeating-linear-gradient(0deg, transparent 0 15px, color-mix(in srgb, var(--brand) 6%, transparent) 15px 16px)",
  "repeating-linear-gradient(90deg, transparent 0 15px, color-mix(in srgb, var(--brand) 6%, transparent) 15px 16px)",
  "repeating-linear-gradient(0deg, transparent 0 79px, color-mix(in srgb, var(--brand) 10%, transparent) 79px 80px)",
  "repeating-linear-gradient(90deg, transparent 0 79px, color-mix(in srgb, var(--brand) 10%, transparent) 79px 80px)",
].join(",");

// Scoped keyframes + reduced-motion gating for the draw-in animations.
const CANVAS_CSS = `
.ct-stage { background-image: ${GRID_BG}; }
@media (prefers-reduced-motion: no-preference) {
  .ct-grow { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: ctDraw .9s ease forwards; }
  .ct-pop { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ctPop .4s ease forwards; }
  @keyframes ctDraw { to { stroke-dashoffset: 0; } }
  @keyframes ctPop { 0% { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
}
.ct-lane { cursor: pointer; }
.ct-lane:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ct-lane .ct-bg { fill: transparent; }
.ct-lane:hover .ct-bg { fill: color-mix(in srgb, var(--accent) 8%, transparent); }
.ct-dim { opacity: .2; transition: opacity .2s ease; }
`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function ago(ms: number): string {
  const days = Math.round((Date.now() - ms) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default function CanvasTimeline({ workspace }: { workspace: Workspace }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [bursts, setBursts] = useState<Burst[] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [soloId, setSoloId] = useState<string | null>(null);

  // The timeline width tracks the stage so a "page" fills the screen instead of
  // forcing horizontal overflow at a fixed width (responsive). A ResizeObserver
  // on the scroller keeps stageW current; the callback ref (re)attaches it as the
  // element mounts/unmounts.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [stageW, setStageW] = useState(0);
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    stageRef.current = el;
    if (el) {
      setStageW(el.clientWidth);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) setStageW(e.contentRect.width);
      });
      ro.observe(el);
      roRef.current = ro;
    }
  }, []);

  const convById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations],
  );

  // Live conversation list (same source as the sidebar/tree). `listLoaded` gates
  // the build below so a populated workspace shows the spinner (not the empty
  // state) while the first list + histories are still loading.
  useEffect(() => {
    setListLoaded(false);
    const refresh = () =>
      listConversations(workspace).then((c) => {
        setConversations(c);
        setListLoaded(true);
      });
    refresh();
    return onConversationsUpdated(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r]);

  // Build the shared burst model from every conversation's history (cached
  // N-fetch -- fetch is O(all conversations), the render cap bounds drawing).
  const wsKey = `${workspace.t}:${workspace.s}:${workspace.r}`;
  const prevWsKey = useRef(wsKey);
  const signature = conversations.map((c) => `${c.id}:${c.updatedAt}`).join(",");
  useEffect(() => {
    let cancelled = false;
    // Reset to the spinner only when the workspace actually changes -- refetches
    // keep the current lanes visible so they don't flash.
    if (prevWsKey.current !== wsKey) {
      setBursts(null);
      setSoloId(null);
      setPreviewId(null);
      prevWsKey.current = wsKey;
    }
    // Wait for the first conversation list before building -- keeps bursts null
    // (spinner) instead of flashing "No conversations yet." mid-load.
    if (!listLoaded) return;
    (async () => {
      const lists = await Promise.all(
        conversations.map(async (c) => ({ c, messages: await getHistory(workspace, c) })),
      );
      if (cancelled) return;
      setBursts(aggregateBursts(buildEvents(lists)));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey, signature, listLoaded]);

  // Derive stable lanes (one per conversation) + the time range.
  const model = useMemo(() => (bursts ? deriveLanes(bursts, MAX_LANES) : null), [bursts]);

  const header = (
    <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-brand/30 px-4">
      <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold capitalize text-fg" title={`agent ${workspace.r}`}>
        {workspace.r}
      </span>
      <ViewModeToggle view="canvas" />
      <div className="flex-1" aria-hidden />
    </div>
  );

  if (!model) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={28} />
        </div>
      </div>
    );
  }

  const { lanes, tMin, range, overflow } = model;
  const shownLanes = soloId ? lanes.filter((l) => l.id === soloId) : lanes;
  const previewLane = previewId ? lanes.find((l) => l.id === previewId) : null;

  // Fit the time axis to the stage width (responsive); a floor keeps it legible
  // on very narrow viewports, and a per-day minimum lets a long history exceed
  // the width and scroll instead of cramming. Otherwise the whole page fits with
  // no horizontal overflow.
  const fitW = Math.max(FIT_MIN, (stageW || INNER_W + PAD_L + PAD_R) - PAD_L - PAD_R);
  const densityW = (range / MS_PER_DAY) * MIN_PX_PER_DAY;
  const innerW = Math.max(fitW, densityW);
  const W = PAD_L + innerW + PAD_R;
  const overflowX = stageW > 0 && W > stageW + 1;
  const xOf = (t: number) => PAD_L + ((t - tMin) / range) * innerW;
  const LANES_H = PAD_TOP + Math.max(shownLanes.length, 1) * LANE_H + PAD_TOP;
  const AXIS_H = 28;
  const ticks = Array.from({ length: 5 }, (_, d) => tMin + (d / 4) * range);

  const openTraditional = (id: string) => {
    setFragmentSid(id);
    setView("chat");
  };

  return (
    <div className="relative flex h-full flex-col">
      <style>{CANVAS_CSS}</style>
      {header}

      {/* Time band + pager */}
      <div className="flex shrink-0 items-center gap-2 border-b border-brand/20 px-4 py-1.5 text-xs text-fg-muted">
        <span className="font-semibold text-fg">{fmtDate(tMin)} → {fmtDate(model.tMax)}</span>
        <span>· time flows right →</span>
        {soloId && (
          <Button variant="text" size="sm" className="h-6 gap-1 px-1 text-accent" onClick={() => setSoloId(null)}>
            <X size={13} /> show all
          </Button>
        )}
        {overflow > 0 && <span className="text-fg-muted">· {overflow} quieter conversation(s) hidden</span>}
        {overflowX && (
          <div className="ml-auto flex items-center gap-1">
            <IconButton variant="ghost" size="sm" aria-label="Page left" onClick={() => stageRef.current?.scrollBy({ left: -600, behavior: "smooth" })}>
              <ChevronLeft size={16} aria-hidden />
            </IconButton>
            <IconButton variant="ghost" size="sm" aria-label="Page right" onClick={() => stageRef.current?.scrollBy({ left: 600, behavior: "smooth" })}>
              <ChevronRight size={16} aria-hidden />
            </IconButton>
          </div>
        )}
      </div>

      {lanes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-fg-muted">No conversations yet.</p>
        </div>
      ) : (
        <div ref={attachStage} className="ct-stage relative flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full flex-col" style={{ width: W }}>
            <div className="shrink-0">
              <AgentPulse bursts={bursts!} innerW={innerW} width={W} />
            </div>

            {/* Lanes scroll vertically between the pulse (top) and the date axis
                (pinned to the bottom of the stage). */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <svg viewBox={`0 0 ${W} ${LANES_H}`} width={W} height={LANES_H} style={{ display: "block" }}>
                {/* faint vertical time guides spanning the lane stack */}
                {ticks.map((tt, d) => (
                  <line key={d} x1={xOf(tt)} y1={0} x2={xOf(tt)} y2={LANES_H} stroke={LINE} strokeWidth={1} strokeDasharray="2 4" />
                ))}

                {shownLanes.map((lane, i) => {
              const conv = convById.get(lane.id);
              const color = laneColorFor(conv, lane.id);
              const y = PAD_TOP + i * LANE_H + LANE_H / 2;
              const x1 = xOf(lane.firstT);
              const x2 = Math.max(xOf(lane.lastT), x1 + 6);
              const dimmed = hoveredId !== null && hoveredId !== lane.id;
              const title = conv?.alias || conv?.title || lane.id;
              return (
                <g
                  key={lane.id}
                  className={`ct-lane${dimmed ? " ct-dim" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Preview ${title}`}
                  onMouseEnter={() => setHoveredId(lane.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setPreviewId(lane.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewId(lane.id); }
                  }}
                >
                  <rect className="ct-bg" x={0} y={y - LANE_H / 2} width={W} height={LANE_H} rx={6} />
                  <line
                    className="ct-grow"
                    x1={x1} y1={y} x2={x2} y2={y}
                    stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.85}
                    style={{ ["--len" as string]: `${Math.round(x2 - x1)}` }}
                  />
                  {lane.bursts.map((b, bi) => {
                    const recency = (b.ts - tMin) / range;
                    const r = (3 + Math.min(b.count, 5) * 0.7) * (0.85 + recency * 0.5);
                    return (
                      <circle
                        key={`${b.conversationId}-${b.startAnchor}-${bi}`}
                        className="ct-pop"
                        cx={xOf(b.ts)} cy={y} r={r}
                        fill={color} stroke="var(--bg)" strokeWidth={1.5}
                        opacity={0.7 + recency * 0.3}
                      >
                        <title>{`${fmtDate(b.ts)} · ${b.count} msg${b.count > 1 ? "s" : ""}`}</title>
                      </circle>
                    );
                  })}
                  <text x={x1} y={y - 12} fontSize={16} fontWeight={700} fill={FG}>{title}</text>
                </g>
              );
            })}
              </svg>
            </div>

            {/* Date axis, pinned to the bottom of the stage */}
            <div className="shrink-0 border-t border-brand/20 bg-bg/80 backdrop-blur">
              <svg viewBox={`0 0 ${W} ${AXIS_H}`} width={W} height={AXIS_H} style={{ display: "block" }}>
                {ticks.map((tt, d) => (
                  <g key={d}>
                    <line x1={xOf(tt)} y1={0} x2={xOf(tt)} y2={5} stroke={LINE} strokeWidth={1} />
                    <text x={xOf(tt)} y={19} textAnchor="middle" fontSize={10} fill={MUTED} className="font-mono">{fmtDate(tt)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}

      {previewLane && (
        <Preview
          key={previewLane.id}
          lane={previewLane}
          conv={convById.get(previewLane.id)}
          color={laneColorFor(convById.get(previewLane.id), previewLane.id)}
          isSolo={soloId === previewLane.id}
          onClose={() => setPreviewId(null)}
          onSolo={() => setSoloId((s) => (s === previewLane.id ? null : previewLane.id))}
          onOpen={() => openTraditional(previewLane.id)}
        />
      )}
    </div>
  );
}

// Aggregate message volume bucketed over the time range -- the agent's "pulse".
function AgentPulse({ bursts, innerW, width }: { bursts: Burst[]; innerW: number; width: number }) {
  const { area, line, total } = useMemo(() => {
    if (bursts.length === 0) return { area: "", line: "", total: 0 };
    const times = bursts.map((b) => b.ts);
    const tMin = Math.min(...times);
    const range = Math.max(Math.max(...times) - tMin, 1);
    const buckets = new Array(NBUCKETS).fill(0);
    let total = 0;
    for (const b of bursts) {
      const k = Math.min(NBUCKETS - 1, Math.max(0, Math.floor(((b.ts - tMin) / range) * (NBUCKETS - 1))));
      buckets[k] += b.count;
      total += b.count;
    }
    const maxB = Math.max(...buckets) || 1;
    const step = innerW / (NBUCKETS - 1);
    let line = "";
    buckets.forEach((v, k) => {
      const x = PAD_L + k * step;
      const y = PULSE_H - 6 - (v / maxB) * (PULSE_H - 12);
      line += `${k === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    });
    const area = `${line}L ${(PAD_L + (NBUCKETS - 1) * step).toFixed(1)} ${PULSE_H - 6} L ${PAD_L} ${PULSE_H - 6} Z`;
    return { area, line, total };
  }, [bursts, innerW]);

  return (
    <div className="pt-2">
      <div className="mb-1 flex items-baseline gap-2 px-4">
        <span className="font-display text-[11px] font-semibold text-fg">Agent pulse</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-muted">message volume over time · {total} total</span>
      </div>
      <svg viewBox={`0 0 ${width} ${PULSE_H}`} width={width} height={PULSE_H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="ct-pulse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.55} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ct-pulse)" stroke="none" />
        <path
          className="ct-grow" d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round"
          style={{ ["--len" as string]: `${innerW * 1.4}` }}
        />
      </svg>
    </div>
  );
}

// Inline preview: last bursts + Solo / Full-transcript, without leaving Canvas.
function Preview({
  lane, conv, color, isSolo, onClose, onSolo, onOpen,
}: {
  lane: ConversationLane;
  conv: ConversationSummary | undefined;
  color: string;
  isSolo: boolean;
  onClose: () => void;
  onSolo: () => void;
  onOpen: () => void;
}) {
  const title = conv?.alias || conv?.title || lane.id;
  const recent = lane.bursts.slice(0, 3); // bursts are most-recent first

  // Opens at the bottom-left; the header is a drag handle. Once dragging starts
  // we switch from the bottom-left CSS anchor to explicit left/top, clamped to
  // the canvas so it can't be dragged off-screen.
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; sl: number; st: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Which message is expanded in place (rendered as markdown); widens the panel.
  const [expanded, setExpanded] = useState<number | null>(null);

  const startDrag = (e: ReactPointerEvent) => {
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!panel || !parent) return;
    const r = panel.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, sl: r.left - pr.left, st: r.top - pr.top };
    setPos({ left: r.left - pr.left, top: r.top - pr.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!d || !panel || !parent) return;
    const maxLeft = Math.max(0, parent.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, parent.clientHeight - panel.offsetHeight);
    setPos({
      left: Math.min(Math.max(0, d.sl + (e.clientX - d.sx)), maxLeft),
      top: Math.min(Math.max(0, d.st + (e.clientY - d.sy)), maxTop),
    });
  };
  const endDrag = (e: ReactPointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  return (
    <div
      ref={panelRef}
      className={`absolute z-10 overflow-hidden border border-brand/40 bg-surface shadow-lg transition-[width] duration-200 ${expanded !== null ? "w-[min(680px,92vw)]" : "w-[min(360px,84vw)]"}${pos ? "" : " left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`}
      style={pos ? { left: pos.left, top: pos.top } : undefined}
      role="dialog"
      aria-label={`Preview ${title}`}
    >
      <div
        className="flex cursor-move touch-none select-none items-center gap-2 border-b border-brand/20 px-4 py-3"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">{title}</span>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close preview"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto px-4 py-3">
        <p className="text-[11px] text-fg-muted">
          {lane.totalMsgs} messages · {lane.bursts.length} bursts · last {ago(lane.lastT)}
        </p>
        {recent.map((b, i) => {
          const isExp = expanded === i;
          return (
            <div
              key={`${b.startAnchor}-${i}`}
              className="overflow-hidden border-[0.5px] border-brand/25 bg-elevated/50"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <button
                type="button"
                onClick={() => setExpanded(isExp ? null : i)}
                aria-expanded={isExp}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-elevated"
              >
                <span className="font-mono text-[9px] uppercase tracking-wide text-fg-muted">
                  {fmtDate(b.ts)} · {b.count} msg{b.count > 1 ? "s" : ""}
                </span>
                <ChevronDown
                  size={13}
                  className={`ml-auto shrink-0 text-fg-muted transition-transform ${isExp ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {isExp ? (
                // Full message, rendered as markdown; scrolls to read it all.
                <div className="max-h-[46vh] overflow-auto border-t border-brand/15 px-3 py-2">
                  <MessageContent content={b.text} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(i)}
                  className="block w-full px-2 pb-1.5 text-left"
                >
                  <span className="line-clamp-2 text-xs text-fg">{b.text}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 border-t border-brand/20 px-4 py-3">
        <Button variant="outlined" size="sm" className="flex-1" onClick={onSolo}>
          {isSolo ? "Show all" : "Solo this lane"}
        </Button>
        <Button variant="filled" size="sm" className="flex-1" onClick={onOpen}>
          Full transcript
        </Button>
      </div>
    </div>
  );
}
