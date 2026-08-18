// The dock's arithmetic, kept out of the component so it can be tested without a DOM.
//
// Same split as split-boxes.ts and sidebar-tree.ts: what to show, in what order, and how
// long it has been going are decisions with edge cases; rendering them is not.

import type { DockedTurn, DockState } from "@/app/chat/turn-store";
import { SILENCE_GRACE_MS } from "@/app/chat/turn-store";
import type { Workspace } from "@/app/chat/fragment";

export interface DockSegment extends DockedTurn {
  /** The server's start time for a conversation restored after a reload, else null. */
  since: number | null;
}

/**
 * Oldest first.
 *
 * Restored conversations come first, ordered by the server's timestamp: they are
 * genuinely older than anything started in this page-load, and the proxy already sorted
 * them so the order cannot flicker between probes. In-session entries keep the `turns`
 * Map's insertion order, which is the order they were first touched.
 */
export function orderDocked(
  entries: DockedTurn[],
  sinceOf: (sid: string) => number | null,
): DockSegment[] {
  const segments = entries.map((e) => ({ ...e, since: sinceOf(e.sid) }));
  const restored = segments
    .filter((s) => s.since !== null)
    .sort((a, b) => (a.since as number) - (b.since as number));
  const inSession = segments.filter((s) => s.since === null);
  return [...restored, ...inSession];
}

/**
 * How many segments fit side by side before the bar stops being readable.
 *
 * Splitting without a floor is the whole problem: at five entries each segment is too narrow
 * for a conversation title, and five is a realistic count for a feature whose audience is
 * people running several turns at once.
 *
 * Desktop-only, and no longer takes a breakpoint. Mobile does not divide the bar at all — it
 * collapses to one box (see dockLayout), so a mobile "cap" would be a number nothing reads.
 */
export const DESKTOP_CAP = 4;

/**
 * How the bar arranges itself.
 *
 * - `fit` (desktop, up to the cap): the segments divide the bar.
 * - `overflow` (desktop, past it): the extras go behind a `+N` control.
 * - `collapsed` (mobile, ALWAYS): one box carrying a count and the state worth knowing about,
 *   which expands upward into the full list.
 *
 * Mobile does not divide the bar at any count, and that is the correction this type carries.
 * Two earlier attempts failed on the same thing: a phone-width bar cut into segments -- three
 * of them, or a sideways-scrolling strip of them -- gives each one so little width that the
 * title, the state, the qualifier and the alias truncate into each other. One box has the whole
 * width for its summary, and the list it opens gives each conversation a full row.
 */
export type DockLayout = "fit" | "overflow" | "collapsed";

export function dockLayout(count: number, desktop: boolean): DockLayout {
  if (!desktop) return "collapsed";
  return count <= DESKTOP_CAP ? "fit" : "overflow";
}

// Which state the collapsed box reports, most newsworthy first.
//
// `failed` outranks everything because it is the only one asking for something. `ready` comes
// next: it is the news the whole feature exists to deliver, and a mobile member who cannot see
// it while collapsed has lost the notification. `working` is last -- it is the default and the
// least informative.
const SUMMARY_PRIORITY: DockState[] = ["failed", "ready", "reconnecting", "unsent", "working"];

/** The one state a collapsed box shows for a whole list, or null when the list is empty. */
export function summaryState(segments: { state: DockState }[]): DockState | null {
  for (const state of SUMMARY_PRIORITY) {
    if (segments.some((s) => s.state === state)) return state;
  }
  return null;
}

/** The segments that render, and the ones behind the `+N` control. */
export function splitDock<T>(segments: T[], cap: number): { visible: T[]; hidden: T[] } {
  if (segments.length <= cap) return { visible: segments, hidden: [] };
  return { visible: segments.slice(0, cap), hidden: segments.slice(cap) };
}

export type ElapsedReadout = { key: "runningFor" | "quietFor"; ms: number };

/**
 * Which clock a chip shows, if any. TWO clocks, and they do not mean the same thing.
 *
 * A restored conversation only knows the total the server reports: `lastEventAt` is 0
 * because a resumed turn goes through neither `runTurn` nor `consumeStream`, and
 * `recoveringSince` is stamped by `recover()` at resume time — reading it would show a
 * nine-minute turn as fresh. So restored chips say "running for".
 *
 * An in-session chip reuses what the assistant band already shows: time since the last
 * event, past the same grace window, so a chip and its band can never disagree. Before
 * that window the number would be noise, appearing and vanishing before it could be read.
 *
 * An `unsent` chip has no clock at all — nothing is running, so there is nothing to time.
 */
export function elapsedReadout(
  segment: Pick<DockSegment, "state" | "since" | "lastEventAt">,
  now: number,
): ElapsedReadout | null {
  if (segment.state === "unsent") return null;
  if (segment.since !== null) return { key: "runningFor", ms: Math.max(0, now - segment.since) };
  if (segment.lastEventAt <= 0) return null;
  const quiet = now - segment.lastEventAt;
  if (quiet < SILENCE_GRACE_MS) return null;
  return { key: "quietFor", ms: quiet };
}

export type Qualifier = { key: "inAgent" | "inProject"; value: string };

