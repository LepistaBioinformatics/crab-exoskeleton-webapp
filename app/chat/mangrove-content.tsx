"use client";

import { useState } from "react";
import MessageContent from "./message-content";
import CodeBlock from "./code-block";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

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

/** Above this many lines, the card shows a preview and a way in. */
const PREVIEW_LINES = 8;

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
}: {
  content: string;
  mediaType?: string;
  /** Shown as the sheet's heading -- the cell this memory is about. */
  title: string;
  /** Who wrote it and where it travelled. */
  subtitle?: React.ReactNode;
}) {
  const t = useT(chatCopy);
  const [open, setOpen] = useState(false);

  const lines = content.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const preview = long ? lines.slice(0, PREVIEW_LINES).join("\n") : content;

  return (
    <>
      <div className="relative">
        <Body content={preview} mediaType={mediaType} />
        {long && (
          // The fade is what says "this is cut" before the button is read. A
          // hard edge reads as the content ending there.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent"
          />
        )}
      </div>

      {long && (
        <Button className="mt-1" size="sm" variant="text" onClick={() => setOpen(true)}>
          {t.mangrove.showMore}
        </Button>
      )}

      <BottomSheet open={open} title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
        <Body content={content} mediaType={mediaType} />
      </BottomSheet>
    </>
  );
}
