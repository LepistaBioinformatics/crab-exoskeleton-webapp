"use client";

import { useEffect, useState } from "react";
import { cva } from "class-variance-authority";
import { Check, Inbox, Send, ShieldQuestion, Trash2, X } from "lucide-react";
import type { Workspace } from "./fragment";
import DestinationScreen from "./destination-screen";
import MangrovePost from "./mangrove-post";
import MangrovePeople from "./mangrove-people";
import MangroveCompose from "./mangrove-compose";
import { useMangrove } from "./use-mangrove";
import { admit, decide, revoke, type MangroveReading } from "@/lib/mangrove";
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
// AND "NOTHING YET" IS NOT "IT IS DOWN". An empty reading is a normal state and
// renders as prose; an unreachable service renders as an error with a retry.
// Collapsing them would mean a member who has simply not been shared anything
// is told something is broken.

const tab = cva(
  "rounded-lg px-3 py-1.5 text-sm transition-colors",
  {
    variants: {
      current: {
        true: "bg-elevated text-fg",
        false: "text-fg-muted hover:text-fg",
      },
    },
  },
);

/** An actor id is `mangrove:actor:<accId>:person|service`. Show the tail, which is
 *  the part a member can tell apart at a glance. */
function actorLabel(id: string): string {
  const m = /^mangrove:actor:(.+):(person|service)$/.exec(id);
  if (!m) return id;
  return m[2] === "service" ? `${m[1]} (bot)` : m[1];
}

function scopeLabel(id: string): string {
  if (id.startsWith("mangrove:group:subscription:")) return "subscription";
  if (id.startsWith("mangrove:group:tenant:")) return "tenant";
  return actorLabel(id);
}

