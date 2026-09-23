"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Download, GitMerge, Network, Paperclip, Quote } from "lucide-react";
import type { Workspace } from "./fragment";
import MangroveContent, { isCut } from "./mangrove-content";
import { formatSize } from "@/app/chat/file-visuals";
import {
  downloadBlob,
  mergeFragment,
  parseGraphFragment,
  MangroveError,
  type GraphFragment,
  type MangroveMerge,
  type MangroveObject,
} from "@/lib/mangrove";
import type { MangroveReference } from "@/lib/chatReference";
import { Button } from "@/components/ui/button";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// ONE MEMORY, WHICHEVER OF THE THREE KINDS IT IS.
//
// The timeline used to carry prose and only prose, and every reader of it could be one
// line long. It now carries three things through the same fields, and the difference is
// not cosmetic:
//
//   - PROSE has `content` and is rendered as prose. MangroveContent already does that.
//   - A FILE has no content at all -- only `blob`, the sha-256 the bytes live behind.
//     Rendered as a body it is an empty memory, which reads as something having gone
//     wrong on the way here.
//   - A FRAGMENT has `content`, and it is JSON. Run through the prose path it reaches
//     CodeBlock (renderKind sniffs the leading brace) and comes out as a wall of braces
//     that says nothing about what was shared. What a member needs to know before
//     deciding to merge is WHICH entities and HOW MUCH -- so that is what it renders,
//     and the JSON is what it falls back to if the body turns out not to parse.
//
// A FRAGMENT'S MERGE REPORTS WHAT LANDED, INCLUDING NOTHING. Merging something whose
// every entity and observation the agent already holds creates zero of all three, and a
// control that just stopped being busy would look like it had failed. Zero is an answer
// and gets a sentence of its own.
//
// AND THE POST IS THE CARD. It used to be a body the screen dropped into an <li> it
// styled itself, in three places. The card is now here, once, because the thing that
// makes a card a card -- it opens the sheet when you click it -- has to know which of
// the three kinds it is holding, and only this component does.

/** Recent, cut, or neither -- the two things that change how a card looks. */
const card = cva("rounded-xl border bg-surface p-3 transition-colors", {
  variants: {
    // An accent edge and a lift -- the treatment chat-view already gives the one
    // card on screen it wants read first. NOT a different background: the preview's
    // fade-out is painted `from-surface`, so a card that changed its background
    // would show the fade as a wash across its last two lines.
    recent: { true: "border-accent/40 shadow-elevated", false: "border-rule-strong" },
    // The accent means "interactive", which is exactly what this is saying.
    openable: {
      true: "cursor-pointer hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      false: "",
    },
  },
  defaultVariants: { recent: false, openable: false },
});

/**
 * Whether an event that reached the card started at something with its own answer to it.
 *
 * A WHOLE CARD BEING CLICKABLE MUST NOT SWALLOW WHAT IS INSIDE IT. Download, merge,
 * reference-in-chat, admit, accept/reject, the revoke disclosure and the share panel all
 * live in a card, and every one of them would otherwise also open the sheet. A <button>
 * wrapping the card is not valid HTML around those, and a stretched overlay button would
 * cover the links and code blocks a markdown body renders -- so the card carries the
 * handler and refuses events that began somewhere that already handles them.
 *
 * `[data-inner]` is for a whole REGION rather than a control: the share panel is a form
 * of its own inside the card, and the tags say nothing about its padding, its heading or
 * its explanatory line -- a click on any of which is a click on the panel, not on the
 * card, and must not open a sheet over the thing being shared.
 *
 * `[role="dialog"]` is in the list because React propagates a PORTAL's events through
 * the React tree: the sheet this card opened is rendered inside it, so a click in the
 * sheet arrives here too.
 */
function fromControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'a, button, summary, input, textarea, select, label, [data-inner], [role="dialog"]',
    ) !== null
  );
}

/** Beyond this many names the list says "and N more" instead of running down the card. */
const FRAGMENT_NAMES = 12;

