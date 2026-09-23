"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import {
  Bot,
  Download,
  FileText,
  FileType,
  FolderDown,
  GitMerge,
  Network,
  Quote,
  StickyNote,
  User,
} from "lucide-react";
import type { Workspace } from "./fragment";
import MangroveContent, { isCut } from "./mangrove-content";
import Recipients, { type Recipient } from "./mangrove-recipients";
import { formatSize } from "@/app/chat/file-visuals";
import {
  blobFile,
  downloadBlob,
  mergeFragment,
  parseGraphFragment,
  MangroveError,
  type GraphFragment,
  type MangroveMerge,
  type MangroveAction,
  type MangroveObject,
} from "@/lib/mangrove";
import { uploadMedia } from "@/lib/media";
import type { MangroveReference } from "@/lib/chatReference";
import { Button } from "@/components/ui/button";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { errorCopy, type ErrorDict } from "@/lib/i18n/errors";
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
// AND WHATEVER IS TAKEN OUT OF THE MANGROVE HAS TO NAME WHERE IT LANDS, BEFORE IT IS
// TAKEN. Two of the three kinds can be put into the workspace -- a fragment merges into
// its memory graph, a file saves into its `uploads/` -- and the workspace in question is
// whichever one the member has open, which may be a project's. Both controls carry the
// same sentence for the same reason: the member is the only person who can see that the
// file went somewhere other than where they were told, and only after it has.
//
// AND THE POST IS THE CARD. It used to be a body the screen dropped into an <li> it
// styled itself, in three places. The card is now here, once, because the thing that
// makes a card a card -- it opens the sheet when you click it -- has to know which of
// the three kinds it is holding, and only this component does.
//
// THREE REGIONS, IN ONE ORDER, WHATEVER THE KIND: a <header> saying what this is, the
// body, and a <footer> holding the record and the controls. It used to open with a
// line of run-together provenance -- `soil-ph · by you · shared with this subscription
// · 2 endorsed` -- above the body, so the first thing read on every card was four
// small-print items the reader had to parse to find two answers, and the body itself
// started halfway down. The same facts are columns in the footer now: a heading asks
// the question, the value under it answers, and the top of the card is what the card
// is about.
//
// THE HEADER IS THE KIND'S OWN TITLE. A file has a name and a size, a fragment is a
// piece of a graph, and prose has its cell -- which is the one case where the title
// and the identifier in the footer are the same string, because for prose they really
// are the same thing. On a file they are not (`q2.pdf` against `attachments/q2.pdf`),
// which is exactly why the footer names the identifier separately rather than
// trusting the header to have shown it.

/**
 * WHAT HAPPENED, on the card that shows it.
 *
 * Three of these come off the log's own verb and two off which list the card is
 * in. They are one vocabulary because they answer one question -- a reader
 * scanning a column of cards is asking "what is this one" before anything else --
 * and a revocation had no word at all: it was a card at reduced opacity, which
 * says "something" and never says what.
 *
 * `held` and `pending` were distinguished only by the heading above their
 * section. That is fine while the section is on screen and useless the moment a
 * card is read anywhere else, which is what a card is for.
 */
export type PostAction = MangroveAction | "held" | "pending";

/**
 * The pill, and why it is a pill rather than another line of the byline.
 *
 * The byline is a sentence about a PERSON and this is a fact about the THING. Put
 * in the same sentence they compete for the same read; set apart at the end of
 * the band, one is scanned and the other is read.
 *
 * `attention` for the two that want the member to do something, and a quieter
 * tone for the three that are a record of what already happened. Revoked is not
 * struck through: the card is already dimmed and a second signal saying the same
 * thing is noise.
 */
const actionPill = cva(
  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
  {
    variants: {
      tone: {
        record: "bg-surface text-fg-muted ring-rule-strong",
        attention: "bg-accent/10 text-accent ring-accent/40",
      },
    },
    defaultVariants: { tone: "record" },
  },
);

