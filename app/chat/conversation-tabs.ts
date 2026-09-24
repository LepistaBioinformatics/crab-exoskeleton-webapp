// WHAT THE MEMBER HAS OPEN, which is not the same list as what is running.
//
// `turn-dock.ts` enumerates `turn-store` — an active turn, and a finished one nobody
// has acknowledged yet. An entry leaves it the moment it is acknowledged, which is
// precisely the moment a member stops being able to find their way back. A tab is the
// other question: not "is this working" but "was I working in this".
//
// REACT-FREE, like `destination.ts` and `crumbs.ts` beside it and for the same reason:
// the rules here are the part that gets read wrong, and a rule that can only be checked
// by mounting a shell is a rule nobody checks.
//
// Not DOM-free, which those two are. The last pair of functions reads and writes
// `localStorage`, because where the strip is kept is part of what it IS -- the tab list
// deliberately does NOT go in the fragment, and saying so next to the rules is worth
// more than a second module for two functions. The fragment describes ONE location and
// is the thing members paste to each other; a URL carrying the whole strip would hand
// somebody your working set, including the tabs from a project they are not in.

/** Where a tab points. The WHOLE location, never just the conversation. */
export interface TabRef {
  t: string;
  s: string;
  r: string;
  /** The project, or null for the agent's own workspace. */
  p: string | null;
  sid: string;
}

export interface Tab extends TabRef {
  /**
   * A preview tab is the one a single click opens, and the next single click
   * REPLACES it. At most one exists.
   *
   * It is what makes clicking through a history list cost nothing: nine glances
   * leave one tab rather than nine. An editor draws it in italic for the same
   * reason — it is visibly provisional.
   */
  preview: boolean;
  /** What the strip shows. Resolved by the shell; the key is the ref. */
  title: string;
}

/**
 * The identity of a tab, and it is the TUPLE.
 *
 * The request names the case this exists for: coming back to a conversation "from
 * another project". Keyed on `sid` alone, activating a tab would land the member on
 * the right conversation in the wrong project — which is worse than not going, because
 * every path the screen then resolves (files, memory, the graph) would address the
 * wrong workspace directory.
 */
export function tabKey(ref: TabRef): string {
  return [ref.t, ref.s, ref.r, ref.p ?? "", ref.sid].join("\u0000");
}

export function sameTab(a: TabRef, b: TabRef): boolean {
  return tabKey(a) === tabKey(b);
}

/**
 * Open `ref` as a preview, replacing whatever preview was there.
 *
 * An already-open tab is not reopened: it keeps its position and its pinned state, and
 * the caller activates it. Clicking a pinned tab must not demote it to a preview —
 * that would throw away the member's own decision to keep it.
 */
export function openPreview(tabs: readonly Tab[], ref: TabRef, title: string): Tab[] {
  const existing = tabs.findIndex((x) => sameTab(x, ref));
  if (existing >= 0) return [...tabs];

  const next = tabs.filter((x) => !x.preview);
  const at = tabs.findIndex((x) => x.preview);
  const tab: Tab = { ...ref, preview: true, title };
  // IN THE PREVIEW'S OWN SLOT, not at the end. A preview that jumped to the right of
  // the strip on every click would make the one moving thing on screen the thing the
  // member is looking at.
  if (at >= 0) next.splice(at, 0, tab);
  else next.push(tab);
  return next;
}

/**
 * Keep it. A double click, or a message sent into it.
 *
 * IDEMPOTENT, and that is load-bearing rather than tidy: the composer calls this on
 * every send, so a second message must not open a second tab. It also PINS a tab that
 * is not open yet, which is the new-conversation case — a conversation has no `sid`
 * until its first turn exists, so its first appearance in the strip is at the moment
 * it is pinned.
 */
export function pin(tabs: readonly Tab[], ref: TabRef, title: string): Tab[] {
  const at = tabs.findIndex((x) => sameTab(x, ref));
  if (at < 0) return [...tabs, { ...ref, preview: false, title }];
  if (!tabs[at].preview) return [...tabs];
  const next = [...tabs];
  next[at] = { ...next[at], preview: false };
  return next;
}

/** Drop one. The strip only; what to activate afterwards is `nextAfterClose`. */
export function close(tabs: readonly Tab[], ref: TabRef): Tab[] {
  return tabs.filter((x) => !sameTab(x, ref));
}