function observationCount(fragment: GraphFragment): number {
  return fragment.entities.reduce((n, e) => n + (e.observations?.length ?? 0), 0);
}

function FragmentView({
  workspace,
  object,
  fragment,
  canMerge,
}: {
  workspace: Workspace;
  object: MangroveObject;
  fragment: GraphFragment;
  canMerge: boolean;
}) {
  const t = useT(chatCopy);
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState<MangroveMerge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = fragment.entities.slice(0, FRAGMENT_NAMES);
  const more = fragment.entities.length - shown.length;
  const nothing =
    merged !== null &&
    merged.entitiesCreated === 0 &&
    merged.observationsAdded === 0 &&
    merged.relationsCreated === 0;

  const merge = async () => {
    setMerging(true);
    setError(null);
    try {
      setMerged(await mergeFragment(workspace, object.id));
    } catch (err) {
      setError(err instanceof MangroveError ? err.code : "unknown");
    } finally {
      setMerging(false);
    }
  };

  return (
    // A TINT, NOT A SECOND FRAME. This box sits inside a card that already has a
    // border, and the two together read as a form field rather than as part of one
    // memory. `bg-elevated` against the card's `surface` separates it just as well
    // and stops the card being a stack of boxes.
    <div className="rounded-lg bg-elevated p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-fg">
        <Network size={14} aria-hidden /> {t.mangrove.fragmentTitle}
      </p>
      <p className="mt-1 text-xs text-fg-muted">
        {t.mangrove.fragmentCounts
          .replace("{entities}", String(fragment.entities.length))
          .replace("{observations}", String(observationCount(fragment)))
          .replace("{relations}", String(fragment.relations.length))}
      </p>

      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {shown.map((e) => (
            <li
              key={e.name}
              className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-fg"
            >
              {e.name}
              {e.entityType && <span className="ml-1 text-fg-muted">{e.entityType}</span>}
            </li>
          ))}
          {more > 0 && (
            <li className="px-1.5 py-0.5 text-[11px] text-fg-muted">
              {t.mangrove.fragmentMore.replace("{count}", String(more))}
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canMerge && (
          <Button size="sm" variant="tonal" disabled={merging} onClick={() => void merge()}>
            <GitMerge size={14} aria-hidden /> {merging ? t.mangrove.merging : t.mangrove.merge}
          </Button>
        )}
        {merged && (
          <span className="text-xs text-fg-muted">
            {nothing
              ? t.mangrove.mergedNothing
              : t.mangrove.merged
                  .replace("{entities}", String(merged.entitiesCreated))
                  .replace("{observations}", String(merged.observationsAdded))
                  .replace("{relations}", String(merged.relationsCreated))}
          </span>
        )}
        {error && <span className="text-xs text-fg-muted">{t.mangrove.mergeFailed}</span>}
      </div>
    </div>
  );
}

function FileView({ workspace, object }: { workspace: Workspace; object: MangroveObject }) {
  const t = useT(chatCopy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const blob = object.blob!;
  const name = object.fileName || object.cell;

  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      await downloadBlob(workspace, blob, object.fileName);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg bg-elevated p-3">
      <div className="flex items-center gap-2">
        <Paperclip size={14} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 truncate text-sm text-fg" title={name}>
          {name}
        </span>
        {/* Empty string when the sender's mangrove did not report a size, which is what
            formatSize answers for undefined -- no "0 B" on a file that is not empty. */}
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">
          {formatSize(object.size)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="tonal"
          disabled={busy}
          aria-label={`${t.mangrove.downloadFile} — ${name}`}
          onClick={() => void save()}
        >
          <Download size={14} aria-hidden /> {busy ? t.mangrove.downloading : t.mangrove.downloadFile}
        </Button>
        {error && <span className="text-xs text-fg-muted">{t.mangrove.downloadFailed}</span>}
      </div>
    </div>
  );
}

/**
 * One memory, as the card a reading is a list of: where it came from, its body, and the
 * things a member can do with it. A card whose body is cut opens the sheet when it is
 * clicked or when Enter or Space is pressed on it.
 *
 * `onReference` is absent when there is nowhere to reference INTO -- the same rule the
 * graph panel's own control follows. When it is there, the chip it fills carries the
 * OBJECT ID, because that is what the agent resolves through mangrove_timeline; the text
 * is never copied into the message, which is the rule every reference kind keeps.
 */
export default function MangrovePost({
  workspace,
  object,
  author,
  title,
  subtitle,
  meta,
  actions,
  canMerge = true,
  recent = false,
  dimmed = false,
  onReference,
}: {
  workspace: Workspace;
  object: MangroveObject;
  /** Who this is from, already in the form the screen shows. */
  author: string;
  /** The sheet's heading when the body is long enough to need one. */
  title: string;
  subtitle?: React.ReactNode;
  /** The line above the body: where this came from, where it went, what endorsed it. */
  meta?: React.ReactNode;
  /** What the reading lets a member DO with it -- admit, decide, revoke. */
  actions?: React.ReactNode;
  /**
   * False where merging would be premature. A cross-scope publication awaiting a
   * decision is the one case: whoever governs it has to READ the fragment to decide,
   * which is why it renders as one at all, but taking it into their own memory before
   * they have accepted it is not a thing the screen should offer.
   */
  canMerge?: boolean;
  /** One of the newest few in this reading. */
  recent?: boolean;
  /** Revoked: still listed, struck through, and no longer something to act on. */
  dimmed?: boolean;
  onReference?: (ref: MangroveReference) => void;
}) {
  const t = useT(chatCopy);
  const [referenced, setReferenced] = useState(false);
  const [open, setOpen] = useState(false);
  const fragment = parseGraphFragment(object);
  const content = object.content ?? "";
  // ONLY PROSE HAS MORE THAN THE CARD SHOWS. A fragment's card is a summary by
  // intent -- names and counts, never the JSON -- and a file's card is the whole
  // of what arrived. A sheet over either would open onto what is already on screen.
  const openable = !fragment && !object.blob && isCut(content);

  const opener: React.LiHTMLAttributes<HTMLLIElement> = openable
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": t.mangrove.openPost.replace("{cell}", object.cell),
        onClick: (e) => {
          if (!fromControl(e.target)) setOpen(true);
        },
        onKeyDown: (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          if (fromControl(e.target)) return;
          // Space scrolls the page otherwise, which is the reading being lost
          // at the moment it opens.
          e.preventDefault();
          setOpen(true);
        },
      }
    : {};

  return (
    <li
      {...opener}
      data-recent={recent ? "true" : undefined}
      className={card({ recent, openable })}
    >
      {meta && <p className="text-xs text-fg-muted">{meta}</p>}

      <div className={`mt-1 text-sm ${dimmed ? "text-fg-muted line-through" : "text-fg"}`}>
        {fragment ? (
          <FragmentView
            workspace={workspace}
            object={object}
            fragment={fragment}
            canMerge={canMerge}
          />
        ) : object.blob ? (
          <FileView workspace={workspace} object={object} />
        ) : (
          <MangroveContent
            content={content}
            mediaType={object.mediaType}
            title={title}
            subtitle={subtitle}
            open={open}
            onClose={() => setOpen(false)}
          />
        )}
      </div>

      {onReference && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="text"
            aria-label={`${t.mangrove.reference} — ${object.cell}`}
            onClick={() => {
              onReference({
                kind: "mangrove",
                objectId: object.id,
                cell: object.cell,
                author,
              });
              setReferenced(true);
            }}
          >
            <Quote size={14} aria-hidden /> {t.mangrove.reference}
          </Button>
          {/* Said out loud, because the composer it filled is not on this screen: the
              mangrove replaces the centre pane, so the chip appears when the member goes
              back to the conversation and nothing here would otherwise report the click. */}
          {referenced && <span className="text-xs text-fg-muted">{t.mangrove.referenced}</span>}
        </div>
      )}

      {actions && <div className="mt-2">{actions}</div>}
    </li>
  );
}
