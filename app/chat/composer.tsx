"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  FileArchive,
  FileText,
  Files,
  Image as ImageIcon,
  Maximize2,
  Paperclip,
  Presentation,
  Reply,
  Table2,
  X,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { MEDIA_ACCEPT, MEDIA_CATEGORIES, acceptFor, parseAnexos, type Attachment } from "@/lib/media";
import type { ReplyTo } from "@/app/chat/chat-view";
import MarkdownEditor from "@/app/chat/markdown-editor";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

const MAX_HEIGHT = 200; // ~8 rows, then the field scrolls internally
const MIN_HEIGHT = 44; // a taller resting height so the box feels roomy

const CATEGORY_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  doc: FileText,
  sheet: Table2,
  slides: Presentation,
  archive: FileArchive,
};

interface ComposerProps {
  // Returns true when the send was accepted, so the composer clears its text.
  onSend: (text: string) => boolean;
  // Fired on each keystroke, so a pending (queued) batch can push its send back
  // while the user is still typing.
  onTyping?: () => void;
  // Handle a slash command (text starting with "/"). Returns true when the text
  // was consumed as a command, so the composer clears and nothing is sent.
  onCommand?: (raw: string) => boolean;
  sending: boolean;
  loadingHistory: boolean;
  sessionId: string;
  attachments: Attachment[];
  uploading: boolean;
  attachError: string | null;
  onPickFiles: (files: FileList) => void;
  onRemoveAttachment: (path: string) => void;
  replyTo: ReplyTo | null;
  onCancelReply: () => void;
}

