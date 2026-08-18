"use client";

// The bar of conversations left running elsewhere.
//
// It is a READ-OUT, not a mechanism. Turns already survive navigation — turn-store.ts is
// module scope precisely so they do, and long-turn-resilience's recovery runs there for the
// same reason — so nothing here keeps anything alive. What was missing is that the store
// had no way to be enumerated: `useTurn(sid)` answered about one conversation and nothing
// answered about the rest.
//
// Mounted as a sibling of ChatView, never inside it: chat-shell keys ChatView on
// `${t}|${s}|${r}` and unmounts it on a workspace switch, which is exactly the moment this
// bar has to keep standing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronUp, Loader2, PencilLine, RefreshCw } from "lucide-react";
import { listConversations, type ConversationSummary } from "@/lib/chatSession";
import { laneColorFor } from "./conversation-bursts";
import { TagCluster } from "./conversation-enrichment";
import { setWorkspace, type Workspace } from "./fragment";
import { acknowledgeTurn, useActiveTurns, type DockState } from "./turn-store";
import { restoredSince } from "./turn-restore";
import {
  DESKTOP_CAP,
  dockLayout,
  elapsedReadout,
  hidesForKeyboard,
  orderDocked,
  qualifier,
  railColor,
  splitDock,
  summaryState,
  type DockSegment,
} from "./dock-segments";
import { formatElapsed } from "./turn-progress";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

// The turn store does not know a conversation's name, and teaching it would give it a
// second source of truth for conversation metadata plus a staleness problem on rename.
// ConversationSummary already carries alias/title, so the dock joins against it.
//
// The whole record, not just the name: the chip's identity COLOUR comes from
// `laneColorFor`, which prefers the conversation's first tag colour and needs the tags to
// find it. Caching only `alias ?? title` would force a second lookup for the colour.
//
// Module scope, keyed by session id, because the bar remounts with the shell and refetching
// the same list on every remount is the behaviour this cache exists to avoid.
const records = new Map<string, ConversationSummary>();

// Workspaces with a request in the air. NOT a "already fetched" set, and that distinction
// is the bug it replaces: marking a workspace permanently meant a conversation created
// AFTER its list loaded could never get a name — which is the ordinary in-session case,
// since a chat docks the moment you send in it and navigate away. So this clears on
// settle, and the loop is closed from the other end instead, by `searched`.
const inFlight = new Set<string>();

// Session ids we asked for and the workspace did not return. Without this, an id with no
// record would re-trigger its workspace's fetch on every render forever.
const searched = new Set<string>();

const wsKey = (ws: Workspace) => `${ws.t}|${ws.s}|${ws.r}`;

/**
 * Resolve conversation records for docked chips, one request per workspace that owes one.
 *
 * Returns a lookup rather than the map itself so the identity changes when new records land
 * and the bar re-renders. A conversation whose record has not arrived yet renders its state
 * and no title — honest, and it resolves in one round-trip. Its COLOUR does not wait:
 * `laneColorFor(undefined, sid)` is the same golden-angle hash the tree falls back to, so a
 * chip is correctly coloured from its first frame.
 */
