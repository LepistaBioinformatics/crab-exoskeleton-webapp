"use client";

import MessageContent from "./message-content";
import CodeBlock from "./code-block";
import { BottomSheet } from "@/components/ui/bottom-sheet";

// How a shared memory's body is shown.
//
// MARKDOWN IS THE DEFAULT, not a special case. A memory is prose somebody's
// agent wrote, and the renderer for that already exists -- MessageContent, the
// same GitHub-flavored one the transcript uses. Writing a second markdown
// pipeline for this screen would be two things to keep in step for no gain.
//
// A FORMAT THAT IS NOT PROSE IS SHOWN AS WHAT IT IS. A JSON or YAML body run
// through a markdown renderer comes out as one long grey paragraph with its
// indentation eaten, which is worse than useless: it looks like the content is
// damaged. Those go to CodeBlock instead, which is the component the transcript
// already uses for exactly this.
//
// AND LONG CONTENT IS CUT, not scrolled inside a card. A list where one item is
// four screens tall stops being a list. The cut is by LINES rather than
// characters because a line count is what the reader sees -- 2000 characters of
// prose and 2000 characters of a table occupy very different amounts of screen.
//
// THE WAY IN IS THE CARD, NOT A BUTTON UNDER THE FADE. The sheet is opened by
// whoever owns the card -- this component only says whether there IS one to
// open (`isCut`) and renders it when told to. A "show more" control of its own
// would be a second, smaller target for the thing the whole card now does.

/** Above this many lines, the card shows a preview and there is a sheet to open. */
const PREVIEW_LINES = 8;

/**
 * Whether this body has more in it than the card will show.
 *
 * The card asks before making itself clickable: a card that opens a sheet
 * holding exactly what is already on screen is an affordance that lies.
 */
export function isCut(content: string): boolean {
  return content.split("\n").length > PREVIEW_LINES;
}

/**
 * Which renderer a body gets.
 *
 * Decided from mediaType when the publisher set one, and from the content
 * itself when they did not -- a body that starts with `{` or `[` is data
 * whatever it was labelled, and a member is better served by seeing it as data
 * than by seeing markdown make a mess of it.
 */
export function renderKind(mediaType: string | undefined, content: string): "markdown" | "code" {
  const m = (mediaType ?? "").toLowerCase();
  if (m.includes("markdown") || m === "text/plain" || m === "") {
    // Unlabelled or plainly prose: sniff for structured data anyway.
    const head = content.trimStart();
    if (head.startsWith("{") || head.startsWith("[")) return "code";
    return "markdown";
  }
  if (m.includes("json") || m.includes("yaml") || m.includes("xml") || m.includes("csv")) {
    return "code";
  }
  // Anything else labelled explicitly -- a source file, a diff -- reads better
  // monospaced than as prose.
  return m.startsWith("text/") ? "code" : "markdown";
}

/** The language hint CodeBlock takes, derived from the media type. */
function codeLanguage(mediaType: string | undefined, content: string): string {
  const m = (mediaType ?? "").toLowerCase();
  for (const lang of ["json", "yaml", "xml", "csv", "typescript", "javascript", "go", "python"]) {
    if (m.includes(lang)) return lang;
  }
  const head = content.trimStart();
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "";
}

function Body({ content, mediaType }: { content: string; mediaType?: string }) {
  if (renderKind(mediaType, content) === "code") {
    // CodeBlock takes the language on `className`, the way react-markdown hands
    // it one -- so the same component serves a fenced block in a transcript and
    // a whole body here, with no second code path.
    const lang = codeLanguage(mediaType, content);
    return (
      <CodeBlock code={content} className={lang ? `language-${lang}` : undefined} streaming={false} />
    );
  }
  return <MessageContent content={content} />;
}

export default function MangroveContent({
  content,
  mediaType,
  title,
  subtitle,
  open,
  onClose,
}: {
  content: string;
  mediaType?: string;
  /** Shown as the sheet's heading -- the cell this memory is about. */
  title: string;
  /** Who wrote it and where it travelled. */
  subtitle?: React.ReactNode;
  /** Owned by the card, which is what a reader clicks to get here. */
  open: boolean;
  onClose: () => void;
}) {
  const long = isCut(content);
  const preview = long ? content.split("\n").slice(0, PREVIEW_LINES).join("\n") : content;

  return (
    <>
      <div className="relative">
        <Body content={preview} mediaType={mediaType} />
        {long && (
          // The fade is what says "this is cut" before anything is clicked. A
          // hard edge reads as the content ending there. It fades to `surface`,
          // which is why a card's own background stays `surface` whatever else
          // marks it out.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent"
          />
        )}
      </div>

      <BottomSheet open={open} title={title} subtitle={subtitle} onClose={onClose}>
        <Body content={content} mediaType={mediaType} />
      </BottomSheet>
    </>
  );
}
