"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import {
  ArrowUp,
  CalendarClock,
  FileArchive,
  FileText,
  Files,
  GitBranch,
  Image as ImageIcon,
  Maximize2,
  Network,
  Paperclip,
  Presentation,
  Reply,
  Square,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/ui/icon-button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { MEDIA_ACCEPT, MEDIA_CATEGORIES, acceptFor, parseAnexos, type Attachment } from "@/lib/media";
import {
  applyMention,
  filterCandidates,
  mentionQueryAt,
  type MentionCandidate,
} from "@/lib/fileMentions";
import type { ReplyTo } from "@/app/chat/chat-view";
import { referenceChip, type ChatReference } from "@/lib/chatReference";
import MarkdownEditor from "@/app/chat/markdown-editor";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

/**
 * One icon per reference kind, keyed by the kind rather than chosen with a ternary.
 *
 * A ternary defaulted every unknown kind to the scheduled-task calendar, so a graph entity arrived
 * in the composer wearing a clock. A record over the union means a new kind fails to typecheck
 * until it has an icon, instead of silently borrowing the wrong one.
 */
const REFERENCE_ICON: Record<ChatReference["kind"], typeof CalendarClock> = {
  task: CalendarClock,
  run: CalendarClock,
  span: GitBranch,
  entity: Network,
};

// A context chip's accent, the only thing that differs between the two kinds.
const contextChip = cva(
  "mb-2 flex items-center gap-2 rounded-lg border-l-2 bg-elevated px-3 py-1.5",
  {
    variants: { tone: { reply: "border-brand", task: "border-accent" } },
    defaultVariants: { tone: "reply" },
  },
);

// How many files the `@` menu shows at once. A workspace can hold hundreds, and a
// list longer than this is not scanned, it is scrolled past — narrowing the query is
// faster than reading it.
const MENTION_LIMIT = 8;

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
  /**
   * Stop the running turn. Resolves to the text that will never be answered —
   * picoclaw's abort deletes the member's message along with the turn, so it goes
   * back into the box rather than being lost. Null when there was nothing to
   * restore.
   */
  onStop?: () => Promise<string | null>;
  /** A stop is in flight; the control waits rather than being pressed twice. */
  stopping?: boolean;
  loadingHistory: boolean;
  sessionId: string;
  attachments: Attachment[];
  uploading: boolean;
  attachError: string | null;
  onPickFiles: (files: FileList) => void;
  onRemoveAttachment: (path: string) => void;
  replyTo: ReplyTo | null;
  onCancelReply: () => void;
  /** What the next message will carry besides the prose — see lib/chatReference. */
  chatRef: ChatReference | null;
  onCancelChatRef: () => void;
  /**
   * Workspace files `@` can reference. Owned by ChatView because it also resolves
   * what was typed against the same list at send time — the menu and the resolution
   * must not disagree about what exists.
   */
  mentionFiles: MentionCandidate[];
}