function useDockLabels(segments: DockSegment[]): (sid: string) => ConversationSummary | null {
  const [version, setVersion] = useState(0);
  // The real input: which session ids are still unresolved. Depending on `segments` would
  // re-run this on every reveal tick the store emits.
  const unresolved = segments
    .filter((s) => s.ctx && !records.has(s.sid) && !searched.has(s.sid))
    .map((s) => s.sid)
    .join(",");

  useEffect(() => {
    const wanted = new Map<string, { ws: Workspace; sids: string[] }>();
    for (const s of segments) {
      if (!s.ctx || records.has(s.sid) || searched.has(s.sid)) continue;
      const key = wsKey(s.ctx.workspace);
      if (inFlight.has(key)) continue;
      const bucket = wanted.get(key) ?? { ws: s.ctx.workspace, sids: [] };
      bucket.sids.push(s.sid);
      wanted.set(key, bucket);
    }
    if (wanted.size === 0) return;

    let live = true;
    for (const [key, { ws, sids }] of wanted) {
      inFlight.add(key);
      listConversations(ws)
        .then((list) => {
          for (const c of list) records.set(c.id, c);
          // Asked for and not returned: stop asking. A chip with no record still renders
          // its state and its hashed colour, which is the honest thing to show for a
          // conversation this client cannot name.
          for (const sid of sids) if (!records.has(sid)) searched.add(sid);
          if (live) setVersion((v) => v + 1);
        })
        .catch(() => {
          // A name that failed to load is not a name that does not exist, so nothing goes
          // into `searched` — clearing inFlight alone lets a later render try again.
        })
        .finally(() => {
          inFlight.delete(key);
        });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolved]);

  return useMemo(() => (sid: string) => records.get(sid) ?? null, [version]);
}

/**
 * Tests only. Takes a WHOLE record rather than a label plus a cast: the component reads
 * `alias`, `title` and `tags` today, and a fabricated partial would hand `undefined` to any
 * field a later chip starts reading instead of failing to compile.
 */
export function __seedDockRecord(conv: ConversationSummary) {
  records.set(conv.id, conv);
}

/** Tests only. */
export function __resetDockLabels() {
  records.clear();
  inFlight.clear();
  searched.clear();
}

// ---------------------------------------------------------------------------
// Clocks and keyboard
// ---------------------------------------------------------------------------

/**
 * One interval for the whole bar, not one per chip.
 *
 * The store's snapshot deliberately excludes sub-second time so a reveal tick cannot
 * re-render the dock, which means an advancing counter cannot come from the store. It comes
 * from here.
 */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

/** Whether a text field currently has focus, which on mobile means the keyboard is up. */
function useTypingElsewhere(enabled: boolean): string | null {
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTag(null);
      return;
    }
    const read = () => setTag(document.activeElement?.tagName.toLowerCase() ?? null);
    read();
    document.addEventListener("focusin", read);
    document.addEventListener("focusout", read);
    return () => {
      document.removeEventListener("focusin", read);
      document.removeEventListener("focusout", read);
    };
  }, [enabled]);
  return tag;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const ICONS: Record<DockState, typeof Loader2> = {
  unsent: PencilLine,
  working: Loader2,
  reconnecting: RefreshCw,
  ready: Check,
  failed: AlertTriangle,
};

// The state tone, and it applies to the ICON AND THE STATE LABEL ONLY — never to the
// conversation's name, and never to the whole chip.
//
// Two corrections are baked in here. `text-accent-fg` used to be right because the bar was
// an accent fill and that token is the ink FOR an accent fill; on the neutral surface the
// bar now uses it is simply the wrong colour. And the name used to be painted in the lane
// colour, which put unbounded hashed hues — including pale ones — on text that has to be
// read. Identity lives in the rail; text stays legible ink.
const TONES: Record<DockState, string> = {
  unsent: "text-notice",
  working: "text-fg-muted",
  reconnecting: "text-fg-muted",
  ready: "text-fg font-semibold",
  failed: "text-blocked",
};

const SPINS: Record<DockState, boolean> = {
  unsent: false,
  working: true,
  reconnecting: true,
  ready: false,
  failed: false,
};