/** The pill's copy and tone, for each of the five. */
function actionBadge(action: PostAction, t: ChatDict) {
  switch (action) {
    case "published":
      return { label: t.mangrove.actionPublished, tone: "record" as const };
    case "updated":
      return { label: t.mangrove.actionUpdated, tone: "record" as const };
    case "revoked":
      return { label: t.mangrove.actionRevoked, tone: "record" as const };
    case "held":
      return { label: t.mangrove.actionHeld, tone: "attention" as const };
    case "pending":
      return { label: t.mangrove.actionPending, tone: "attention" as const };
  }
}

/** Recent, cut, or neither -- the two things that change how a card looks. */
const card = cva("overflow-hidden rounded-xl border bg-surface transition-colors", {
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
 * A WHOLE CARD BEING CLICKABLE MUST NOT SWALLOW WHAT IS INSIDE IT. Download, save-to-
 * files, merge, reference-in-chat, admit, accept/reject, the revoke disclosure and the
 * share panel all live in a card, and every one of them would otherwise also open the sheet. A <button>
 * wrapping the card is not valid HTML around those, and a stretched overlay button would
 * cover the links and code blocks a markdown body renders -- so the card carries the
 * handler and refuses events that began somewhere that already handles them.
 *
 * `[data-inner]` is for a whole REGION rather than a control: the card's footer is the
 * record and the controls, and the share panel inside it is a form of its own -- and
 * the tags say nothing about a column heading, a padding gutter or an explanatory line,
 * a click on any of which is a click on the footer, not on the body, and must not open
 * a sheet over the thing being read or shared.
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

/**
 * The three sentences one destination can be said with, and the one that is true here.
 *
 * READ OFF `workspace.p`, which is the field the request itself carries -- never a
 * second prop saying whether a project is open. `uploadMedia`'s own comment records
 * what two reads of that one idea cost the last time they disagreed: the file landed
 * in the agent's workspace while the turn told the PROJECT's agent to open it. A
 * label promising one destination while the upload sends another is that same bug
 * one layer up, where the member is the only one who can see it and only afterwards.
 *
 * The NAME is a separate question from the destination. `projects` is still in
 * flight on the first paint inside a project, and `p` is a uuid -- which is nothing
 * to put in front of a member. The unnamed wording is true in that moment, names the
 * project case just as unmistakably, and stops being needed a beat later.
 */
function destination(
  workspace: Workspace,
  projectName: string | null | undefined,
  copy: { agent: string; project: string; projectUnnamed: string },
): string {
  if (!workspace.p) return copy.agent;
  return projectName ? copy.project.replace("{project}", projectName) : copy.projectUnnamed;
}

/**
 * What to say when a save did not happen.
 *
 * TWO LEGS, TWO VOCABULARIES, and both arrive as `Error.message` -- `MangroveError`
 * carries its code there and `uploadMedia` throws the media route's code.
 *
 *   - `/api/media` speaks CODES and nothing else, deliberately (see MEDIA_ERROR_CODES
 *     in lib/mycelium): the gateway's prose about a byte limit was untranslatable, so
 *     the status is what those routes forward. The dictionary is where those become
 *     sentences.
 *   - The blob route forwards the mangrove's own words verbatim through
 *     `upstreamError`, and a refusal that names the file or the reason is the only
 *     thing here a member can act on. Anything left after the dictionary is that, and
 *     it is shown as it arrived -- the same rule `failureText` keeps for a publish.
 *
 * WHAT PASSES THROUGH IS GATED ON THE ERROR'S TYPE, NOT ON FAILING THE TESTS ABOVE IT.
 * Neither leg catches a `fetch` that never reached anything, so a dropped connection
 * arrives here as a `TypeError` whose message is the BROWSER's ("Failed to fetch",
 * "NetworkError when attempting to fetch resource") -- which is exactly the literal this
 * app has a dictionary to stop showing people. Only a `MangroveError` carries a
 * sentence somebody wrote about this file, and `http_<status>` is this client's own
 * invention and says nothing.
 */
function saveFailure(err: unknown, t: ChatDict, errs: ErrorDict): string {
  const code = err instanceof Error ? err.message : "";
  if (code === "mangrove_unreachable") return t.mangrove.unreachable;
  if (Object.hasOwn(errs, code)) return errs[code as keyof ErrorDict];
  if (err instanceof MangroveError && code && !/^http_\d+$/.test(code)) return code;
  return t.mangrove.saveFailed;
}

/**
 * One fact about the thing, in a pill: its weight, its format.
 *
 * A ROW OF THESE AND NOT A LINE OF PROSE, because they are answers to different
 * questions that happen to be short. Run together -- `2 KB · Markdown` -- they read as
 * one value with a separator in it, and the separator is the only thing saying they
 * are two.
 */
function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-[11px] text-fg">
      <span className="shrink-0 text-fg-muted">{icon}</span>
      {children}
    </li>
  );
}