// The signature element: a large, inviting chat box with the send action as a
// circular accent button, plus an attach menu (categories + "Outros") and
// attached-file chips. Owns auto-grow and the autofocus-on-open behavior.
export default function Composer({
  onSend,
  onTyping,
  onCommand,
  sending,
  onStop,
  stopping = false,
  loadingHistory,
  sessionId,
  attachments,
  uploading,
  attachError,
  onPickFiles,
  onRemoveAttachment,
  replyTo,
  onCancelReply,
  chatRef,
  onCancelChatRef,
  mentionFiles,
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
    { cmd: "/rename", hint: "alias this chat — /rename <alias>, empty clears it" },
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
  // The `@` menu. Same shape as the slash menu above — a derived match list, a
  // highlight index, and a dismissed flag — because it is the same interaction and a
  // second idiom for it would be a second set of keyboard bugs.
  //
  // Driven off the CARET, not the whole value: `@` earlier in a finished sentence must
  // not reopen the menu when the member goes back to edit somewhere else.
  const [caret, setCaret] = useState(0);
  const mentionQuery = mentionQueryAt(value, caret);
  const [mentionHidden, setMentionHidden] = useState(false);
  const mentionMatches =
    mentionQuery === null ? [] : filterCandidates(mentionFiles, mentionQuery).slice(0, MENTION_LIMIT);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionOpen = mentionMatches.length > 0 && !mentionHidden;
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function pickMention(name: string) {
    const next = applyMention(value, caret, name);
    setValue(next.text);
    setMentionHidden(false);
    // The caret has to be restored explicitly: React re-renders the textarea with new
    // text and the browser would otherwise park the cursor at the end, which is wrong
    // when the mention was inserted mid-sentence.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
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

  // Opening a conversation puts the cursor in the field, so the member can start
  // typing without clicking.
  //
  // `locale` is a dependency because the field is KEYED on it (see the Textarea): the
  // mount effect above resolves navigator.language a tick later, which changes the key
  // and makes React replace the DOM node. This effect had already focused the node
  // being discarded, and without `locale` here it never re-ran — so the composer lost
  // focus on every mount, which is exactly what opening a chat does.
  useEffect(() => {
    if (!loadingHistory) ref.current?.focus();
  }, [sessionId, loadingHistory, locale]);

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

  // Stop appears BESIDE Send, not in place of it. Replacing Send would undo the
  // decision `sending` records above: a member who thinks of a second message
  // while the agent works can queue it instead of waiting the turn out, and
  // taking the button away would leave that to the Enter key alone. Ghost against
  // Send's filled, so the primary action stays the one that isn't destructive.
  const showStop = sending && !!onStop;

  async function stop() {
    if (!onStop || stopping) return;
    const restored = await onStop();
    if (restored === null) return;
    // Appended ahead of anything typed while the turn ran: the stopped message
    // came first, and silently overwriting a newer draft would lose it.
    setValue((v) => (v.trim() === "" ? restored : `${restored}\n\n${v}`));
    ref.current?.focus();
  }

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
        <ContextChip
          Icon={Reply}
          tone="reply"
          title={`${t.composer.replyingToBefore}${
            replyTo.role === "user" ? t.composer.replyingToUser : t.composer.replyingToAgent
          }`}
          preview={replyPreview || t.composer.replyNoText}
          cancelLabel={t.composer.cancelReply}
          onCancel={onCancelReply}
        />
      )}

      {chatRef && (
        <ContextChip
          Icon={REFERENCE_ICON[chatRef.kind]}
          tone="task"
          {...referenceChip(chatRef, t)}
          cancelLabel={t.scheduledTasks.cancelReference}
          onCancel={onCancelChatRef}
        />
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

      {/* Anchored above the box like the slash menu, and never at the same time as it:
          a slash command is the first character of the message and a mention never is,
          so the two queries cannot both be active. */}
      {mentionOpen && (
        <div
          className="mb-2 max-h-64 overflow-y-auto rounded-xl border border-accent/40 bg-surface shadow-lg"
          role="listbox"
          aria-label={t.composer.mentionFiles}
        >
          {mentionMatches.map((f, i) => (
            <button
              key={f.path}
              type="button"
              role="option"
              aria-selected={i === mentionIndex}
              // Keep pointer focus in the textarea so keyboard nav still works.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setMentionIndex(i)}
              onClick={() => pickMention(f.name)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                i === mentionIndex ? "bg-accent/15" : "hover:bg-elevated"
              }`}
            >
              <Paperclip size={13} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="truncate font-mono text-xs text-fg">{f.name}</span>
            </button>
          ))}
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
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setSlashHidden(false);
            setMentionHidden(false);
            markTyping();
          }}
          // Clicking or arrowing to a different spot changes which mention (if any)
          // the caret is in, and neither fires onChange.
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            // The `@` menu takes the keyboard first, on the same contract as the slash
            // menu below: arrows move, Enter picks, Escape dismisses without sending.
            if (mentionOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionHidden(true);
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
                e.preventDefault();
                pickMention(mentionMatches[mentionIndex].name);
                return;
              }
            }
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

        {showStop && (
          <IconButton
            variant="ghost"
            size="md"
            aria-label={stopping ? t.composer.stopping : t.composer.stop}
            title={stopping ? t.composer.stopping : t.composer.stop}
            disabled={stopping}
            onClick={() => void stop()}
            className="shrink-0"
          >
            <Square size={16} fill="currentColor" aria-hidden />
          </IconButton>
        )}

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

// A context slot shown above the field: what the next message will carry besides the
// prose the member types. One component for the reply quote and the scheduled-task
// reference, which were written as separate clones of the same markup.
function ContextChip({
  Icon,
  tone,
  title,
  preview,
  cancelLabel,
  onCancel,
}: {
  Icon: LucideIcon;
  tone: "reply" | "task";
  title: string;
  preview: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className={contextChip({ tone })}>
      <Icon size={14} className="shrink-0 text-fg-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-fg">{title}</div>
        <div className="truncate text-xs text-fg-muted">{preview}</div>
      </div>
      <button
        type="button"
        aria-label={cancelLabel}
        title={cancelLabel}
        onClick={onCancel}
        className="shrink-0 text-fg-muted transition-colors hover:text-fg"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
