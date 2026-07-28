"use client";

import { useEffect, useState } from "react";
import {
  canonicalLanguage,
  highlight,
  isReady,
  isUnsupported,
  loadLanguage,
} from "@/lib/code-highlight";

// One fenced code block in a message.
//
// Read-only by nature, so there is no overlay and no textarea here — highlight.js
// hands back HTML and this injects it. That is safe because highlight.js ESCAPES the
// code it is given (`<script>` comes back as `&lt;script&gt;`), which is the
// security boundary of this feature and is asserted by a test rather than trusted.
//
// The un-highlighted path renders the code as React CHILDREN, never as innerHTML, so
// a block that is streaming, of an unknown language, or of a grammar that has not
// arrived yet cannot inject anything either.
export default function CodeBlock({
  code,
  className,
  streaming,
}: {
  code: string;
  className?: string;
  /** True while the reply is still being revealed — see the note below. */
  streaming: boolean;
}) {
  const language = canonicalLanguage(className);

  // Re-render when a grammar finishes loading. The value is only a nudge; the
  // highlighter's own state is the source of truth.
  const [, setLoaded] = useState(0);

  useEffect(() => {
    // Nothing is loaded during a reveal, so a long reply does not spend its
    // re-render budget fetching grammars for text that is still arriving.
    if (!language || streaming) return;
    if (isReady(language) || isUnsupported(language)) return;
    let live = true;
    void loadLanguage(language).then(() => {
      if (live) setLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [language, streaming]);

  // Highlighting is skipped WHILE REVEALING, and this is the load-bearing decision
  // of the feature rather than an optimization.
  //
  // The reveal re-renders the assistant band up to REVEAL_MAX_STEPS (60) times, and
  // turn-store.ts documents why that ceiling exists at all: every step re-parses the
  // whole revealed markdown, so the cost is already O(n²) in the reply's length and
  // was once slow enough that the reveal could not keep its own cadence. A 200-line
  // TypeScript block measures 7.8ms per highlight — ~470ms of extra main-thread work
  // per turn, per block, spent on text that is still being written.
  const html = !streaming && language ? highlight(code, language) : null;

  if (html === null) {
    return <code className={className}>{code}</code>;
  }
  return <code className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