/**
 * What to call the body's media type, or null where there is nothing to call it.
 *
 * ONLY THE TWO THIS APP ALREADY NAMES. The composer offers markdown and plain text and
 * the dictionary has a word for each; anything else arrived from another deployment's
 * agent and would be shown as a raw `application/...`, which is a chip that costs a
 * line and answers nothing. No chip is the better of the two.
 */
function mediaLabel(mediaType: string | undefined, t: ChatDict): string | null {
  if (!mediaType) return null;
  if (mediaType.includes("markdown")) return t.mangrove.formatMarkdown;
  if (mediaType.startsWith("text/plain")) return t.mangrove.formatPlain;
  return null;
}

/** Beyond this many names the list says "and N more" instead of running down the card. */
const FRAGMENT_NAMES = 12;

/** How many nodes the thumbnail draws before it stops. */
const MAP_NODES = 9;

/**
 * The shape of what was shared, at thumbnail size.
 *
 * A HAND-DRAWN SVG AND NOT CYTOSCAPE, which this app already depends on and which
 * `memory-graph-view` uses for the real thing. A Cytoscape instance is a canvas, a
 * layout run and a teardown per mount, and a reading is a LIST of these -- twenty
 * cards would be twenty engines running a force simulation to fill 150 pixels. The
 * panel is where a graph is explored; here the question is only "how connected is
 * this", and that is answerable at a glance without a layout.
 *
 * THE RING IS THE LAYOUT, and it is the honest one at this size. A force layout would
 * claim that distance on screen means something, which at 150px across and nine nodes
 * it cannot; every node on a circle says only what the EDGES say, which is the whole
 * content of the picture. The edges are real -- the fragment's own relations, drawn
 * between the nodes that made the cut.
 *
 * DETERMINISTIC, so the same fragment draws the same picture on every render and in
 * every reading. Nothing here is random and nothing is measured from the DOM.
 */
function FragmentMap({ fragment }: { fragment: GraphFragment }) {
  const t = useT(chatCopy);
  const names = fragment.entities.slice(0, MAP_NODES).map((e) => e.name);
  const at = new Map(names.map((n, i) => [n, i]));

  // A circle of radius 1 in the viewBox's own units, inset so a node's disc and its
  // label stay inside the box rather than being clipped by it.
  const R = 40;
  const point = (i: number) => {
    const a = (i / names.length) * 2 * Math.PI - Math.PI / 2;
    return { x: 50 + R * Math.cos(a), y: 46 + R * Math.sin(a) };
  };

  const edges = fragment.relations
    .filter((r) => at.has(r.from) && at.has(r.to))
    .map((r) => ({ a: point(at.get(r.from)!), b: point(at.get(r.to)!), key: `${r.from}>${r.to}:${r.relationType}` }));

  return (
    <svg
      viewBox="0 0 100 92"
      className="h-auto w-full"
      role="img"
      aria-label={t.mangrove.fragmentMap.replace("{count}", String(fragment.entities.length))}
    >
      {edges.map((e) => (
        <line
          key={e.key}
          x1={e.a.x}
          y1={e.a.y}
          x2={e.b.x}
          y2={e.b.y}
          className="stroke-fg-muted"
          strokeWidth={0.5}
          strokeOpacity={0.5}
        />
      ))}
      {names.map((n, i) => {
        const { x, y } = point(i);
        return <circle key={n} cx={x} cy={y} r={3} className="fill-accent" />;
      })}
    </svg>
  );
}

function observationCount(fragment: GraphFragment): number {
  return fragment.entities.reduce((n, e) => n + (e.observations?.length ?? 0), 0);
}

