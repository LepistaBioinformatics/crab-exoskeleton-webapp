"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { cva } from "class-variance-authority";
import { highlight, isReady, isUnsupported, loadLanguage } from "@/lib/code-highlight";
import { splitHighlightedLines } from "./code-lines";

/**
 * One type declaration for the whole pane, in ABSOLUTE units.
 *
 * It was two, once — `text-[0.85em]` on the gutter's own element and the same `0.85em`
 * on the `<code>` beside it — which reads like the same size and is not: a block's line
 * boxes are at least as tall as its strut, and the strut follows the block's own
 * font-size, so the code column's lines stayed 15% taller than its numbers and the
 * columns drifted apart down the file. Declared once, on the container both inherit from,
 * so there is nothing left to keep in step (preview-line-numbers DEC-5).
 */
export const CODE_TYPE = "font-mono text-[13px] leading-[20px]";

// A ROW PER SOURCE LINE, and that is the change wrapping required.
//
// The numbers used to be a sibling `<pre>` (`preview-plain-text-fallback` DEC-2): two
// blocks of the same type, aligned by construction because each line occupied exactly
// one row in both. Wrapping breaks that premise outright — a line broken into three rows
// sits beside one number, and everything below it is off by two. Putting the number and
// its line in the same grid row means the correspondence is structural instead of
// arithmetic, and it holds however many rows the line takes.
//
// What DEC-2 was avoiding is `code-lines.ts`'s job now: highlight.js hands back spans
// that cross newlines, and splitting them is only safe if the open ones are closed at the
// break and reopened after it.
const grid = cva("grid items-start", {
  variants: {
    wrap: {
      // The code column is the pane's width, so a long line breaks inside it.
      true: "grid-cols-[auto_1fr]",
      // The code column is as wide as its widest line, so the pane scrolls sideways
      // and `sticky left-0` on the numbers is what keeps them in view.
      false: "grid-cols-[auto_max-content]",
    },
  },
  defaultVariants: { wrap: false },
});

// Mutually exclusive values of ONE variant, never two classes of the same property on one
// element: `whitespace-pre` and `whitespace-pre-wrap` together are resolved by the order
// Tailwind emits them, which is invisible to tsc and to any behavioural test.
const codeCell = cva("px-3", {
  variants: {
    wrap: {
      // `break-words` and not `break-all`: a 300-character URL with no space in it has
      // to break somewhere, and everything shorter should still break between words.
      true: "whitespace-pre-wrap break-words",
      false: "whitespace-pre",
    },
  },
  defaultVariants: { wrap: false },
});

/**
 * The preview's numbered code area.
 *
 * Separate from `CodeBlock`, which renders a fenced block in a message: that one is
 * deliberately unnumbered (a four-line snippet has no line to refer to) and never wraps
 * its own frame. This is a FILE, where the number is how a member says where something is
 * — to a colleague, or back to the agent.
 */
export default function CodePane({
  code,
  language,
  wrap,
}: {
  code: string;
  /** A canonical grammar name, or null to render the file unhighlighted. */
  language: string | null;
  wrap: boolean;
}) {
  // Re-render when a grammar finishes loading. The value is a nudge; the highlighter's
  // own state is the source of truth.
  const [, setLoaded] = useState(0);

  useEffect(() => {
    if (!language) return;
    if (isReady(language) || isUnsupported(language)) return;
    let live = true;
    void loadLanguage(language).then(() => {
      if (live) setLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [language]);

  const html = language ? highlight(code, language) : null;

  // A trailing newline terminates the last line rather than opening an empty one, so it
  // is dropped before the split — keeping it would number a row that paints nothing.
  const lines = useMemo(() => {
    const body = code.replace(/\n$/, "");
    if (html === null) return body.split("\n");
    return splitHighlightedLines(html.replace(/\n$/, ""));
  }, [html, code]);

  return (
    <div className={`m-3 overflow-x-auto rounded-lg bg-elevated text-fg ${CODE_TYPE}`}>
      {/* The pane's vertical padding is on the FIRST and LAST row rather than on this
          container: the gutter's rule is drawn by the number cells, so padding outside
          them would leave the line broken for 12px at each end. `-n+2` is the first row's
          two cells, and the mirror is the last row's. */}
      <div
        className={`${grid({ wrap })} [&>*:nth-child(-n+2)]:pt-3 [&>*:nth-last-child(-n+2)]:pb-3`}
      >
        {lines.map((line, i) => (
          <Fragment key={i}>
            {/* THE NUMBER IS DRAWN, NOT WRITTEN. It is `content: attr(data-line)` on a
                pseudo-element, so it exists in no text node at all — which is what keeps
                a selection dragged down the file paste as the code and nothing else.
                `user-select: none` alone would have been a promise about three browsers'
                clipboard behaviour; generated content is not part of the document's text
                in any of them. The attribute carries the value, so the correspondence is
                still there to read — for a test, and for anyone inspecting the pane. */}
            <span
              aria-hidden
              data-line={i + 1}
              className="sticky left-0 z-10 select-none border-r border-rule bg-elevated px-3 text-right text-fg-muted before:content-[attr(data-line)]"
            />
            {/* The un-highlighted path renders the line as React CHILDREN, never as
                innerHTML, so a file of an unknown grammar cannot inject anything. The
                highlighted path is HTML that highlight.js has already escaped. */}
            {html === null ? (
              <code className={codeCell({ wrap })}>{line}</code>
            ) : (
              <code
                className={codeCell({ wrap })}
                dangerouslySetInnerHTML={{ __html: line }}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
