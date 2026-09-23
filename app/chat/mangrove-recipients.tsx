"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Building2, User, Users } from "lucide-react";
import type { Workspace } from "./fragment";
import { resolveActors } from "@/lib/mangrove";
import { tenantDisplayName } from "./tenant-brand";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// WHO ELSE GOT THIS, AS FACES RATHER THAN AS UUIDS.
//
// A recipient's label is honest and unreadable: `a person (28690354-d74b-458f-
// b4df-d1ffc05082c1)`. Stacked one per line it was three wrapped lines of that,
// and the only part carrying information -- whether this went to one colleague,
// to the whole subscription, or to the tenant -- was the one word in front of
// the brackets. The glyph says that at a glance, and the id stops being read.
//
// FOUR KINDS, FOUR GLYPHS, and the fourth is the reason this is not two: an
// agent is not the person who owns it, and a card saying something reached
// "an agent" is answering a different question from one saying it reached a
// person. The distinction already exists in the actor id and was being thrown
// away at the last step.
//
// THE NAME IS RESOLVED ON HOVER, NOT ON RENDER. Three reasons, in order of
// weight: a reading is a list of cards and eagerly naming every recipient of
// every one of them is a burst of requests for something nobody asked to see;
// the answer for a person costs a round trip the card does not otherwise need;
// and a member who does not care never pays for it. What is shown before then
// is the label the screen already had, so nothing is hidden waiting for a
// pointer.

export type RecipientKind = "person" | "agent" | "subscription" | "tenant";

export interface Recipient {
  /**
   * The mangrove id, where there is one. Absent for an audience that is a
   * STATEMENT rather than an address -- "only you" on a post published to
   * nobody, which names no actor because it reached none.
   */
  id?: string;
  /** What the screen already calls it, shown until something better arrives. */
  label: string;
}

/** How many faces before the row offers the rest. */
const SHOWN = 6;

export function kindOf(id: string | undefined): RecipientKind {
  if (!id) return "person";
  if (id.startsWith("mangrove:group:tenant:")) return "tenant";
  if (id.startsWith("mangrove:group:subscription:")) return "subscription";
  return id.endsWith(":service") ? "agent" : "person";
}

const GLYPH = {
  person: User,
  agent: Bot,
  subscription: Users,
  tenant: Building2,
} as const;

// Groups read as a fill, actors as an outline. A subscription is not a bigger
// person, and two glyphs of the same weight invite reading the row as a list of
// people of whom some happen to be plural.
const FACE = {
  person: "bg-surface text-accent ring-rule-strong",
  agent: "bg-surface text-accent ring-rule-strong",
  subscription: "bg-accent/15 text-accent ring-accent/40",
  tenant: "bg-accent/15 text-accent ring-accent/40",
} as const;

/**
 * Names already paid for, across every card on the screen.
 *
 * MODULE SCOPE ON PURPOSE. A reading is a list of cards and the same
 * subscription is the recipient of most of them, so a cache inside the component
 * would fetch the same name once per card. Keyed by workspace as well as by id,
 * because the two members of `mangrove:actor:<acc>:person` in two different
 * subscriptions are two different people and only one of them is resolvable here.
 */
const named = new Map<string, string>();

function cacheKey(w: Workspace, id: string): string {
  return `${w.t}/${w.s}/${id}`;
}

/**
 * The name behind one recipient, fetched at most once.
 *
 * `null` means "nothing better than the label" -- an actor who has left the
 * subscription, a tenant lookup that failed, a group whose name this screen was
 * not given. Every one of those is ordinary, and none of them is worth telling a
 * member about: the row keeps the label it already had.
 */
async function lookup(
  w: Workspace,
  r: Recipient,
  subscriptionName: string | null | undefined,
): Promise<string | null> {
  const kind = kindOf(r.id);
  if (kind === "subscription") return subscriptionName?.trim() || null;
  if (!r.id) return null;

  if (kind === "tenant") {
    // The id is the tenant's uuid, which is what this route takes. Resolved the
    // way the sidebar already resolves it, through `tenantDisplayName`, so the
    // two cannot disagree about where a tenant's name lives on the wire.
    const uuid = r.id.slice("mangrove:group:tenant:".length);
    const res = await fetch(`/api/tenants/${encodeURIComponent(uuid)}`);
    if (!res.ok) return null;
    const body = await res.json();
    return tenantDisplayName(body?.tenant);
  }

  const [found] = await resolveActors(w, [r.id]);
  return found?.email ?? null;
}