/**
 * The "in <agent>" / "in <project>" note, when the docked conversation does not belong to
 * what is on screen. Without it a bare chat title is ambiguous across agents — the same
 * title can exist under three of them.
 *
 * The project is the more specific answer and wins: naming the agent for a conversation
 * that lives in one of its projects would send the member to the wrong workspace directory
 * in their head.
 */
export function qualifier(
  segment: Pick<DockSegment, "ctx">,
  current: Workspace | null,
): Qualifier | null {
  const ws = segment.ctx?.workspace;
  if (!ws) return null;
  const project = segment.ctx?.project ?? ws.p ?? null;
  const currentProject = current?.p ?? null;
  const sameWorkspace = !!current && current.t === ws.t && current.s === ws.s && current.r === ws.r;
  if (project !== currentProject) {
    if (project) return { key: "inProject", value: project };
    // The docked conversation is at the AGENT ROOT while the member is inside a project.
    // Comparing only "does the segment have a project" left this case unqualified, so a
    // root chat read as if it belonged to the project on screen — and a project is a
    // picoclaw agent of its own, with its own workspace directory. Naming the agent is the
    // honest answer: it is the workspace this conversation actually lives in.
    return { key: "inAgent", value: ws.r };
  }
  if (!sameWorkspace) return { key: "inAgent", value: ws.r };
  return null;
}

/**
 * Should the dock get out of the way?
 *
 * On mobile the soft keyboard shrinks the layout viewport (`interactiveWidget:
 * "resizes-content"` in app/layout.tsx), so the dock is not COVERED — it competes for the
 * little height that is left, at the exact moment the member is typing into a different
 * conversation. Focus in a text field is the honest signal for that; there is no keyboard
 * API that reports it.
 *
 * Desktop never hides: the bar costs one strip of a wide screen.
 */
export function hidesForKeyboard(desktop: boolean, activeTag: string | null): boolean {
  if (desktop) return false;
  if (!activeTag) return false;
  return activeTag === "textarea" || activeTag === "input";
}

/** Every state, so a `switch` over them cannot silently miss one. */
export const DOCK_STATES: DockState[] = ["unsent", "working", "reconnecting", "ready", "failed"];

// ---------------------------------------------------------------------------
// Rail colour
// ---------------------------------------------------------------------------

// The luminance every rail is normalized to, and the two numbers that pin it.
//
// `laneColorFor` returns hsl(h 65% 55%) -- a FIXED lightness across the whole hue wheel,
// whose relative luminance therefore swings enormously. Measured against the bar's surfaces:
// a hue-60 rail scores 1.46:1 on light (#f7f9fa), and every hue from 45 to 195 stays under
// 2.5:1, so roughly half of all conversations would draw a rail that reads as absent. Dark
// (#1b1f23) fails the other end of the wheel -- hue 240 at 2.35:1.
//
// Solving for a single luminance that clears BOTH surfaces leaves a narrow but real band:
//   light needs L <= 0.2662 for 3:1      dark needs L >= 0.2497 for 4.5:1
// 0.258 sits inside it, which is why one value serves both themes and no per-theme override
// (or CSS-variable dance) is needed.
//
// The side effect is the useful part: with luminance held constant, rails differ from one
// another by HUE alone -- which is exactly what the bar is being asked to communicate.
const RAIL_LUMINANCE = 0.258;

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Hue and saturation of whatever laneColorFor produced: its own hsl(), or a hex tag colour. */
function hueAndSaturation(color: string): { h: number; s: number } | null {
  const hsl = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(color);
  if (hsl) return { h: Number(hsl[1]), s: Number(hsl[2]) };

  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return null;
  const n = parseInt(hex[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0 };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return { h: (h + 360) % 360, s: s * 100 };
}

/**
 * A conversation's colour, re-lightened so its rail is visible on either theme.
 *
 * HUE IS PRESERVED, and that is what carries identity: a chip and its dot in the tree stay in
 * the same colour family, and `laneColorFor` remains the single source of which colour a
 * conversation owns. Only lightness moves, and only because the fixed 55% that function uses
 * is unreadable across half the wheel on a light surface (see RAIL_LUMINANCE).
 *
 * A colour it cannot parse comes back untouched -- a rail of unknown contrast beats no rail.
 */
export function railColor(base: string): string {
  const parsed = hueAndSaturation(base);
  if (!parsed) return base;
  const { h, s } = parsed;
  // A grey has no hue to preserve, so there is nothing to re-lighten in its favour.
  if (s === 0) return base;

  // A scan, not a solve: luminance is monotonic in lightness at fixed hue/saturation, but the
  // inverse has no closed form worth writing for 99 candidates.
  let best = 55;
  let bestGap = Infinity;
  for (let l = 1; l <= 99; l++) {
    const [r, g, b] = hslToRgb(h, s, l);
    const gap = Math.abs(relativeLuminance(r, g, b) - RAIL_LUMINANCE);
    if (gap < bestGap) {
      bestGap = gap;
      best = l;
    }
  }
  return `hsl(${h.toFixed(1)} ${s.toFixed(0)}% ${best}%)`;
}