export default function TurnDock({
  currentSid,
  currentWorkspace,
  desktop,
}: {
  /** The conversation on screen. It renders its own bands, so it never docks. */
  currentSid: string | undefined;
  currentWorkspace: Workspace | null;
  desktop: boolean;
}) {
  const t = useT(chatCopy);
  const active = useActiveTurns();
  const [expanded, setExpanded] = useState(false);

  // DEC-5: the exclusion is the dock's, not the store's. The selector stays honest and
  // returns everything active; only this bar has an opinion about what is already visible.
  const segments = useMemo(
    () => orderDocked(active.filter((e) => e.sid !== currentSid), restoredSince),
    [active, currentSid],
  );

  const typingTag = useTypingElsewhere(!desktop && segments.length > 0);
  const hidden = hidesForKeyboard(desktop, typingTag);
  const now = useNow(segments.length > 0 && !hidden);
  const nameOf = useDockLabels(segments);

  const open = useCallback(
    (segment: DockSegment) => {
      const ws = segment.ctx?.workspace;
      if (!ws) return;
      // ONE hash write. Splitting this into setWorkspace + setFragmentProjectSid leaves a
      // frame on the right workspace with no project, and every per-project fetch in that
      // frame addresses the agent root instead.
      setWorkspace(ws, segment.sid, segment.ctx?.project ?? ws.p ?? null);
      // Retires a `failed` chip. A `ready` one retires itself — opening the conversation
      // calls clearCompleted, which blanks the bands — but clearCompleted deliberately
      // PRESERVES error/errorDetail, since for a harness failure that banner is the only
      // surviving trace. So the acknowledgement is tracked instead of cleared.
      acknowledgeTurn(segment.sid);
      setExpanded(false);
    },
    [],
  );

  // Absent rather than empty: an empty bar reserving height would move the composer for a
  // state that has nothing to say.
  if (segments.length === 0 || hidden) return null;

  // Three layouts, one decision, in dock-segments.ts.
  const layout = dockLayout(segments.length, desktop);
  const { visible, hidden: overflow } =
    layout === "overflow"
      ? splitDock(segments, DESKTOP_CAP)
      : { visible: segments, hidden: [] as DockSegment[] };
  // The list the panel shows: on mobile it is everything, because the bar itself shows no
  // segments at all; on desktop it is only what did not fit.
  const panel = layout === "collapsed" ? segments : overflow;

  // What the collapsed box reports. The rail takes the colour of the conversation whose state
  // is being shown, so tapping through lands on the row the box was talking about.
  const summary = summaryState(segments);
  const SummaryIcon = summary ? ICONS[summary] : null;
  const summarySegment = summary ? segments.find((s) => s.state === summary) : undefined;
  const summaryLane = summarySegment
    ? railColor(laneColorFor(nameOf(summarySegment.sid) ?? undefined, summarySegment.sid))
    : undefined;

  const chip = (segment: DockSegment, full: boolean) => {
    const Icon = ICONS[segment.state];
    const elapsed = elapsedReadout(segment, now);
    const q = qualifier(segment, currentWorkspace);
    const record = nameOf(segment.sid);
    // The conversations' own hierarchy, from history-sidebar.tsx: the derived TITLE stays
    // primary and the member's ALIAS sits under it in smaller muted type. The chip used to
    // show `alias ?? title`, which threw away whichever one it did not pick — and the alias
    // is the name the member chose, so losing it was the worse half of that trade.
    const name = record?.title ?? null;
    const alias = record?.alias ?? null;
    const tags = record?.tags ?? [];
    // The SAME rule the tree spine and the Canvas timeline use, from the same function:
    // the conversation's first tag colour when it has one, else the golden-angle hash of
    // its id. Inline `style` rather than a class for the reason conversation-bursts.ts
    // gives -- the set is per-conversation and unbounded, so there is no class to write.
    //
    // It carries the IDENTITY axis only. State keeps the icon and the semantic tone on its
    // own label, because a chip has to answer two different questions at once: which
    // conversation is this, and what is it doing.
    // Through railColor, which keeps the HUE and fixes the lightness. laneColorFor holds
    // lightness at 55% for every hue, and measured against this bar's surface that puts a
    // hue-60 rail at 1.46:1 -- invisible. Identity is the hue; see RAIL_LUMINANCE.
    const lane = railColor(laneColorFor(record ?? undefined, segment.sid));
    return (
      <button
        key={segment.sid}
        type="button"
        onClick={() => open(segment)}
        // The harness's own sentence about the failure, untranslated because it is the
        // harness talking, not us. In the title rather than the chip: it runs to a
        // sentence and the segment is a strip.
        title={segment.errorDetail ?? undefined}
        // The alias when there is one: aria-label REPLACES the button's content for a screen
        // reader, so the name it carries has to be the one the member would use.
        aria-label={
          alias || name ? t.dock.open.replace("{chat}", alias || (name as string)) : t.dock[segment.state]
        }
        // A 4px rail along the segment's TOP edge, in the lane colour.
        //
        // Top rather than left: side by side with `flex-1`, the rails butt against each
        // other and form one contiguous multi-coloured strip across the bar, so the
        // boundary between two segments IS a colour change. A left rail only marked where
        // each chip began and left the bodies below it merging into one another.
        //
        // On EVERY segment including the first: the rail is the chip's identity marker, not
        // a divider between two chips, so the `last:border-r-0` reflex inverts here — a
        // leading chip with no colour would be the only one unidentifiable by hue.
        //
        // The colour stops at the rail. It does NOT go on the text: `laneColor` returns an
        // unbounded set of hashed hues, some of them pale, and text is the one thing that
        // has to stay readable regardless of which conversation drew which hue.
        style={{ borderTopColor: lane }}
        // items-start, and the container is items-stretch: a chip that grew a second line
        // makes every chip in the row as tall as it, so the bar's edge stays straight.
        className={`flex min-w-0 items-start gap-2 border-t-4 px-3 py-2 text-left text-xs text-fg transition-colors hover:bg-elevated ${
          full ? "w-full" : "flex-1"
        }`}
      >
        <Icon
          size={14}
          aria-hidden
          className={`mt-0.5 ${TONES[segment.state]} ${
            SPINS[segment.state] ? "shrink-0 animate-spin motion-reduce:animate-none" : "shrink-0"
          }`}
        />
        {/* ONE LINE PER KIND OF TEXT, and that is the correction this block carries. Packed
            into a row -- title, a dot, the state, then the qualifier -- four independent
            strings competed for one segment's width and truncated into each other, which read
            as scrambled rather than as abbreviated. In a column each one gets the segment's
            full width and truncates on its own terms.

            The state and its elapsed time share a line deliberately: they are one fact ("what
            it is doing, and for how long"), both short, and splitting them would add a line
            that says nothing new. */}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {name && <span className="w-full truncate font-medium">{name}</span>}
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <span className={`min-w-0 truncate ${TONES[segment.state]}`}>{t.dock[segment.state]}</span>
            {elapsed && (
              <span className="shrink-0 tabular-nums text-fg-muted">
                {t.dock[elapsed.key].replace("{t}", formatElapsed(elapsed.ms))}
              </span>
            )}
          </span>
          {q && (
            <span className="w-full truncate text-[11px] text-fg-muted">
              {t.dock[q.key].replace(`{${q.key === "inProject" ? "project" : "agent"}}`, q.value)}
            </span>
          )}
          {alias && <span className="w-full truncate text-[11px] text-fg-muted">{alias}</span>}
        </span>
        {/* Upward, because the bar is pinned to the bottom of the viewport and the default
            downward popover would open off-screen. */}
        {tags.length > 0 && <TagCluster tags={tags} open="up" />}
      </button>
    );
  };

  return (
    // Stacking declared ONCE, here. The bar is the last child of the chat column and sits
    // in document order below the composer, so it cannot cover it at any breakpoint and
    // needs no z-index race with RestartBanner.
    <div
      // `bg-surface` + the structural violet border, the same pair the shell's own chrome
      // uses. It replaces `border-t border-accent bg-accent-soft/60`: the accent tint is
      // the colour the palette reserves for "interactive", it fought every hue the rails
      // put on top of it, and it was not a surface meant to be read against — reported
      // directly by the maintainer.
      // And NO border of its own: the segments' rails already form a continuous edge along
      // the whole top of the bar, every one of them at 3:1 or better against this surface, so
      // a violet hairline above them would only dilute the signal they are carrying.
      //
      // `z-30` is load-bearing and was missing. The panel opens upward into exactly the band
      // where ChatView's composer floats at `z-20`, and document order does not settle it: the
      // composer carries an explicit z-index and this container carried none, so `auto` lost and
      // the expanded list rendered BEHIND the message box. Reported from the phone, where the
      // list is the only way to reach a conversation at all. Kept above the composer's layer --
      // see the cross-file assertion in turn-dock-layout.test.ts.
      className="relative z-30 shrink-0 bg-surface"
      role="region"
      aria-label={t.dock.label}
    >
      {/* The list, opening UPWARD. Shared by both openers: mobile's collapsed box, which puts
          everything here, and desktop's `+N`, which puts only what did not fit. Each row is a
          full-width chip, so a conversation gets the whole width for its four lines instead of
          a quarter of it. */}
      {expanded && panel.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-px max-h-64 overflow-y-auto border-t border-brand/30 bg-surface shadow-e">
          {panel.map((segment) => chip(segment, true))}
        </div>
      )}

      {layout === "collapsed" ? (
        // Mobile: ONE box. Not three segments, and not a sideways-scrolling strip of them --
        // both were tried and both truncated four competing strings into each other at phone
        // width. The box spends the whole width on a count plus the single state worth knowing
        // about, and the list it opens gives each conversation a full row.
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          // A real touch target: `min-h-11` is 44px, the size `h-11` already marks out elsewhere
          // in this codebase, and it replaces the `py-2 text-xs` inherited from the desktop
          // chips -- which made a ~32px strip that was, as reported, hard to hit with a thumb.
          // This is the ONLY control on the mobile bar, so it can afford the height.
          className="flex min-h-11 w-full items-center gap-3 border-t-4 px-4 py-3 text-left text-sm text-fg transition-colors hover:bg-elevated"
          // The rail keeps its meaning at the summary level: the colour of the conversation
          // whose state is being reported, so the box and the row it opens agree.
          style={{ borderTopColor: summaryLane }}
        >
          {SummaryIcon && (
            <SummaryIcon
              size={18}
              aria-hidden
              className={`shrink-0 ${TONES[summary as DockState]} ${
                SPINS[summary as DockState] ? "animate-spin motion-reduce:animate-none" : ""
              }`}
            />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {segments.length === 1
              ? t.dock.summaryOne
              : t.dock.summaryOther.replace("{n}", String(segments.length))}
          </span>
          <ChevronUp
            size={18}
            aria-hidden
            className={`shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex items-stretch">
          {visible.map((segment) => chip(segment, false))}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={t.dock.overflowAria}
              className="shrink-0 border-l border-brand/30 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-elevated"
            >
              {t.dock.overflow.replace("{n}", String(overflow.length))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