/**
 * Which tab to activate when the ACTIVE one is closed.
 *
 * The neighbour to the RIGHT, falling back to the left, which is what an editor does
 * and what a member's hand expects after closing several in a row.
 *
 * Null means there is nothing left, and the shell stays where it is: the member closed
 * a tab, they did not ask to go anywhere. Null is also the answer when the tab being
 * closed is not the active one — nothing should move at all.
 */
export function nextAfterClose(
  tabs: readonly Tab[],
  closing: TabRef,
  active: TabRef | null,
): TabRef | null {
  if (!active || !sameTab(closing, active)) return null;
  const at = tabs.findIndex((x) => sameTab(x, closing));
  if (at < 0) return null;
  return tabs[at + 1] ?? tabs[at - 1] ?? null;
}

/** Rename a tab in place — the shell resolves titles as conversations load. */
export function retitle(tabs: readonly Tab[], ref: TabRef, title: string): Tab[] {
  const at = tabs.findIndex((x) => sameTab(x, ref));
  if (at < 0 || tabs[at].title === title) return [...tabs];
  const next = [...tabs];
  next[at] = { ...next[at], title };
  return next;
}

const KEY = "chat-open-tabs";

/**
 * Read the strip back.
 *
 * EVERY ENTRY IS CHECKED, not cast. `localStorage` is text a member can edit, and this
 * shell has already paid once for trusting text it did not check — `asDestination`'s
 * comment records a hand-edited fragment reaching a panel that called `.label()` on
 * `undefined`. A malformed entry is dropped and the rest survive: one bad row must not
 * cost the member their whole workbench.
 *
 * Throws nothing. A private window denies `localStorage` on both ends, and a shell that
 * failed to render because it could not read its tab strip would be the smaller feature
 * taking down the larger one.
 */
export function readTabs(): Tab[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Tab[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const tab = asTab(item);
    if (!tab) continue;
    // A duplicate would give the member two tabs one close could not clear.
    const key = tabKey(tab);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tab);
  }
  // AT MOST ONE PREVIEW, whatever was stored. The invariant is the feature's, so it is
  // re-established on the way in rather than assumed of text from disk.
  let preview = false;
  return out.map((x) => {
    if (!x.preview) return x;
    if (preview) return { ...x, preview: false };
    preview = true;
    return x;
  });
}

function asTab(value: unknown): Tab | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" && v[k] ? (v[k] as string) : null);
  const t = str("t");
  const s = str("s");
  const r = str("r");
  const sid = str("sid");
  if (!t || !s || !r || !sid) return null;
  return {
    t,
    s,
    r,
    p: typeof v.p === "string" && v.p ? v.p : null,
    sid,
    preview: v.preview === true,
    title: typeof v.title === "string" ? v.title : "",
  };
}

const ACTIVE_KEY = "chat-active-tab";

/**
 * Which tab the member was last in, so entering the workspace lands there.
 *
 * A SECOND KEY RATHER THAN A FIELD ON THE LIST, because the list's shape is already
 * validated entry by entry and a payload change would have to re-validate the pair. It
 * also degrades independently: a readable list with an unreadable pointer restores the
 * strip and picks the last tab, which is better than restoring neither.
 *
 * Null when there is none, or when what was stored names a tab that is no longer open
 * -- a pointer at a closed tab is how a member would be sent to an empty transcript.
 */
export function readActiveTab(tabs: readonly Tab[]): TabRef | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  return tabs.find((x) => tabKey(x) === raw) ?? null;
}

export function writeActiveTab(ref: TabRef | null): void {
  try {
    if (ref) localStorage.setItem(ACTIVE_KEY, tabKey(ref));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Same as the strip: the memory is lost, the session is not.
  }
}

/**
 * Where to land when the workspace opens with no conversation named.
 *
 * The remembered one, or the LAST in the strip when nothing was remembered -- the
 * strip is in open order, so the last is the most recently opened and the best guess
 * available.
 *
 * Null means the landing screen, which is the right answer for a member with no tabs.
 */
export function resumeTab(tabs: readonly Tab[], remembered: TabRef | null): TabRef | null {
  if (remembered) return remembered;
  return tabs.length > 0 ? tabs[tabs.length - 1] : null;
}

/** Best effort. A denied write costs the strip its memory, never the session. */
export function writeTabs(tabs: readonly Tab[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // Private window, or the quota. The strip still works for this tab's lifetime.
  }
}