function Face({
  workspace,
  recipient,
  subscriptionName,
}: {
  workspace: Workspace;
  recipient: Recipient;
  subscriptionName?: string | null;
}) {
  const t = useT(chatCopy);
  const kind = kindOf(recipient.id);
  const Glyph = GLYPH[kind];
  const key = recipient.id ? cacheKey(workspace, recipient.id) : "";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(() => named.get(key) ?? null);
  const [asking, setAsking] = useState(false);
  // Whether this face is still mounted. A reading reloads while a pointer is
  // over a card, and a resolved name landing on an unmounted row is a warning
  // in the console and nothing on screen.
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  // WHERE THE TOOLTIP GOES, measured rather than declared.
  //
  // It used to be `absolute` inside the face, centred on it -- and the card is
  // `overflow-hidden` (it has to be: the byline band is a filled rectangle and
  // the card is rounded). The recipients column sits at the card's left edge, so
  // half of a centred tooltip fell outside the card and was cut off. A name that
  // reads "rketing Squad" is worse than no tooltip: the reader cannot tell it was
  // clipped rather than stored that way.
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // Before paint, and off-screen until then: the tooltip has to be rendered to be
  // measured, and a frame of it at the wrong place is a flicker on every hover.
  useLayoutEffect(() => {
    if (!open) {
      setAt(null);
      return;
    }
    const b = btn.current?.getBoundingClientRect();
    const box = tip.current?.getBoundingClientRect();
    if (!b || !box) return;
    const GAP = 6;
    const EDGE = 8;
    // Centred on the face, then pulled back inside the VIEWPORT -- not inside the
    // card. Overlapping the card is what a tooltip is for; leaving the screen is
    // the same defect in a different direction.
    const centred = b.left + b.width / 2 - box.width / 2;
    const left = Math.max(
      EDGE,
      Math.min(centred, window.innerWidth - box.width - EDGE),
    );
    // Above when there is room for it, below when there is not -- a face on the
    // first row of a pane has nothing above it.
    const above = b.top - box.height - GAP;
    setAt({ left, top: above >= EDGE ? above : b.bottom + GAP });
  }, [open, name, asking]);

  // A FIXED TOOLTIP DOES NOT SCROLL WITH WHAT IT POINTS AT. The absolute one did,
  // for free; this one would sit where the face used to be. Closing is the honest
  // answer -- the pointer has left the face by then anyway, and re-hovering costs
  // nothing.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const reveal = () => {
    setOpen(true);
    if (name !== null || asking) return;
    setAsking(true);
    lookup(workspace, recipient, subscriptionName)
      .then((found) => {
        if (!found) return;
        if (key) named.set(key, found);
        if (live.current) setName(found);
      })
      .catch(() => {
        // Nothing better than the label, which is already on screen.
      })
      .finally(() => {
        if (live.current) setAsking(false);
      });
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={btn}
        type="button"
        className={`inline-flex size-6 items-center justify-center rounded-full ring-1 transition-colors ${FACE[kind]}`}
        // THE LABEL IS THE BUTTON'S NAME, so a screen reader is never handed a
        // control called "button" -- and the resolved name replaces it once
        // there is one, which is the same substitution the tooltip makes.
        aria-label={name ?? recipient.label}
        onMouseEnter={reveal}
        onFocus={reveal}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        <Glyph size={12} aria-hidden />
      </button>
      {open &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            style={{
              position: "fixed",
              left: at?.left ?? 0,
              top: at?.top ?? 0,
              visibility: at ? "visible" : "hidden",
            }}
            className="pointer-events-none z-[70] max-w-56 whitespace-nowrap rounded-md bg-elevated px-2 py-1 text-[11px] text-fg shadow-elevated ring-1 ring-rule-strong"
          >
            {/* The label until something better lands, and never a spinner in its
              place: replacing a true answer with "loading" to go on to the same
              answer is a worse reading than not asking. */}
            <span className="block truncate">{name ?? recipient.label}</span>
            {asking && name === null && (
              <span className="block text-fg-muted">
                {t.mangrove.resolving}
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}

export default function Recipients({
  workspace,
  to,
  subscriptionName,
}: {
  workspace: Workspace;
  to: readonly Recipient[];
  /**
   * What this subscription is called. Passed in rather than looked up: the shell
   * has already resolved it for its own header, and a second fetch per card for
   * a string the app is holding would be the cost this whole component avoids.
   */
  subscriptionName?: string | null;
}) {
  const t = useT(chatCopy);
  const [all, setAll] = useState(false);
  const shown = all ? to : to.slice(0, SHOWN);

  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        {t.mangrove.recipientsLabel}
      </dt>
      <dd className="mt-1 flex flex-wrap items-center gap-1">
        {shown.map((r) => (
          <Face
            key={r.id ?? r.label}
            workspace={workspace}
            recipient={r}
            subscriptionName={subscriptionName}
          />
        ))}
        {to.length > SHOWN && (
          <button
            type="button"
            className="rounded-full px-1.5 py-0.5 text-[11px] text-fg-muted underline underline-offset-2 hover:text-fg"
            onClick={() => setAll(!all)}
          >
            {all ? t.mangrove.recipientsFewer : `+${to.length - SHOWN}`}
          </button>
        )}
      </dd>
    </div>
  );
}
