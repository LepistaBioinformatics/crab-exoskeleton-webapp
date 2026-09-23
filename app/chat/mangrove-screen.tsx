"use client";

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import {
  Check,
  Inbox,
  Rss,
  Send,
  ShieldQuestion,
  SquarePen,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { Workspace } from "./fragment";
import DestinationScreen from "./destination-screen";
import MangrovePost from "./mangrove-post";
import MangrovePeople from "./mangrove-people";
import MangroveCompose from "./mangrove-compose";
import MangroveShareAction from "./mangrove-share-action";
import { actorKind, actorLabel, audienceSummary, audienceLabel, isMine } from "./mangrove-actors";
import { useMangrove } from "./use-mangrove";
import {
  admit,
  decide,
  newestFirst,
  readIdentity,
  revoke,
  type MangroveIdentity,
  type MangroveReading,
} from "@/lib/mangrove";
import { subscribeToShareRequests, takePendingShare, type MangroveShare } from "./mangrove-share-bus";
import type { MangroveReference } from "@/lib/chatReference";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The member's window onto the mangrove.
//
// THREE READINGS, AND THE THIRD IS ABSENT RATHER THAN EMPTY for somebody who
// governs nothing. An affordance that renders and then refuses teaches the
// wrong model of who decides — so the tab does not show a "Pending decisions"
// button to a member who cannot make one. Whether they can is a mycelium role,
// which only the proxy can resolve, which is why /v1/mangrove/capabilities exists.
//
// COMPOSE IS A FLAG BESIDE PEOPLE, not a fourth reading. A reading is a
// question put to the timeline, and opening a form to write something is not
// one -- making it a member of the union would refetch the timeline to render a
// blank form. Both flags are read through ONE derived `onTimeline`, so no
// section can be left rendering under the form because a guard was missed.
//
// AND A SHARE ARRIVES FROM OUTSIDE THIS SCREEN. The files tab and the knowledge
// graph both offer "share this in the mangrove", and both live in the pane BESIDE the
// conversation while this screen replaces the centre — so the request travels over
// `mangrove-share-bus` and lands here, opening the composer with the thing already
// attached. It has to be drained two ways: the slot for the share that arrived before
// this screen existed (which is every FIRST share), the subscription for one made while
// it is already open.
//
// A READING IS ORDERED HERE, MOST RECENT FIRST, and the newest few are marked out.
// `claims` arrives as a reduction keyed by (cell, author), so its order is whichever
// key the proxy saw first -- near enough to chronological to look deliberate and not
// near enough to be. `newestFirst` makes it a decision. What is marked out is the top
// of THIS reading, not of the mangrove: three cards, or all of them when there are
// fewer than three, which is a list too short for "the recent ones" to mean anything.
//
// WHO WROTE IT AND WHO GOT IT ARE READ OFF THE MEMBER'S OWN IDS. `readIdentity`
// returns this member's two actors, and matching an author against them is the only
// way this app can say "you" or "your agent" -- nothing else in the mangrove maps an
// id to a person. It is asked ONCE per workspace rather than folded into
// `useMangrove`'s pair, which would re-ask it on every change of reading for an
// answer that does not depend on one. See `mangrove-actors`.
//
// AND "NOTHING YET" IS NOT "IT IS DOWN". An empty reading is a normal state and
// renders as prose; an unreachable service renders as an error with a retry.
// Collapsing them would mean a member who has simply not been shared anything
// is told something is broken.

/** How many of a reading's newest cards are marked out. */
const RECENT = 3;

// A RAIL ENTRY, which is a row and not a chip. It reads left to right -- glyph,
// label, then whatever count belongs to it -- and fills the rail's width so the
// current one is a band rather than a word with a box around it.
//
// `w-full` matters on the narrow layout too, where the rail is a horizontal
// scroller: `shrink-0` there keeps a label from being squeezed to its first letter
// rather than scrolling, which is what a flex row does to text by default.
const tab = cva(
  "flex w-full shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
  {
    variants: {
      current: {
        true: "bg-elevated text-fg",
        false: "text-fg-muted hover:bg-elevated/60 hover:text-fg",
      },
    },
  },
);

/** A published timestamp as a number, and 0 for one that will not parse. */
function published(iso: string): number {
  return Date.parse(iso) || 0;
}

/** Where the last visit to this screen got to, per workspace. */
function seenKey(workspace: Workspace): string {
  return `mangrove-seen:${workspace.t}:${workspace.s}:${workspace.p ?? ""}`;
}

export default function MangroveScreen({
  workspace,
  projectName,
  subscriptionName,
  onReference,
}: {
  workspace: Workspace;
  /**
   * What this subscription is called. The shell has already resolved it for its
   * own header, so it is passed rather than looked up again -- a recipient that
   * is the whole subscription is on most cards in a reading, and a fetch per
   * card for a string the app is holding is the cost the facepile avoids.
   */
  subscriptionName?: string | null;
  /**
   * The name of the project `workspace.p` names, for the cards that have to say where
   * a file or a fragment will land. The screen itself never resolves it: the project
   * list belongs to the shell, and a second read of it here could be a beat behind the
   * one the breadcrumb is showing.
   */
  projectName?: string | null;
  /**
   * Puts a memory in the composer's context slot, the same slot the graph panel fills.
   * Absent where there is no conversation to reference into.
   */
  onReference?: (ref: MangroveReference) => void;
}) {
  const t = useT(chatCopy);
  const [reading, setReading] = useState<MangroveReading>("received");
  // People is not a reading -- it does not come from the timeline and must not
  // refetch it. Kept as its own flag so switching to it costs nothing.
  const [onPeople, setOnPeople] = useState(false);
  const [onCompose, setOnCompose] = useState(false);
  // What the last publish did: delivered, or sent for somebody's decision. The
  // two are not the same answer -- a cross-scope publication appears in no
  // reading at all until whoever governs that scope accepts it.
  const [publishedPending, setPublishedPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // What the member arrived here to share, if they arrived from somewhere else.
  const [attachment, setAttachment] = useState<MangroveShare | null>(null);
  // The member's own two actor ids. Null until they arrive, and the labels degrade to
  // the impersonal form rather than guessing -- see `mangrove-actors`.
  const [identity, setIdentity] = useState<MangroveIdentity | null>(null);
  // WHERE THE LAST VISIT GOT TO, and how much has arrived since. Read in an effect
  // rather than in the initial state: this component renders on the server too, and a
  // first paint that depended on one browser's storage is a hydration mismatch --
  // the rule `sidebar-destinations` already follows. Null means "not known yet",
  // which is NOT zero: zero would make everything on the timeline new.
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const [newSince, setNewSince] = useState(0);
  const { timeline, caps, error, loading, reload, off } = useMangrove(workspace, reading);
  const onTimeline = !onPeople && !onCompose;

  // ABOVE the early return below, because hooks are. Both halves open the composer, so
  // a share made from the files pane while this screen is already on it behaves exactly
  // like one that put the member here.
  useEffect(() => {
    const take = (share: MangroveShare) => {
      setAttachment(share);
      setOnPeople(false);
      setPublishedPending(null);
      setOnCompose(true);
    };
    const waiting = takePendingShare();
    if (waiting) take(waiting);
    return subscribeToShareRequests(take);
  }, []);

  // ALSO above the early return. A failure is swallowed on purpose: the tab already
  // reports an unreachable mangrove, and a second copy of that message would say
  // nothing new -- what is lost is the word "you" on a byline, which the impersonal
  // form covers.
  useEffect(() => {
    let live = true;
    readIdentity(workspace).then(
      (id) => {
        if (live) setIdentity(id);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [workspace]);

  useEffect(() => {
    try {
      setSeenAt(Number(localStorage.getItem(seenKey(workspace))) || 0);
    } catch {
      // Storage unavailable. Nothing is new, which is the quiet answer -- a badge
      // over a number this browser cannot remember would be wrong on every visit.
      setSeenAt(0);
    }
  }, [workspace]);

  // WHAT ARRIVED SINCE, COUNTED ONCE PER VISIT AND NOT PER RENDER.
  //
  // The count is held in state rather than derived, because `claims` belongs to
  // WHICHEVER reading is open: on "Published" they are the member's own posts, and a
  // number derived from them would answer a different question under the same badge.
  // Computed while the feed is what is loaded, and then simply kept.
  //
  // THE WATERMARK IS WRITTEN HERE AND `seenAt` IS NOT UPDATED WITH IT. That is what
  // makes the badge survive the visit that earned it -- the member sees "3 new" beside
  // the three cards `recent` already marks out, and finds it gone next time rather
  // than a beat later.
  //
  // OWN POSTS DO NOT COUNT, and the count stays 0 until identity arrives: without the
  // member's own actor ids, `isMine` is false for everything and their own publication
  // would be announced back to them as news.
  useEffect(() => {
    if (reading !== "received" || !timeline || seenAt === null) return;
    const arrived = timeline.claims ?? [];
    if (identity) {
      setNewSince(
        arrived.filter(
          (c) => !isMine(c.author, identity) && !c.deleted && published(c.published) > seenAt,
        ).length,
      );
    }
    const newest = Math.max(0, ...arrived.map((c) => published(c.published)));
    if (!newest) return;
    try {
      localStorage.setItem(seenKey(workspace), String(newest));
    } catch {
      // Storage unavailable -- the badge just won't outlive the tab.
    }
  }, [timeline, reading, seenAt, identity, workspace]);

  // The operator never enabled the mangrove. Render NOTHING — not an error, not an
  // empty state with a dead button.
  if (off) return null;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch {
      setActionError(t.mangrove.actionFailed);
    } finally {
      setBusy(null);
    }
  };

  // ONE SWITCH FOR FIVE DESTINATIONS, so a destination cannot be reached with another
  // one's flag left set. Every entry used to carry its own three setters and its own
  // `setPublishedPending(null)`, which is a rule restated five times.
  const select = (to: MangroveReading | "people" | "compose") => {
    // The notice is about the publish that just happened; leaving it pinned over a
    // reading the member navigated to would make it look like a property of that one.
    setPublishedPending(null);
    setOnPeople(to === "people");
    setOnCompose(to === "compose");
    if (to !== "people" && to !== "compose") setReading(to);
  };

  // THE ORDER IS THE SCREEN'S ARGUMENT. Read first, then write -- "Share something" is
  // the second entry and not the last, because it is the only thing here a member
  // comes to this screen to DO, and at the end of the rail it read as an afterthought
  // beside the directory.
  //
  // Pending is ABSENT, not disabled, for somebody with no governing role: an
  // affordance that renders and then refuses teaches the wrong model of who decides.
  const destinations: {
    key: string;
    label: string;
    icon: React.ReactNode;
    current: boolean;
    /** How many arrived since the last visit. Only the feed has one. */
    badge?: number;
    go: () => void;
  }[] = [
    {
      key: "received",
      label: t.mangrove.received,
      icon: <Rss size={16} aria-hidden />,
      current: onTimeline && reading === "received",
      badge: newSince,
      go: () => select("received"),
    },
    {
      key: "compose",
      label: t.mangrove.compose,
      icon: <SquarePen size={16} aria-hidden />,
      current: onCompose,
      go: () => select("compose"),
    },
    {
      key: "published",
      label: t.mangrove.published,
      icon: <Send size={16} aria-hidden />,
      current: onTimeline && reading === "published",
      go: () => select("published"),
    },
    ...(caps?.governs
      ? [
          {
            key: "pending",
            label: t.mangrove.pending,
            icon: <ShieldQuestion size={16} aria-hidden />,
            current: onTimeline && reading === "pending",
            go: () => select("pending"),
          },
        ]
      : []),
    {
      key: "people",
      label: t.mangrove.people,
      icon: <Users size={16} aria-hidden />,
      current: onPeople,
      go: () => select("people"),
    },
  ];

  // Sorted, not merely rendered in the order it arrived. Held and pending are left
  // as the proxy answered them: they are decision queues, and oldest-first is the
  // order a queue is worked.
  const claims = newestFirst(timeline?.claims ?? []);
  const held = timeline?.held ?? [];
  const pending = timeline?.pending ?? [];
  const nothing = !loading && !error && claims.length === 0 && held.length === 0 && pending.length === 0;

  return (
    // ONE COLUMN, AND A NARROW ONE -- a feed.
    //
    // This spent one revision as two columns at 4xl, on the argument that a card is a
    // preview and so does not need the reading measure. The argument was about the
    // wrong thing: what a grid costs is not legibility, it is that a reader has to
    // decide which of two cards to read next on every row, and taking that decision
    // away is the whole job a feed does. Every product doing this -- X, LinkedIn,
    // Mastodon -- is one column, and none of them is wide.
    //
    // `feed` is NARROWER than `reading` (xl against 2xl), which is the part that is
    // not obvious. A reading column is sized so the eye finds the start of the next
    // line; a feed is scanned an object at a time, and past about 600px a card stops
    // looking like an object and starts looking like a band across the page. It is
    // also still the answer to "os cards podem ser mais estreitos", which 2xl was not.
    //
    // THE FRAME NARROWS, NOT THE CHILDREN. This was a max-w-3xl div inside the 6xl
    // frame, which put the column hard against the left of a pane half again as
    // wide -- "pushed to the left", which is what it was. Centring only the div
    // would have moved the misalignment rather than fixed it: the heading is the
    // frame's, so it would have stayed at the far left with the prose 200px in from
    // it. Narrowing the frame centres the heading and the reading on one axis.
    <DestinationScreen title={t.mangrove.title} width="feed">
      {/* A WHOLE VIEWPORT OF PADDING UNDER IT. Without it the last memory sits
          against the bottom edge, so reading it means scrolling it to the very end
          of the scroll range and then reading at the rim of the screen. The padding
          is part of the scrollable area, so the last card comes to rest wherever the
          reader stops, rather than only at the very bottom of the range. */}
      <div className="pb-[100vh]">
          <p className="text-sm text-fg-muted">{t.mangrove.hint}</p>

        {/* THE RAIL, AND THE FEED BESIDE IT.
            This was a row of chips above the content, which is what a screen with
            three tabs can afford. At five it is a line of words the eye has to read
            through to find the one it wants, and the one it wants is usually the
            same one. Down the side they are a fixed set of places with a fixed
            order, and the glyph is what makes a destination recognisable without
            reading -- which a row of text-only chips never was.

            NARROW SCREENS KEEP THE ROW, as a scroller. A 180px rail beside a 320px
            column leaves neither usable, and `shrink-0` on the entry is what makes
            the overflow scroll instead of squeezing five labels into their first
            letters. */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6">
          {/* THE RAIL STAYS, the feed moves. Scrolling a long feed used to carry the
              destinations off the top with it, so changing where you were meant
              scrolling back up to somewhere you were not reading.

              `sm:self-start` is half of it and the half that is easy to lose: a
              flex row stretches its items, so a stretched rail is exactly as tall
              as the feed beside it and `sticky` has nothing to travel within. It
              would look like the property simply did nothing.

              No background under it, which is the other thing worth knowing. The
              rail is a COLUMN of the row rather than a layer over it, so the feed
              passes beside it and never behind it -- and `sm:`, because on a
              narrow screen this is a horizontal scroller above the content, where
              the feed WOULD pass under it and it would need one. */}
          <nav
            aria-label={t.mangrove.title}
            className="flex gap-1 overflow-x-auto pb-1 sm:sticky sm:top-8 sm:w-48 sm:shrink-0 sm:flex-col sm:gap-0.5 sm:self-start sm:overflow-x-visible sm:pb-0"
          >
            {destinations.map((d) => (
              <button
                key={d.key}
                type="button"
                className={tab({ current: d.current })}
                aria-current={d.current ? "page" : undefined}
                // The count is a glyph to the eye and a fact to a screen reader, so
                // the sentence lives on the control rather than beside the numeral.
                aria-label={
                  d.badge
                    ? `${d.label} — ${
                        d.badge === 1
                          ? t.mangrove.newSinceOne
                          : t.mangrove.newSince.replace("{count}", String(d.badge))
                      }`
                    : undefined
                }
                onClick={d.go}
              >
                {d.icon}
                <span className="min-w-0 flex-1 truncate text-left">{d.label}</span>
                {/* ABSENT AT ZERO, not a dimmed nought: a badge that is always there
                    stops being something a member looks at. */}
                {d.badge ? (
                  <span
                    aria-hidden
                    className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-accent-fg"
                  >
                    {d.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* THE FEED'S OWN COLUMN, and the width that makes it one. The frame is
              wide enough for the rail AND this; the cap is here so what the member
              reads stays the narrow single column a feed is, whatever is beside it. */}
          <div className="min-w-0 max-w-xl flex-1">
        {onPeople && (
          <div className="mt-6">
            <MangrovePeople workspace={workspace} />
          </div>
        )}

        {onCompose && (
          <div className="mt-6">
            <MangroveCompose
              workspace={workspace}
              caps={caps}
              attachment={attachment}
              onRemoveAttachment={() => setAttachment(null)}
              onPublished={(pending) => {
                setPublishedPending(pending);
                setOnCompose(false);
                // Dropped on the way out, or the next thing the member writes would be
                // sent as the file they just shared.
                setAttachment(null);
                // What was just written belongs to "Published", so that is where
                // the member is left.
                //
                // ONE FETCH, NOT TWO. `reload` is bound to the reading that is
                // current now, so calling it AND changing the reading starts a
                // fetch for each and lets the slower one win -- which is a member
                // landing on "Published" and reading their received list. The
                // reading change refetches by itself; the explicit reload is only
                // for the case where there is no change to react to.
                if (reading === "published") void reload();
                else setReading("published");
              }}
            />
          </div>
        )}

        {onTimeline && publishedPending !== null && (
          <Alert className="mt-4">
            {publishedPending ? t.mangrove.publishedPending : t.mangrove.publishedOk}
          </Alert>
        )}

        {onTimeline && actionError && (
          <Alert severity="error" className="mt-4">
            {actionError}
          </Alert>
        )}

        {/* Unreachable is its own answer, with a way to try again. */}
        {onTimeline && error && !off && (
          <Alert severity="error" className="mt-4">
            {error === "mangrove_unreachable" || error === "connectivity"
              ? t.mangrove.unreachable
              : t.mangrove.loadFailed}{" "}
            <Button variant="text" size="sm" onClick={() => void reload()}>
              {t.mangrove.retry}
            </Button>
          </Alert>
        )}

        {onTimeline && nothing && (
          <div className="mt-8 text-sm text-fg-muted">
            <p>{t.mangrove.none}</p>
            <p className="mt-1">{t.mangrove.noneHint}</p>
          </div>
        )}

        {/* Held: addressed at this member, NOT yet in their agent's memory. */}
        {onTimeline && held.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
              <Inbox size={16} aria-hidden /> {t.mangrove.heldTitle}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">{t.mangrove.heldHint}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {held.map((h) => (
                <MangrovePost
                  key={h.activityId}
                  action="held"
                  workspace={workspace}
                  projectName={projectName}
                  object={h.object}
                  subscriptionName={subscriptionName}
                  author={actorLabel(h.from, identity, t)}
                  authorKind={actorKind(h.from, identity)}
                  title={h.object.cell}
                  subtitle={t.mangrove.sheetFrom
                    .replace("{who}", actorLabel(h.from, identity, t))
                    .replace("{cell}", h.object.cell)}
                  onReference={onReference}
                  actions={
                    <Button
                      size="sm"
                      disabled={busy === h.activityId}
                      onClick={() => void run(h.activityId, () => admit(workspace, h.activityId))}
                    >
                      {t.mangrove.admit}
                    </Button>
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {/* Pending: only ever rendered for a governing role. */}
        {onTimeline && pending.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
              <ShieldQuestion size={16} aria-hidden /> {t.mangrove.pendingTitle}
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {/* A fragment renders as one here too: deciding whether a whole
                  subscription should receive it means reading what is in it. What is
                  NOT offered is merging it — that is a thing to do once it has been
                  accepted, not while deciding. */}
              {pending.map((p) => (
                <MangrovePost
                  key={p.activityId}
                  action="pending"
                  workspace={workspace}
                  projectName={projectName}
                  object={p.object}
                  subscriptionName={subscriptionName}
                  author={actorLabel(p.author, identity, t)}
                  authorKind={actorKind(p.author, identity)}
                  title={p.object.cell}
                  canTake={false}
                  // The scope it was published INTO is the whole question here: this
                  // card exists because somebody has to decide whether it reaches them.
                  recipients={[{ id: p.scope, label: audienceLabel(p.scope, identity, t) }]}
                  subtitle={t.mangrove.sheetFrom
                    .replace("{who}", actorLabel(p.author, identity, t))
                    .replace("{cell}", p.object.cell)}
                  actions={
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === p.activityId}
                        onClick={() =>
                          void run(p.activityId, () => decide(workspace, p.activityId, true))
                        }
                      >
                        <Check size={14} aria-hidden /> {t.mangrove.accept}
                      </Button>
                      <Button
                        size="sm"
                        variant="text"
                        disabled={busy === p.activityId}
                        onClick={() =>
                          void run(p.activityId, () => decide(workspace, p.activityId, false))
                        }
                      >
                        <X size={14} aria-hidden /> {t.mangrove.reject}
                      </Button>
                    </div>
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {onTimeline && claims.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
              <Send size={16} aria-hidden />{" "}
              {reading === "published" ? t.mangrove.publishedTitle : t.mangrove.receivedTitle}
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {claims.map((c, i) => {
                // Theirs, and still there to act on. BOTH of the member's actors
                // count: a memory the agent published is the member's to pass on.
                const own = isMine(c.author, identity) && !c.deleted;
                const revocable = reading === "published" && !c.deleted;
                const audience = audienceSummary(c.audience, identity, t, own);
                return (
                  <MangrovePost
                    key={`${c.cell}:${c.author}`}
                    // `deleted` DECIDES, not the log's verb: a mangrove that has
                    // not shipped `action` yet still answers with the tombstone,
                    // and that was the case with no word on the card at all.
                    // "published" is the fallback for the same reason -- it is
                    // what every claim was before any of this.
                    action={c.deleted ? "revoked" : (c.action ?? "published")}
                    workspace={workspace}
                    projectName={projectName}
                    object={c.object}
                    subscriptionName={subscriptionName}
                    author={actorLabel(c.author, identity, t)}
                    authorKind={actorKind(c.author, identity)}
                    title={c.cell}
                    recent={i < RECENT}
                    dimmed={c.deleted}
                    recipients={audience}
                    endorsed={c.evidence}
                    subtitle={t.mangrove.sheetFrom
                      .replace("{who}", actorLabel(c.author, identity, t))
                      .replace("{cell}", c.cell)}
                    onReference={onReference}
                    actions={
                      own || revocable ? (
                        <div className="flex flex-col gap-2">
                          {/* Passing it on is the member's own to offer, in ANY
                              reading: a post of theirs turns up under Published, and
                              a memory they wrote can also come back to them in a
                              reading they did not expect. */}
                          {own && (
                            <MangroveShareAction
                              workspace={workspace}
                              objectId={c.object.id}
                              caps={caps}
                              onShared={() => void reload()}
                            />
                          )}
                          {revocable && (
                            // Revoke is destructive and irreversible, and it sat one
                            // click from the content it destroys. Behind a disclosure
                            // and off to the side, it stops being something you reach
                            // for while meaning to do something else -- without being
                            // hidden, which would be its own kind of trap.
                            <details>
                              <summary className="flex cursor-pointer list-none justify-end text-xs text-fg-muted hover:text-fg">
                                {t.mangrove.advanced}
                              </summary>
                              {/* THE WARNING IS IN THE BOX WITH THE BUTTON. It was a
                                  footnote under the whole list, which is not where
                                  somebody about to revoke is looking -- and the
                                  alternative to reading it is a member believing a
                                  revoke recalled something. ActivityPub cannot
                                  un-deliver.

                                  THE BLOCKED EDGE SURVIVED AS A RULE, NOT AS A FRAME.
                                  A bordered box inside a disclosure inside a bordered
                                  card was three frames deep, which is what made a
                                  post read as heavy. What the colour is for -- this
                                  is the one irreversible thing on the screen -- is
                                  carried by the edge alone. */}
                              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border-l-2 border-blocked bg-elevated px-3 py-2">
                                <p className="text-left text-xs text-fg-muted">
                                  {t.mangrove.revokeNote}
                                </p>
                                <Button
                                  className="shrink-0 text-blocked"
                                  size="sm"
                                  variant="text"
                                  disabled={busy === c.object.id}
                                  onClick={() =>
                                    void run(c.object.id, () =>
                                      revoke(workspace, c.object.id, c.cell),
                                    )
                                  }
                                >
                                  <Trash2 size={14} aria-hidden /> {t.mangrove.revoke}
                                </Button>
                              </div>
                            </details>
                          )}
                        </div>
                      ) : undefined
                    }
                  />
                );
              })}
            </ul>
            </section>
          )}
          </div>
        </div>
      </div>
    </DestinationScreen>
  );
}
