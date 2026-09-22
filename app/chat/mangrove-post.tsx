"use client";

import { useState } from "react";
import { Download, GitMerge, Network, Paperclip, Quote } from "lucide-react";
import type { Workspace } from "./fragment";
import MangroveContent from "./mangrove-content";
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
    <div className="rounded-lg border border-rule-strong bg-elevated p-3">
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
              className="rounded-md border border-rule-strong bg-surface px-1.5 py-0.5 text-[11px] text-fg"
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
    <div className="rounded-lg border border-rule-strong bg-elevated p-3">
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
 * One memory's body, and the things a member can do with it.
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
  canMerge = true,
  onReference,
}: {
  workspace: Workspace;
  object: MangroveObject;
  /** Who this is from, already in the form the screen shows. */
  author: string;
  /** The sheet's heading when the body is long enough to need one. */
  title: string;
  subtitle?: React.ReactNode;
  /**
   * False where merging would be premature. A cross-scope publication awaiting a
   * decision is the one case: whoever governs it has to READ the fragment to decide,
   * which is why it renders as one at all, but taking it into their own memory before
   * they have accepted it is not a thing the screen should offer.
   */
  canMerge?: boolean;
  onReference?: (ref: MangroveReference) => void;
}) {
  const t = useT(chatCopy);
  const [referenced, setReferenced] = useState(false);
  const fragment = parseGraphFragment(object);

  return (
    <>
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
          content={object.content ?? ""}
          mediaType={object.mediaType}
          title={title}
          subtitle={subtitle}
        />
      )}

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
    </>
  );
}