export default function MangroveScreen({
  workspace,
  onReference,
}: {
  workspace: Workspace;
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

  const readings: { key: MangroveReading; label: string }[] = [
    { key: "received", label: t.mangrove.received },
    { key: "published", label: t.mangrove.published },
    // ABSENT, not disabled, for somebody with no governing role.
    ...(caps?.governs ? [{ key: "pending" as MangroveReading, label: t.mangrove.pending }] : []),
  ];

  const claims = timeline?.claims ?? [];
  const held = timeline?.held ?? [];
  const pending = timeline?.pending ?? [];
  const nothing = !loading && !error && claims.length === 0 && held.length === 0 && pending.length === 0;

  return (
    <DestinationScreen title={t.mangrove.title}>
      {/* A READING COLUMN, not the frame's full width.
          DestinationScreen is max-w-6xl because Projects is a grid of cards and
          a grid wants the room. This screen is prose somebody's agent wrote, and
          prose at 1150px is a line the eye loses its place in on the way back --
          the reason typography settles around 65-75 characters. max-w-3xl is
          that measure at this font size.

          AND A WHOLE VIEWPORT OF PADDING UNDER IT. Without it the last memory
          sits against the bottom edge, so reading it means scrolling it to the
          very end of the scroll range and then reading at the rim of the screen.
          The padding is part of the scrollable area, so the last card comes to
          rest wherever the reader stops, rather than only at the very bottom
          of the range. */}
      <div className="max-w-3xl pb-[100vh]">
          <p className="text-sm text-fg-muted">{t.mangrove.hint}</p>

        <nav className="mt-4 flex gap-1" aria-label={t.mangrove.title}>
          {readings.map((r) => (
            <button
              key={r.key}
              type="button"
              className={tab({ current: onTimeline && reading === r.key })}
              aria-current={onTimeline && reading === r.key ? "page" : undefined}
              onClick={() => {
                setOnPeople(false);
                setOnCompose(false);
                // The notice is about the publish that just happened; leaving it
                // pinned over a reading the member navigated to would make it
                // look like a property of that reading.
                setPublishedPending(null);
                setReading(r.key);
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className={tab({ current: onPeople })}
            aria-current={onPeople ? "page" : undefined}
            onClick={() => {
              setOnCompose(false);
              setPublishedPending(null);
              setOnPeople(true);
            }}
          >
            {t.mangrove.people}
          </button>
          {/* Its own flag: opening the form asks the timeline nothing. */}
          <button
            type="button"
            className={tab({ current: onCompose })}
            aria-current={onCompose ? "page" : undefined}
            onClick={() => {
              setOnPeople(false);
              setPublishedPending(null);
              setOnCompose(true);
            }}
          >
            {t.mangrove.compose}
          </button>
        </nav>

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
            <ul className="mt-3 flex flex-col gap-2">
              {held.map((h) => (
                <li key={h.activityId} className="rounded-xl border border-rule-strong bg-surface p-3">
                  <p className="text-xs text-fg-muted">
                    {t.mangrove.from.replace("{who}", actorLabel(h.from))} · {h.object.cell}
                  </p>
                  <div className="mt-1 text-sm text-fg">
                    <MangrovePost
                      workspace={workspace}
                      object={h.object}
                      author={actorLabel(h.from)}
                      title={h.object.cell}
                      subtitle={t.mangrove.sheetFrom
                        .replace("{who}", actorLabel(h.from))
                        .replace("{cell}", h.object.cell)}
                      onReference={onReference}
                    />
                  </div>
                  <Button
                    className="mt-2"
                    size="sm"
                    disabled={busy === h.activityId}
                    onClick={() => void run(h.activityId, () => admit(workspace, h.activityId))}
                  >
                    {t.mangrove.admit}
                  </Button>
                </li>
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
            <ul className="mt-3 flex flex-col gap-2">
              {pending.map((p) => (
                <li key={p.activityId} className="rounded-xl border border-rule-strong bg-surface p-3">
                  <p className="text-xs text-fg-muted">
                    {t.mangrove.from.replace("{who}", actorLabel(p.author))} → {scopeLabel(p.scope)} · {p.object.cell}
                  </p>
                  <div className="mt-1 text-sm text-fg">
                    {/* A fragment renders as one here too: deciding whether a whole
                        subscription should receive it means reading what is in it. What
                        is NOT offered is merging it — that is a thing to do once it has
                        been accepted, not while deciding. */}
                    <MangrovePost
                      workspace={workspace}
                      object={p.object}
                      author={actorLabel(p.author)}
                      title={p.object.cell}
                      canMerge={false}
                      subtitle={t.mangrove.sheetFrom
                        .replace("{who}", actorLabel(p.author))
                        .replace("{cell}", p.object.cell)}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy === p.activityId}
                      onClick={() => void run(p.activityId, () => decide(workspace, p.activityId, true))}
                    >
                      <Check size={14} aria-hidden /> {t.mangrove.accept}
                    </Button>
                    <Button
                      size="sm"
                      variant="text"
                      disabled={busy === p.activityId}
                      onClick={() => void run(p.activityId, () => decide(workspace, p.activityId, false))}
                    >
                      <X size={14} aria-hidden /> {t.mangrove.reject}
                    </Button>
                  </div>
                </li>
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
            <ul className="mt-3 flex flex-col gap-2">
              {claims.map((c) => (
                <li
                  key={`${c.cell}:${c.author}`}
                  className="rounded-xl border border-rule-strong bg-surface p-3"
                >
                  <p className="text-xs text-fg-muted">
                    {c.cell} · {actorLabel(c.author)}
                    {c.audience.length > 0 && ` · ${c.audience.map(scopeLabel).join(", ")}`}
                    {/* Weight of evidence, never a verdict. */}
                    {c.evidence > 0 && ` · ${t.mangrove.evidence.replace("{n}", String(c.evidence))}`}
                  </p>
                  <div className={`mt-1 text-sm ${c.deleted ? "text-fg-muted line-through" : "text-fg"}`}>
                    <MangrovePost
                      workspace={workspace}
                      object={c.object}
                      author={actorLabel(c.author)}
                      title={c.cell}
                      subtitle={t.mangrove.sheetFrom
                        .replace("{who}", actorLabel(c.author))
                        .replace("{cell}", c.cell)}
                      onReference={onReference}
                    />
                  </div>
                  {reading === "published" && !c.deleted && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="text"
                      disabled={busy === c.object.id}
                      onClick={() =>
                        void run(c.object.id, () => revoke(workspace, c.object.id, c.cell))
                      }
                    >
                      <Trash2 size={14} aria-hidden /> {t.mangrove.revoke}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {reading === "published" && claims.length > 0 && (
              // Said plainly, because the alternative is a member believing a
              // revoke recalled something. ActivityPub cannot un-deliver.
              <p className="mt-3 text-xs text-fg-muted">{t.mangrove.revokeNote}</p>
            )}
          </section>
        )}
      </div>
    </DestinationScreen>
  );
}
