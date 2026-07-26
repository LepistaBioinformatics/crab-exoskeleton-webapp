"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Eye,
  EyeOff,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Send,
  SquareCode,
  Table,
  X,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import MessageContent from "@/app/chat/message-content";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// A full-screen-ish modal for composing a rich markdown message: a formatting
// toolbar that wraps/prefixes the selection, a live GFM preview (same renderer
// as the chat), keyboard shortcuts (Esc closes, Ctrl/Cmd+Enter sends). Closing
// saves the text back to the inline composer as a draft; sending fires onSubmit.
export default function MarkdownEditor({
  initialValue,
  lang,
  onClose,
  onSubmit,
}: {
  initialValue: string;
  lang?: string;
  onClose: (draft: string) => void;
  onSubmit: (text: string) => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const [text, setText] = useState(initialValue);
  const [showPreview, setShowPreview] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Run a transform over the current selection and restore focus + selection.
  function edit(fn: (v: string, s: number, e: number) => { v: string; s: number; e: number }) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    const r = fn(v, s, e);
    setText(r.v);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.s, r.e);
    });
  }
  const wrap = (token: string, ph: string) =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || ph;
      return {
        v: v.slice(0, s) + token + sel + token + v.slice(e),
        s: s + token.length,
        e: s + token.length + sel.length,
      };
    });
  const prefixLines = (pfx: string) =>
    edit((v, s, e) => {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const block = v.slice(ls, e) || "";
      const replaced = block
        .split("\n")
        .map((l) => pfx + l)
        .join("\n");
      return { v: v.slice(0, ls) + replaced + v.slice(e), s: ls, e: ls + replaced.length };
    });
  const insert = (snippet: string, selFrom: number, selTo: number) =>
    edit((v, s, e) => ({
      v: v.slice(0, s) + snippet + v.slice(e),
      s: s + selFrom,
      e: s + selTo,
    }));

  const TABLE = "| Col A | Col B |\n| --- | --- |\n| a | b |\n";

  const tools = [
    { icon: Heading, label: t.markdownEditor.tools.heading, run: () => prefixLines("## ") },
    { icon: Bold, label: t.markdownEditor.tools.bold, run: () => wrap("**", "bold") },
    { icon: Italic, label: t.markdownEditor.tools.italic, run: () => wrap("*", "italic") },
    { icon: Code, label: t.markdownEditor.tools.inlineCode, run: () => wrap("`", "code") },
    { icon: SquareCode, label: t.markdownEditor.tools.codeBlock, run: () => insert("```\n\n```", 4, 4) },
    { icon: List, label: t.markdownEditor.tools.bulletedList, run: () => prefixLines("- ") },
    { icon: ListOrdered, label: t.markdownEditor.tools.numberedList, run: () => prefixLines("1. ") },
    { icon: Quote, label: t.markdownEditor.tools.quote, run: () => prefixLines("> ") },
    { icon: Link2, label: t.markdownEditor.tools.link, run: () => insert("[text](url)", 1, 5) },
    { icon: Table, label: t.markdownEditor.tools.table, run: () => insert(TABLE, 0, TABLE.length) },
  ];

  const canSend = text.trim().length > 0;
  function send() {
    if (canSend) onSubmit(text);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onClose(text)}
    >
      <div
        className="flex h-[min(80vh,720px)] w-[min(960px,96vw)] flex-col overflow-hidden rounded-2xl border border-brand/40 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.markdownEditor.aria}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose(text);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-brand/20 px-4 py-2.5">
          <span className="flex-1 font-display text-sm font-semibold text-fg">{t.markdownEditor.heading}</span>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={showPreview ? t.markdownEditor.hidePreview : t.markdownEditor.showPreview}
            title={showPreview ? t.markdownEditor.hidePreview : t.markdownEditor.showPreview}
            onClick={() => setShowPreview((p) => !p)}
          >
            {showPreview ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </IconButton>
          <IconButton variant="ghost" size="sm" aria-label={c.actions.close} title={t.markdownEditor.closeTitle} onClick={() => onClose(text)}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-brand/20 px-2 py-1.5">
          {tools.map((tool) => (
            <IconButton
              key={tool.label}
              variant="ghost"
              size="sm"
              aria-label={tool.label}
              title={tool.label}
              // Keep focus/selection in the textarea for the transform.
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.run}
            >
              <tool.icon size={16} aria-hidden />
            </IconButton>
          ))}
        </div>

        {/* Body: editor + optional live preview */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            lang={lang}
            spellCheck
            placeholder={t.markdownEditor.placeholder}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-fg placeholder:text-fg-muted focus:outline-none"
          />
          {showPreview && (
            <div className="min-h-0 flex-1 overflow-auto border-t border-brand/20 px-4 py-3 md:border-l md:border-t-0">
              {text.trim() ? (
                <MessageContent content={text} />
              ) : (
                <p className="text-sm text-fg-muted">{t.markdownEditor.previewEmpty}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-brand/20 px-4 py-2.5">
          <Button variant="text" size="sm" onClick={() => onClose(text)}>
            {t.markdownEditor.saveDraft}
          </Button>
          <Button variant="filled" size="sm" disabled={!canSend} onClick={send} className="gap-1.5">
            <Send size={15} aria-hidden />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