function FragmentView({
  workspace,
  projectName,
  object,
  fragment,
  canTake,
}: {
  workspace: Workspace;
  projectName?: string | null;
  object: MangroveObject;
  fragment: GraphFragment;
  canTake: boolean;
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
    // NO BOX OF ITS OWN. This used to be a tinted well, because the card around it
    // was one undifferentiated block and the fragment needed separating from the
    // provenance line above it. The card has regions now -- a header saying what this
    // is, a toned footer holding the record -- and a third tone between them made a
    // post read as a stack of boxes again, which is what the tint was avoiding.
    //
    // WHAT IT IS is said by the header, so this opens on the counts. A title here as
    // well would be the same sentence twice, one line apart.
    <div>
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {shown.map((e) => (
            <li
              key={e.name}
              className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] text-fg"
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

      {/* WHAT IS IN IT, BESIDE THE SHAPE OF IT. The counts used to be one interpolated
          line -- `3 entities · 13 observations · 3 relations` -- read above the chips.
          Three of anything separated by dots is a value with punctuation in it; as
          three rows with the numeral set apart, each one is a question answered.

          THE THUMBNAIL IS THE OTHER HALF OF THE SAME ANSWER. Counts say how much came
          and say nothing about whether it is one cluster or nine loose names, which is
          the thing a member is deciding when they merge. */}
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* WHICH memory, said before the control that fills it. This already went to
              the workspace the member has open -- `mergeFragment` sends the project --
              and the screen simply never said so, which is the same silence the file
              save would have shipped with. */}
          {canTake && (
            <p className="text-xs leading-relaxed text-fg-muted">
              {destination(workspace, projectName, {
                agent: t.mangrove.mergeToAgent,
                project: t.mangrove.mergeToProject,
                projectUnnamed: t.mangrove.mergeToProjectUnnamed,
              })}
            </p>
          )}

          <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
            <li>
              <span className="font-semibold text-fg">{fragment.entities.length}</span>{" "}
              {t.mangrove.fragmentEntities}
            </li>
            <li>
              <span className="font-semibold text-fg">{observationCount(fragment)}</span>{" "}
              {t.mangrove.fragmentObservations}
            </li>
            <li>
              <span className="font-semibold text-fg">{fragment.relations.length}</span>{" "}
              {t.mangrove.fragmentRelations}
            </li>
          </ul>
        </div>

        {/* Nothing to draw a picture of when the fragment carries no entity at all --
            which is a body that parsed and turned out to be empty, not an error. */}
        {fragment.entities.length > 0 && (
          <div className="w-2/5 max-w-[150px] shrink-0">
            <FragmentMap fragment={fragment} />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canTake && (
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

/**
 * A file somebody published, and the two places a member can put it.
 *
 * DOWNLOAD TAKES IT OUT OF THE SYSTEM; SAVE TAKES IT FURTHER IN. That is why only
 * one of them is gated: bytes on the member's own machine are not something the
 * agent will read back, and bytes in `uploads/` are exactly that.
 *
 * The save is a fetch and an upload from THIS BROWSER, and no new route. Both ends
 * already exist and already authorize this member -- see `blobFile`.
 */
function FileView({
  workspace,
  projectName,
  object,
  canTake,
}: {
  workspace: Workspace;
  projectName?: string | null;
  object: MangroveObject;
  canTake: boolean;
}) {
  const t = useT(chatCopy);
  const errs = useT(errorCopy);
  // One at a time, and which one is showing. Two booleans would let a member start a
  // save while a download was still reading the same bytes.
  const [busy, setBusy] = useState<"download" | "save" | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  // The stored path, as the upload answered it -- not prettified. `attachmentName`
  // strips the folder, and the folder is half of where the file went.
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const blob = object.blob!;
  const name = object.fileName || object.cell;

  const download = async () => {
    setBusy("download");
    setDownloadFailed(false);
    try {
      await downloadBlob(workspace, blob, object.fileName);
    } catch {
      setDownloadFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setSaveError(null);
    setSavedPath(null);
    try {
      // THE SAME `workspace` THE LABEL WAS WRITTEN FROM. `uploadMedia` reads `p` off
      // it and sends the project; nothing here re-decides where this goes.
      const stored = await uploadMedia(workspace, await blobFile(workspace, blob, object.fileName));
      setSavedPath(stored.path);
    } catch (err) {
      setSaveError(saveFailure(err, t, errs));
    } finally {
      setBusy(null);
    }
  };

  const format = mediaLabel(object.mediaType, t);
  // Empty string when the sender's mangrove did not report one, which is what
  // formatSize answers for undefined.
  const size = formatSize(object.size);

  return (
    // The name is the card's header; the weight and the format are chips under it, and
    // what is left is what can be DONE with the bytes plus the sentence saying where
    // each of those puts them. No box of its own, for the reason FragmentView records.
    <div className="flex flex-col gap-3">
      {/* THE SIZE MOVED OUT OF THE HEADER TO SIT BESIDE THE FORMAT. They are two facts
          of the same kind, and one of them being set in the title row made it read as
          part of the name. Either is left OUT where it is not known, rather than
          claiming "0 B" about a file that is not empty. */}
      {(size || format) && (
        <ul className="flex flex-wrap gap-1.5">
          {size && <Chip icon={<FileText size={12} aria-hidden />}>{size}</Chip>}
          {format && <Chip icon={<FileType size={12} aria-hidden />}>{format}</Chip>}
        </ul>
      )}

      {canTake && (
        <p className="text-xs leading-relaxed text-fg-muted">
          {destination(workspace, projectName, {
            agent: t.mangrove.saveToAgent,
            project: t.mangrove.saveToProject,
            projectUnnamed: t.mangrove.saveToProjectUnnamed,
          })}{" "}
          {t.mangrove.saveOverwrites}
        </p>
      )}

      {/* STACKED, NOT WRAPPED. Two controls in a column this narrow wrap anyway, and a
          wrap puts the second one hard against the left edge under a first that ended
          mid-line -- a ragged pair rather than a list of what can be done. */}
      <div className="flex flex-col items-start gap-2">
        <Button
          size="sm"
          variant="tonal"
          disabled={busy !== null}
          aria-label={`${t.mangrove.downloadFile} — ${name}`}
          onClick={() => void download()}
        >
          <Download size={14} aria-hidden />{" "}
          {busy === "download" ? t.mangrove.downloading : t.mangrove.downloadFile}
        </Button>
        {canTake && (
          <Button
            size="sm"
            variant="tonal"
            disabled={busy !== null}
            aria-label={`${t.mangrove.saveToFiles} — ${name}`}
            onClick={() => void save()}
          >
            <FolderDown size={14} aria-hidden />{" "}
            {busy === "save" ? t.mangrove.saving : t.mangrove.saveToFiles}
          </Button>
        )}
        {downloadFailed && <span className="text-xs text-fg-muted">{t.mangrove.downloadFailed}</span>}
        {savedPath && (
          <span className="text-xs text-fg-muted">
            {t.mangrove.saved.replace("{path}", savedPath)}
          </span>
        )}
        {saveError && <span className="text-xs text-fg-muted">{saveError}</span>}
      </div>
    </div>
  );
}

/**
 * One column of the card's record: a heading, and the answer under it.
 *
 * A <dl> AND NOT A GRID OF <span>s, because that is what this is -- a question and its
 * answer, up to four of them, asked the same way on every card and left OUT where
 * there is no honest answer. It also means a reader on a screen reader hears "From:
 * you" rather than two adjacent fragments whose relationship is a stylesheet.
 */
function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  /** An address rather than a name: shown monospaced, and broken anywhere it must be. */
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className={`mt-0.5 text-xs text-fg ${mono ? "break-all font-mono" : "break-words"}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * One memory, as the card a reading is a list of: what it is, its body, and -- under
 * both -- who sent it, who got it, what it is called and what a member can do with it.
 * A card whose body is cut opens the sheet when it is clicked or when Enter or Space is
 * pressed on it.
 *
 * `onReference` is absent when there is nowhere to reference INTO -- the same rule the
 * graph panel's own control follows. When it is there, the chip it fills carries the
 * OBJECT ID, because that is what the agent resolves through mangrove_timeline; the text
 * is never copied into the message, which is the rule every reference kind keeps.
 */
export default function MangrovePost({
  workspace,
  projectName,
  object,
  author,
  authorKind = "person",
  action,
  subscriptionName,
  title,
  subtitle,
  recipients,
  endorsed = 0,
  actions,
  canTake = true,
  recent = false,
  dimmed = false,
  onReference,
}: {
  workspace: Workspace;
  /**
   * What the member calls the project `workspace.p` names, when there is one and it
   * has arrived. Only ever DISPLAYED: what a request addresses is `p`, and these two
   * must not be able to disagree about which project is open.
   */
  projectName?: string | null;
  object: MangroveObject;
  /** Who this is from, already in the form the screen shows. */
  author: string;
  /**
   * What happened to this memory. REQUIRED, so a fourth list cannot be added
   * without deciding what its cards say -- which is how `held` and `pending` came
   * to be told apart only by the heading above them.
   */
  action: PostAction;
  /**
   * Person or agent, for the glyph beside the name. Separate from `author` because the
   * label is a finished sentence and the byline needs the kind BEFORE the sentence is
   * read -- see `actorKind`.
   */
  authorKind?: "person" | "agent";
  /** The sheet's heading when the body is long enough to need one. */
  title: string;
  subtitle?: React.ReactNode;
  /**
   * Who else got this, one label each, or absent where there is nothing honest to
   * say -- which is not the same as nobody. A directly held memory says who sent it
   * and no more; a stranger's post does not tell us who else received it. The column
   * is left OUT in both, rather than headed over a blank. See `audienceSummary`.
   */
  recipients?: readonly Recipient[] | null;
  /** What this subscription is called, for a recipient that is the whole of it. */
  subscriptionName?: string | null;
  /** How many have endorsed it. Weight of evidence, never a verdict; 0 says nothing. */
  endorsed?: number;
  /** What the reading lets a member DO with it -- admit, decide, revoke. */
  actions?: React.ReactNode;
  /**
   * Whether this may be TAKEN -- merged into the workspace's memory, or saved into its
   * files. One flag for both, because it is one question: a cross-scope publication
   * awaiting a decision is the case it exists for, and whoever governs it has to READ
   * the thing to decide, which is why it renders at all. Putting it into the workspace
   * before they have accepted it is not something the screen should offer, and a file
   * is no different from a fragment there.
   *
   * Download is NOT gated by it. Bytes on the member's own machine leave the system;
   * bytes in `uploads/` are what the agent reads on the next turn.
   */
  canTake?: boolean;
  /** One of the newest few in this reading. */
  recent?: boolean;
  /** Revoked: still listed, struck through, and no longer something to act on. */
  dimmed?: boolean;
  onReference?: (ref: MangroveReference) => void;
}) {
  const t = useT(chatCopy);
  const badge = actionBadge(action, t);
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
      {/* WHO IT IS FROM, ACROSS THE TOP.
          This used to be a column in the footer, under a heading, read last. It is the
          first thing a reader of somebody else's memory wants and the only fact on the
          card that is about a PERSON rather than about a thing, which is why it gets
          a band of its own and a glyph: the shape says person-or-agent before the
          sentence beside it has been read at all.

          `data-inner`, because the band is a region -- a padding gutter and an avatar,
          neither of them a control -- and a click on it must not open a sheet over the
          body. */}
      <div data-inner className="flex items-center gap-2.5 bg-elevated px-3.5 py-2.5">
        <span className="shrink-0 rounded-full bg-surface p-1.5 text-accent ring-1 ring-rule-strong">
          {authorKind === "agent" ? (
            <Bot size={16} aria-hidden />
          ) : (
            <User size={16} aria-hidden />
          )}
        </span>
        <p className="min-w-0 flex-1 break-words text-xs leading-snug text-fg-muted">
          {t.mangrove.senderLabel}{" "}
          <span className="font-medium text-fg">{author}</span>
        </p>
        {/* WHAT HAPPENED, at the end of the band the eye already lands on. A
            revocation used to be a card at reduced opacity and nothing else. */}
        <span className={actionPill({ tone: badge.tone })}>{badge.label}</span>
      </div>

      {/* WHAT THIS IS, in the kind's own terms. A file is its name, a fragment is a
          piece of somebody's graph, and prose is the handle it was filed under. The
          glyph is ACCENT and the title is set a size up: this is the line the eye
          should land on after the byline, and a 14px title beside a muted 14px icon
          was the same weight as everything under it.

          NOT struck through when the memory is revoked: the title is how the reader
          finds the thing again, and a tombstoned memory is still listed. */}
      <header className="flex items-start gap-2.5 px-3.5 pt-3.5">
        {fragment ? (
          <>
            <Network size={20} className="mt-px shrink-0 text-accent" aria-hidden />
            <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug text-fg">
              {t.mangrove.fragmentTitle}
            </h3>
          </>
        ) : object.blob ? (
          <>
            <FileText size={20} className="mt-px shrink-0 text-accent" aria-hidden />
            <h3
              className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-fg"
              title={object.fileName || object.cell}
            >
              {object.fileName || object.cell}
            </h3>
          </>
        ) : (
          <>
            {/* Prose gets one too, so the three kinds read as three of the same thing
                rather than as two cards and a bare line. */}
            <StickyNote size={20} className="mt-px shrink-0 text-accent" aria-hidden />
            <h3
              className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-fg"
              title={object.cell}
            >
              {object.cell}
            </h3>
          </>
        )}
      </header>

      <div
        className={`px-3.5 pb-3.5 pt-2.5 text-sm ${dimmed ? "text-fg-muted line-through" : "text-fg"}`}
      >
        {fragment ? (
          <FragmentView
            workspace={workspace}
            projectName={projectName}
            object={object}
            fragment={fragment}
            canTake={canTake}
          />
        ) : object.blob ? (
          <FileView
            workspace={workspace}
            projectName={projectName}
            object={object}
            canTake={canTake}
          />
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

      {/* THE RECORD, AND THEN THE CONTROLS, UNDER THE THING THEY ARE ABOUT.
          `data-inner` on the whole section, not on each control: it holds column
          headings, a gutter and a share panel's prose, none of which are a click on
          the body -- and the body is what the card opens a sheet over.

          ONE COLUMN, NOT TWO OR THREE. The grid was `grid-cols-2 sm:grid-cols-3` from
          when a card was the width of the reading column; at two cards to a row an
          identifier like `attachments/nota-manguezais.md` had about twelve characters
          before it broke, so every value wrapped and the columns stopped lining up
          with anything. A heading over its answer, stacked, survives any width.

          SEPARATED BY TONE AND NOT BY A HAIRLINE, and the alternation is what does it:
          the byline band and this record are `elevated`, the title, the body and the
          controls under here are the card's own `surface`. Three regions, two tones,
          no lines -- which is `pane-weight`'s rule (a horizontal rule survives only
          where content scrolls past it, and nothing scrolls past the bottom of a
          card) satisfied rather than argued with. The tone change is also why the
          controls sit OUTSIDE the tinted block: what you can DO is not part of the
          record, and here that is said by the background rather than by a line.

          THE TINT IS ON THIS REGION, NOT ON THE CARD. The preview's fade is painted
          `from-surface` and lives in the body above, so the card's own background has
          to stay `surface` -- which is why `recent` is a border and a lift. */}
      <footer data-inner>
        <dl className="grid gap-y-2.5 bg-elevated px-3.5 py-3">
          {recipients && recipients.length > 0 && (
            <Recipients
              workspace={workspace}
              to={recipients}
              subscriptionName={subscriptionName}
            />
          )}
          {/* The address, always -- and on prose the same string as the header, because
              for prose the title and the address really are one thing. */}
          <Field label={t.mangrove.identifierLabel} value={object.cell} mono />
          {endorsed > 0 && (
            <Field label={t.mangrove.endorsedLabel} value={String(endorsed)} />
          )}
        </dl>

        {(onReference || actions) && (
          <div className="flex flex-col gap-2 px-3.5 py-3">
            {onReference && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="tonal"
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
                {/* Said out loud, because the composer it filled is not on this screen:
                    the mangrove replaces the centre pane, so the chip appears when the
                    member goes back to the conversation and nothing here would
                    otherwise report the click. */}
                {referenced && (
                  <span className="text-xs text-fg-muted">{t.mangrove.referenced}</span>
                )}
              </div>
            )}

            {actions}
          </div>
        )}
      </footer>
    </li>
  );
}
