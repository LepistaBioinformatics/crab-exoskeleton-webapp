"use client";

import { useEffect, useRef } from "react";
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";

/**
 * A markdown field that renders as it is typed: `## ` becomes a heading, `**x**` bold,
 * `- ` a list, and the value read back out is markdown.
 *
 * MILKDOWN, AND ONLY ITS KIT. It parses and serialises through remark -- the same
 * ecosystem `react-markdown` and `remark-gfm` already render the published post with --
 * so what goes in as markdown comes back out as the markdown it was, which is the whole
 * requirement of a field whose value is stored as text. `@milkdown/react` was left out:
 * it pulls in the batteries-included `crepe` editor, and mounting the kit in an effect
 * is all the React a field this size needs.
 *
 * UNCONTROLLED. ProseMirror owns the document while the field is mounted; `value` is
 * read once, at mount. A caller that needs to replace the text (clearing after a
 * publish) remounts the field with a new `key`.
 *
 * Client-only, through `next/dynamic` at the call site: ProseMirror needs a DOM, and
 * the dynamic import keeps the editor out of every bundle that does not show one.
 */
export default function MarkdownField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The latest handler without re-creating the editor when the caller re-renders.
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let editor: Editor | null = null;
    let disposed = false;
    void Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, value);
        // The label goes on the editable surface itself, which is what a screen
        // reader lands on -- not on the wrapper ProseMirror is mounted into.
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: {
            role: "textbox",
            "aria-multiline": "true",
            ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
          },
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => change.current(markdown));
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .create()
      .then((made) => {
        // Unmounted while it was being made: tear the late arrival down.
        if (disposed) void made.destroy();
        else editor = made;
      });
    return () => {
      disposed = true;
      void editor?.destroy();
    };
    // Mount-time only: see UNCONTROLLED above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`markdown-field relative ${className}`}>
      {/* ProseMirror has no placeholder of its own. Shown while the value is blank,
          under the editable surface, so a click on it lands in the editor. */}
      {placeholder && !value.trim() && (
        <span aria-hidden className="pointer-events-none absolute left-3 top-2 text-sm text-fg-muted">
          {placeholder}
        </span>
      )}
      <div ref={root} />
    </div>
  );
}