// The signature element: a large, inviting chat box with the send action as a
// circular accent button, plus an attach menu (categories + "Outros") and
// attached-file chips. Owns auto-grow and the autofocus-on-open behavior.
export default function Composer({
  onSend,
  onTyping,
  onCommand,
  sending,
  loadingHistory,
  sessionId,
  attachments,
  uploading,
  attachError,
  onPickFiles,
  onRemoveAttachment,
  replyTo,
  onCancelReply,
}: ComposerProps) {
  const t = useT(chatCopy);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The draft text lives HERE (not in ChatView), so typing re-renders only the
  // composer -- not the whole message list. Cleared only when a send is accepted.
  const [value, setValue] = useState("");
  // "typing" drives the soft pulse; it decays a beat after the last keystroke.
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slash commands act on the current chat instead of sending a message.
  const SLASH = [
    { cmd: "/rename", hint: "rename this chat — /rename <new title>" },
    { cmd: "/tag", hint: "tag this chat — /tag <name> [value] [#color]" },
  ];

  function submit() {
    const v = value;
    // A leading "/" is a command, not a message.
    if (v.trim().startsWith("/") && onCommand) {
      if (onCommand(v)) setValue("");
      return;
    }
    if (onSend(v)) setValue("");
  }

  function markTyping() {
    onTyping?.();
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 900);
  }
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );

  // While the user is typing the command name (a leading "/", no space yet),
  // surface the matching commands as a hint menu the keyboard can drive.
  const slashQuery = value.startsWith("/") && !value.includes(" ") ? value.toLowerCase() : null;
  const slashMatches = slashQuery ? SLASH.filter((s) => s.cmd.startsWith(slashQuery)) : [];
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashHidden, setSlashHidden] = useState(false);
  const slashOpen = slashMatches.length > 0 && !slashHidden;
  // Reset the highlight whenever the query (menu contents) changes.
  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  function pickSlash(cmd: string) {
    setValue(`${cmd} `);
    ref.current?.focus();
  }
  // Touch devices have no Shift key, so Enter must stay a newline there (send is
  // the button); only fine-pointer (desktop) gets Enter-to-send + the hint.
  const [coarsePointer, setCoarsePointer] = useState(false);
  // The field follows the browser locale so spell-check uses the matching
  // dictionary; no in-app language switch (that's a browser-side setting).
  const [locale, setLocale] = useState<string | undefined>(undefined);
  useEffect(() => {
    setCoarsePointer(window.matchMedia?.("(pointer: coarse)").matches ?? false);
    setLocale(navigator.language);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT))}px`;
  }, [value]);

  useEffect(() => {
    if (!loadingHistory) ref.current?.focus();
  }, [sessionId, loadingHistory]);

  // Picking a message to reply to drops the cursor straight into the field.
  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const replyPreview = replyTo
    ? parseAnexos(replyTo.content).text.replace(/\s+/g, " ").trim()
    : "";

  // `sending` deliberately does NOT block a send. A running turn used to lock
  // the composer, so a user who thought of a second message had to wait out the
  // whole reply; now it queues behind the turn in flight.
  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !loadingHistory && !uploading;

  // Open the OS picker filtered to `accept`, then let onChange handle the files.
  function pick(accept: string) {
    setMenuOpen(false);
    const el = fileRef.current;
    if (!el) return;
    el.accept = accept;
    el.click();
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {attachError && (
        <div className="mb-2">
          <Alert severity="error">{attachError}</Alert>
        </div>
      )}

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-brand bg-elevated px-3 py-1.5">
          <Reply size={14} className="shrink-0 text-fg-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-fg">
              {t.composer.replyingToBefore}
              {replyTo.role === "user" ? t.composer.replyingToUser : t.composer.replyingToAgent}
            </div>
            <div className="truncate text-xs text-fg-muted">
              {replyPreview || t.composer.replyNoText}
            </div>
          </div>
          <button
            type="button"
            aria-label={t.composer.cancelReply}
            onClick={onCancelReply}
            className="shrink-0 text-fg-muted transition-colors hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {(attachments.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.path}
              className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-elevated px-2 py-1 text-xs text-fg"
            >
              <Paperclip size={12} aria-hidden />
              <span className="max-w-[160px] truncate">{a.name}</span>
              <button
                type="button"
                aria-label={`${t.composer.removeAttachment} ${a.name}`}
                onClick={() => onRemoveAttachment(a.path)}
                className="text-fg-muted transition-colors hover:text-fg"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          {uploading && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-elevated px-2 py-1 text-xs text-fg-muted">
              <Spinner size={12} /> Uploading…
            </span>
          )}
        </div>
      )}

      {slashOpen && (
        <div
          className="mb-2 overflow-hidden rounded-xl border border-accent/40 bg-surface shadow-lg"
          role="listbox"
          aria-label={t.composer.slashCommands}
        >
          {slashMatches.map((s, i) => (
            <button
              key={s.cmd}
              type="button"
              role="option"
              aria-selected={i === slashIndex}
              // Keep pointer focus in the textarea so keyboard nav still works.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => pickSlash(s.cmd)}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors ${
                i === slashIndex ? "bg-accent/15" : "hover:bg-elevated"
              }`}
            >
              <span className="font-mono text-sm font-semibold text-accent">{s.cmd}</span>
              <span className="text-xs text-fg-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={`flex flex-col gap-2 rounded-2xl border border-accent/40 bg-elevated px-4 pt-4 pb-3 shadow-lg transition-[border-color,box-shadow] focus-within:border-[2.5px] focus-within:border-accent${
          typing ? " composer-typing" : ""
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <Textarea
          // Remount when the locale resolves so the browser reads `lang` and
          // picks the matching spell-check dictionary.
          key={locale || "auto"}
          ref={ref}
          rows={1}
          lang={locale}
          spellCheck
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSlashHidden(false);
            markTyping();
          }}
          onKeyDown={(e) => {
            // When the slash menu is open, the keyboard drives it: arrows move
            // the highlight, Enter picks, Escape dismisses.
            if (slashOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => (i + 1) % slashMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashHidden(true);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                pickSlash(slashMatches[slashIndex].cmd);
                return;
              }
            }
            // Enter sends everywhere, touch included. It used to insert a
            // newline on a coarse pointer, on the reasoning that a soft
            // keyboard has no usable Shift+Enter -- but the far more common
            // intent is to send, and a stray newline where a send was meant is
            // the worse failure. Multi-line composing on touch is still
            // available through the advanced markdown editor.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) submit();
            }
          }}
          placeholder={coarsePointer ? t.composer.placeholder : t.composer.placeholderHint}
          className="max-h-[200px] py-1.5 text-base leading-relaxed"
        />

        {/* Toolbar row inside the box, below the textarea: utilities on the
            left, Send on the right. Popovers open upward (bottom-full). */}
        <div className="mt-1 flex items-center gap-1">
        <div className="relative">
          <IconButton
            variant="ghost"
            size="md"
            aria-label={t.composer.attach}
            title={t.composer.attach}
            disabled={loadingHistory}
            onClick={() => setMenuOpen((o) => !o)}
            className="shrink-0"
          >
            <Paperclip size={20} aria-hidden />
          </IconButton>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-brand bg-surface p-1 shadow-xl">
                {MEDIA_CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_ICON[cat.key] ?? Files;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => pick(acceptFor(cat.exts))}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
                    >
                      <Icon size={16} className="shrink-0 text-fg-muted" aria-hidden />
                      {cat.label}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-brand/20" />
                <button
                  type="button"
                  onClick={() => pick(MEDIA_ACCEPT)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
                >
                  <Files size={16} className="shrink-0 text-fg-muted" aria-hidden />
                  {t.composer.otherTypes}
                </button>
              </div>
            </>
          )}
        </div>

        <IconButton
          variant="ghost"
          size="md"
          aria-label={t.composer.advancedEditor}
          title={t.composer.advancedEditor}
          disabled={loadingHistory}
          onClick={() => setAdvancedOpen(true)}
          className="shrink-0"
        >
          <Maximize2 size={20} aria-hidden />
        </IconButton>

        <div className="flex-1" />

        <IconButton
          variant="filled"
          size="md"
          aria-label={t.composer.send}
          disabled={!canSend}
          onClick={submit}
          className="shrink-0"
        >
          <ArrowUp size={20} aria-hidden />
        </IconButton>
      </div>
      </div>

      {advancedOpen && (
        <MarkdownEditor
          initialValue={value}
          lang={locale}
          onClose={(draft) => {
            setValue(draft);
            setAdvancedOpen(false);
            ref.current?.focus();
          }}
          onSubmit={(md) => {
            if (onSend(md)) {
              setValue("");
              setAdvancedOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}
