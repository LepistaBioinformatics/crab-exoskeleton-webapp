import type { ConversationSummary } from "@/lib/chatSession";
import type { HistoryMessage } from "./history-cache";

// Shared conversation-activity model, extracted from conversation-tree.tsx so the
// Tree spine and the Canvas timeline build identical "pontinhos" and identity
// colors from one source (see .specs/features/canvas-timeline-view/). This module
// owns the color scheme, the event/burst types, and the two pure transforms
// (buildEvents, aggregateBursts). Layout (lane packing, spine vs. timeline) stays
// in each view.

// A stable per-conversation color via the golden angle: hashing the id into a
// hue spreads many conversations across the wheel with few collisions (vs. a
// small fixed palette). Applied via inline `style` (not className) since the set
// is per-conversation and unbounded. Fixed S/L stay legible in either theme.
export function laneColor(id: string, alpha = 1): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360;
  return alpha < 1
    ? `hsl(${hue.toFixed(1)} 65% 55% / ${alpha})`
    : `hsl(${hue.toFixed(1)} 65% 55%)`;
}

// The first tag color a conversation carries, if any.
export function tagColorOf(conv: ConversationSummary | undefined): string | undefined {
  const tag = conv?.tags.find((t) => typeof t.metadata.color === "string" && t.metadata.color);
  return tag ? (tag.metadata.color as string) : undefined;
}

// #rrggbb -> #rrggbbaa, for the faint rail tint.
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

// A conversation's lane color: its tag color when set (so a user-assigned color
// carries into the tree/timeline), else the stable golden-angle hash.
export function laneColorFor(
  conv: ConversationSummary | undefined,
  id: string,
  alpha = 1,
): string {
  const tc = tagColorOf(conv);
  if (tc) return alpha < 1 ? withAlpha(tc, alpha) : tc;
  return laneColor(id, alpha);
}

export interface TreeEvent {
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
export interface Burst {
  conversationId: string;
  label: string;
  text: string;
  anchor: string; // most-recent message (scroll target + shown time/text)
  startAnchor: string; // oldest message of the visit -- a stable key as it grows
  ts: number;
  count: number;
  isLatest: boolean; // the most-recent visit of its conversation (shows alias + tags)
}

// Flatten per-conversation histories to time-sorted message events. Falls back to
// the conversation's recency (+ line order) when a per-message timestamp is
// missing/unparseable -- e.g. an older proxy build that didn't surface
// created_at. Keeps the model populated (degraded ordering) instead of empty.
// The sort is on parsed instants, never raw strings; same-conversation ties fall
// back to line order.
export function buildEvents(
  lists: { c: ConversationSummary; messages: HistoryMessage[] }[],
): TreeEvent[] {
  const built: TreeEvent[] = [];
  for (const { c, messages } of lists) {
    messages.forEach((m, seq) => {
      const parsed = m.created_at ? Date.parse(m.created_at) : NaN;
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
  built.sort(
    (a, b) => b.ts - a.ts || (a.conversationId === b.conversationId ? b.seq - a.seq : 0),
  );
  return built;
}

// A stable timeline lane: one per conversation, its visits, and its active span.
export function aggregateBursts(events: TreeEvent[]): Burst[] {
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
  return bursts;
}
