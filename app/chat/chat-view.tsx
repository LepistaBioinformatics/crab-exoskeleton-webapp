"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createConversation,
  listConversations,
  touchConversation,
  syncSessionRefs,
  notifyConversationsUpdated,
  renameConversation,
  upsertTag,
  type ConversationSummary,
} from "@/lib/chatSession";
import MessageContent from "@/app/chat/message-content";
import Composer from "@/app/chat/composer";
import { cva } from "class-variance-authority";
import { Bot, KeyRound, PanelRight, Reply, User } from "lucide-react";
import { setFragmentSid, historyQuery, useFragment, type Workspace } from "@/app/chat/fragment";
import ViewModeToggle from "@/app/chat/view-mode-toggle";
import SecretsDrawer from "@/app/chat/secrets-drawer";
import UploadsSidebar from "@/app/chat/uploads-sidebar";
import AttachmentButton from "@/app/chat/attachment-button";
import { uploadMedia, parseAnexos, type Attachment } from "@/lib/media";
import { buildReferenceMarker, type ChatReference } from "@/lib/chatReference";
import { TagChip } from "@/app/chat/conversation-enrichment";
import { CopyButton } from "@/components/ui/copy-button";
import { Alert } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/context";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import {
  MAX_SEND_ATTEMPTS,
  bumpFlush as storeBumpFlush,
  clearCompleted,
  enqueue as storeEnqueue,
  noteUpload,
  parkFlush,
  setPainter,
  useTurn,
} from "@/app/chat/turn-store";
import TurnProgress from "@/app/chat/turn-progress";

// Bands stretch the full width of the message area; the message content itself
// stays centered at the composer width (an inner max-w wrapper in the render).
// No borders, no origin bars: the agent's messages carry no background at all,
// while the user's sit on a faint accent tint. Both speakers share the same
// text color (neutral in light mode, a soft warm gray in dark).
const messageBand = cva("group relative w-full text-fg dark:text-[#c9c7be] [container-type:inline-size]", {
  variants: {
    role: {
      // Vertical padding is applied per-message in the render (bandPad) since it
      // depends on whether the message stands alone between the other speaker's.
      user: "bg-accent/8",
      assistant: "",
    },
  },
});

// A small gap only when the speaker changes (distinct blocks); consecutive
// same-speaker messages touch (no gap) so a run reads as one continuous block.
const bandGap = cva("", {
  variants: { changed: { true: "mt-1", false: "mt-0" } },
  defaultVariants: { changed: false },
});

// Band vertical padding, shared by both roles: roomy in a same-speaker run,
// roomier still when a message stands alone between the other speaker's
// messages. (Applied to the agent's bands too, matching the user's.)
const bandPad = (standalone: boolean) => (standalone ? "py-10" : "py-6");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

// A message the composer is quoting (Telegram-style reply). Pico is text-only
// and the transcript is reloaded from picoclaw, so a reply is carried as a
// markdown blockquote embedded in the sent message -- it persists and gives the
// agent the referenced context.
export interface ReplyTo {
  role: "user" | "assistant";
  content: string;
}

const QUOTE_MAX = 280;

// Turns the referenced message into a one-line attributed blockquote. Anexo
// refs are stripped (only the prose is quoted) and newlines collapsed so the
// quote stays a single tidy `>` line regardless of the original's length.
function buildQuote(reply: ReplyTo, t: ChatDict): string {
  const who = reply.role === "user" ? t.view.quoteUser : t.view.quoteAgent;
  const { text } = parseAnexos(reply.content);
  const oneLine = text.replace(/\s+/g, " ").trim();
  const snippet = oneLine.length > QUOTE_MAX ? `${oneLine.slice(0, QUOTE_MAX - 1)}…` : oneLine;
  return `> **${who}:** ${snippet}`;
}

// Turn state -- the send queue, the in-flight status, the retry ladder and the
// reveal buffer -- lives in `turn-store`, keyed by conversation id at module
// scope. It cannot live in this component: it resets on every `sid` change and
// unmounts entirely on a workspace change (chat-shell.tsx keys it on t|s|r),
// which is exactly why a running turn's indicator used to vanish the moment you
// switched chats. See app/chat/turn-store.ts.

export default function ChatView({
  workspace,
  subscription,
  chatRef,
  onChatRef,
  sessionId,
  onRestartNeeded,
}: {
  workspace: Workspace;
  /**
   * The subscription this workspace belongs to. Null while the tree is loading, and for
   * a subscription with no name of its own — in which case the agent takes the line
   * alone rather than being demoted under a uuid.
   */
  subscription: string | null;
  /**
   * The composer's context slot, owned by the shell — see chat-shell. A reference picked
   * in Canvas has to outlive the view it was picked from, and this component is exactly
   * what Canvas replaces.
   */
  chatRef: ChatReference | null;
  onChatRef: (ref: ChatReference | null) => void;
  sessionId: string | undefined;
  // Forwarded to the secrets drawer: a saved secret now needs an explicit
  // restart (restart-control DEC-3), and the banner above lives in the shell.
  onRestartNeeded?: () => void;
}) {
  const t = useT(chatCopy);
  const err = useT(errorCopy);
  const router = useRouter();
  const fragment = useFragment();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [mediaRefresh, setMediaRefresh] = useState(0);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  // Everything about the turn in flight for THIS conversation, read from the
  // module-scope store -- so it is still here when you come back from another
  // chat, or another workspace (which remounts this component).
  const turn = useTurn(sessionId);
  const { pending, queue, running: sending, retrying, error, revealed, progress, settling } = turn;
  // Transient feedback for slash commands (/rename, /tag).
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (kind: "ok" | "error", text: string) => {
    setNotice({ kind, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };
  // On touch (no hover), tapping a message opens its action row below the card;
  // holds the index of the message whose actions are open (mobile only).
  const [openActions, setOpenActions] = useState<number | null>(null);
  // When the current conversation is empty, the most-recent OTHER conversation
  // (if the user has one) is offered as a "resume where you left off" card.
  const [resumeCandidate, setResumeCandidate] = useState<ConversationSummary | null>(null);

  // The uploads panel is a permanent right column; remember whether it's open.
  useEffect(() => {
    setFilesOpen(localStorage.getItem("chat-files-open") === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("chat-files-open", filesOpen ? "1" : "0");
  }, [filesOpen]);

  // Find the most-recent conversation other than the current one, skipping
  // freshly-minted empty chats, so an empty conversation can offer to resume a
  // real previous one. Re-runs when the workspace or selected session changes.
  useEffect(() => {
    let alive = true;
    listConversations(workspace)
      .then((list) => {
        if (!alive) return;
        const candidate = list
          .filter((c) => c.id !== sessionId)
          // "New chat" is the API's default title, matched as data -- never translated.
          .filter((c) => !(c.title === "New chat" && !c.alias && c.tags.length === 0))
          .reduce<ConversationSummary | null>(
            (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
            null,
          );
        setResumeCandidate(candidate);
      })
      .catch(() => {
        if (alive) setResumeCandidate(null);
      });
    return () => {
      alive = false;
    };
  }, [workspace.t, workspace.s, workspace.r, sessionId]);

  // Chat-style scroll: a brand new message pins its *top* into view (so a long
  // reply can be read from the start while it's still streaming), while the
  // very first load of a conversation jumps to the most recent message.
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  // The newest thing the user just sent -- the last pending bubble, or the
  // in-flight turn's message once the burst flushes. It is pinned to the TOP of
  // the viewport rather than the bottom: at the bottom it lands under the
  // floating composer, and the reply then grows downward off-screen. At the top
  // the message stays visible and the answer fills the space beneath it.
  const newestSentRef = useRef<HTMLDivElement | null>(null);
  const creatingSid = useRef(false);

  // Always mirrors the currently-viewed session, so an in-flight stream can
  // tell whether the user is still looking at the conversation the reply
  // belongs to before it touches the (single, shared) messages state.
  const activeSidRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    activeSidRef.current = sessionId;
  }, [sessionId]);
  // The sid shown before the current one, so its debounce can be parked when we
  // switch away.
  const previousSidRef = useRef<string | undefined>(sessionId);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // A valid workspace with no `sid` (direct nav) gets a fresh conversation (id
  // minted server-side, so it also lands in the sidebar) instead of losing the
  // chosen workspace.
  useEffect(() => {
    if (!sessionId && !creatingSid.current) {
      creatingSid.current = true;
      createConversation(workspace)
        .then((conversation) => setFragmentSid(conversation.id))
        .finally(() => {
          creatingSid.current = false;
        });
    }
  }, [workspace, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    // NOTHING owned by turn-store is reset here. The turn status, send queue,
    // retry counter, error and reveal buffer all belong to the CONVERSATION,
    // not to this component -- clearing them on a sid change is precisely the
    // bug that made a running turn look like it had never been sent. Only
    // genuinely composer-scoped state is dropped: attachments and a reply draft
    // belong to the composer you were typing in.
    setAttachments([]);
    setAttachError(null);
    setReplyTo(null);
    setOpenActions(null);
    setLoadingHistory(true);

    // Park the previous conversation's debounce without sending it: the burst
    // stays in the store, and its countdown resumes only when the user
    // re-engages (types or sends) -- never just from looking at the chat.
    parkFlush(previousSidRef.current);
    previousSidRef.current = sessionId;

    let cancelled = false;
    (async () => {
      try {
        const query = historyQuery(workspace, sessionId);
        const res = await fetch(`/api/chat/${workspace.r}/history?${query}`);
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        const loaded = Array.isArray(data.messages) ? data.messages : [];
        setMessages(loaded);
        // A turn that finished while we were away left its in-flight bands in
        // the store (the completion hook only reloads for the conversation on
        // screen). The transcript we just loaded already contains that reply --
        // without this the user sees it twice, once from history and once from
        // the stale band. Also clears a turn that died while we were elsewhere,
        // which would otherwise strand a phantom message forever.
        clearCompleted(sessionId);
        // Opening a conversation lands on the most recent message -- UNLESS a
        // scroll anchor is set (a past point clicked in the tree view), which the
        // anchor effect below handles instead.
        const hasAnchor = new URLSearchParams(window.location.hash.slice(1)).get("msg");
        if (loaded.length > 0 && !hasAnchor) {
          requestAnimationFrame(() => setScrollToIndex(loaded.length - 1));
        }
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r, sessionId, router]);

  useEffect(() => {
    if (scrollToIndex === null) return;
    messageRefs.current[scrollToIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex]);

  // Every time the user sends something, pin it to the TOP of the viewport --
  // both while it is a pending bubble and again when it becomes the in-flight
  // turn. `block: "start"` is the whole point: scrolled to the bottom the new
  // message sits behind the floating composer, and the reply then grows
  // downward out of sight. The trailing spacer below guarantees there is always
  // room to push it up there, even in a short conversation.
  //
  // rAF because the band mounts in the same commit that fires this effect; the
  // browser needs the new layout before scrollIntoView can land on it.
  useEffect(() => {
    if (pending.length === 0 && turn.activeUserMessage === null) return;
    const frame = requestAnimationFrame(() => {
      newestSentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pending.length, turn.activeUserMessage]);

  // Scroll anchor: when the fragment carries a `msg` (a message's created_at,
  // set by clicking a past point in the tree view), scroll to that message once
  // the target conversation's history is loaded, then strip the anchor. A ref
  // guards it so it fires exactly once per anchor -- a later send (which mutates
  // `messages`) must not re-jump to the old point. Handles the
  // same-conversation case too (the history-load effect doesn't re-run when only
  // `msg` changes).
  const anchorMsg = fragment?.msg;
  const consumedAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (!anchorMsg || messages.length === 0) return;
    if (consumedAnchor.current === anchorMsg) return;
    const idx = messages.findIndex((m) => m.created_at === anchorMsg);
    if (idx < 0) return; // target conversation's messages not loaded yet
    consumedAnchor.current = anchorMsg;
    requestAnimationFrame(() => setScrollToIndex(idx));
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("msg") === anchorMsg) {
      params.delete("msg");
      window.history.replaceState(null, "", `#${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorMsg, messages]);

  // Reloads a conversation's transcript from picoclaw -- used to reconcile a
  // reply that finished after the user had navigated away and back.
  async function reloadHistory(sid: string) {
    try {
      const res = await fetch(`/api/chat/${workspace.r}/history?${historyQuery(workspace, sid)}`);
      if (!res.ok) return;
      const data = await res.json();
      const loaded = Array.isArray(data.messages) ? data.messages : [];
      if (activeSidRef.current === sid) setMessages(loaded);
    } catch {
      // leave whatever is on screen
    }
  }

  async function uploadFiles(files: FileList) {
    setAttachError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadMedia(workspace, file);
        setAttachments((prev) => [...prev, attachment]);
        setMediaRefresh((n) => n + 1); // the workspace-files panel picks it up
        noteUpload(); // arms the store's settle wait for the next turn
      }
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "unknown");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }

  // Returns true when the send is accepted, so the composer (which now owns the
  // draft text) can clear itself. The guard + optimistic UI run synchronously;
  // the network turn runs in a detached async IIFE, so a keystroke never rides
  // the streaming path -- and typing, living in the composer, no longer
  // re-renders the message list at all.
  // Compose one message exactly as it will be sent/shown: a leading reply quote,
  // the text, then attachment path refs the agent can open. Returns null when
  // there's nothing to send.
  function compose(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0 && !chatRef) return null;
    const refs = attachments.map((a) => `[anexo: ${a.path}]`).join("\n");
    const quote = replyTo ? buildQuote(replyTo, t) : "";
    const ref = chatRef ? buildReferenceMarker(chatRef, t) : "";
    return [quote, ref, trimmed, refs].filter(Boolean).join("\n\n");
  }

  // Sending is delegated to turn-store: it owns the debounce, the sequential
  // per-conversation queue, the retry ladder and the reveal buffer -- all keyed
  // by sid at module scope, so none of it dies when this component remounts.
  const runContext = useCallback(
    () => ({ workspace, onUnauthorized: () => router.push("/signin") }),
    [workspace, router],
  );

  // Enqueue a composed message as PENDING (pulsing), not sent yet. Consumes the
  // reply/attachments (as a real send would) and arms the debounce.
  //
  // There is deliberately no `sending` guard any more: a user who thinks of a
  // second message while the agent is still answering can send it, and it
  // queues behind the running turn instead of being silently refused.
  function enqueue(text: string): boolean {
    if (!sessionId) return false;
    const composed = compose(text);
    if (composed === null) return false;
    setReplyTo(null);
    setAttachments([]);
    onChatRef(null);
    storeEnqueue(sessionId, composed, runContext());
    return true;
  }

  // A keystroke while a burst is pending pushes the flush back, so the user can
  // keep adding messages before any of them hit the API.
  function bumpFlush() {
    if (sessionId) storeBumpFlush(sessionId);
  }

  // When a turn finishes, pull the now-durable transcript and only then let the
  // store drop its in-flight bands -- otherwise the reply would blink out and
  // back in. If the user is elsewhere the reload is skipped; the store keeps the
  // finished text until they return, and this effect's next run picks it up.
  useEffect(() => {
    setPainter((sid) => {
      if (activeSidRef.current !== sid) return;
      void reloadHistory(sid).then(() => clearCompleted(sid));
    });
    return () => setPainter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.t, workspace.s, workspace.r]);

  // Slash commands operate on the CURRENT chat instead of sending a message.
  // Returns true when the text was consumed as a command (so the composer
  // clears). Actions are async with transient success/error feedback.
  function runCommand(raw: string): boolean {
    const text = raw.trim();
    const sp = text.indexOf(" ");
    const cmd = (sp === -1 ? text : text.slice(0, sp)).toLowerCase();
    const arg = sp === -1 ? "" : text.slice(sp + 1).trim();
    if (!sessionId) return false;

    if (cmd === "/rename") {
      if (!arg) {
        flash("error", t.commands.renameUsage);
        return true;
      }
      renameConversation(sessionId, arg)
        .then((saved) => {
          notifyConversationsUpdated();
          flash("ok", t.commands.renamed.replace("{title}", saved));
        })
        .catch((e) => flash("error", e instanceof Error ? errorText(err, e.message) : t.commands.renameFailed));
      return true;
    }

    if (cmd === "/tag") {
      if (!arg) {
        flash("error", t.commands.tagUsage);
        return true;
      }
      // Peel an optional trailing "#…" color, then split name[=value] (or
      // "name value"). The token after "#" may be a hex code (#e11d48, #f00) or
      // a literal CSS color name (#red, #teal); names are used verbatim.
      let rest = arg;
      let color: string | undefined;
      const cm = rest.match(/\s*#(\S+)\s*$/);
      if (cm) {
        const token = cm[1];
        color = /^[0-9a-fA-F]{3,8}$/.test(token) ? `#${token}` : token.toLowerCase();
        rest = rest.slice(0, cm.index).trim();
      }
      let name: string;
      let val: string;
      if (rest.includes("=")) {
        const [n, ...v] = rest.split("=");
        name = n.trim();
        val = v.join("=").trim();
      } else {
        const parts = rest.split(/\s+/);
        name = parts[0];
        val = parts.slice(1).join(" ");
      }
      if (!name) {
        flash("error", t.commands.tagUsage);
        return true;
      }
      upsertTag(sessionId, { name, value: val || name, metadata: color ? { color } : {} })
        .then(() => {
          notifyConversationsUpdated();
          flash("ok", t.commands.tagApplied.replace("{name}", name));
        })
        .catch((e) => flash("error", e instanceof Error ? errorText(err, e.message) : t.commands.tagFailed));
      return true;
    }

    flash("error", t.commands.unknown.replace("{cmd}", cmd));
    return true;
  }

  // The message index + reply + copy, reused by the desktop (hover, bottom-right)
  // and mobile (tap-to-open, below the card) placements. The index rides in the
  // same cluster as the buttons.
  const renderActions = (m: ChatMessage, index: number) => (
    <>
      <span className="select-none self-center pl-1 text-fg-muted" aria-hidden>
        {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
      </span>
      <span className="select-none self-center px-1 text-[11px] font-semibold tabular-nums text-fg-muted">
        {index + 1}
      </span>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t.view.replyAria}
        title={t.view.reply}
        onClick={() => setReplyTo({ role: m.role, content: m.content })}
      >
        <Reply size={15} aria-hidden />
      </IconButton>
      <CopyButton text={m.content} />
    </>
  );

  const composer = (
    <Composer
      onSend={enqueue}
      onTyping={bumpFlush}
      onCommand={runCommand}
      sending={sending}
      loadingHistory={loadingHistory}
      sessionId={sessionId ?? ""}
      attachments={attachments}
      uploading={uploading}
      attachError={attachError ? errorText(err, attachError) : null}
      onPickFiles={uploadFiles}
      onRemoveAttachment={removeAttachment}
      replyTo={replyTo}
      onCancelReply={() => setReplyTo(null)}
      chatRef={chatRef}
      onCancelChatRef={() => onChatRef(null)}
    />
  );

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-brand/30 px-4 py-2">
        {/* The SUBSCRIPTION leads, the agent sits under it in lighter type — the same
            treatment the conversations sidebar uses, and for the same reason: the
            subscription is the membership boundary a member navigates by, and it is what
            tells two otherwise identical agents apart. The agent is the qualifier. */}
        {subscription ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className="truncate font-display text-sm font-semibold text-fg"
              title={subscription}
            >
              {subscription}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[11px] capitalize text-fg-muted">
              <Bot size={11} className="shrink-0" aria-hidden />
              <span className="truncate">{workspace.r}</span>
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">
            {t.view.agentPrefix} {workspace.r}
          </span>
        )}
        {/* Desktop only. Canvas is already a desktop-only view (chat-shell ignores
            view=canvas on mobile), so on a phone this control offered a destination the
            shell would refuse — and it competed for a cramped header. */}
        <span className="hidden md:inline-flex">
          <ViewModeToggle view="chat" />
        </span>
        <div className="flex flex-1 items-center justify-end gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.view.secrets}
            title={t.view.secrets}
            onClick={() => setSecretsOpen(true)}
          >
            <KeyRound size={18} aria-hidden />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.view.files}
            title={t.view.files}
            onClick={() => setFilesOpen((o) => !o)}
          >
            <PanelRight size={18} aria-hidden />
          </IconButton>
        </div>
      </div>

      {retrying !== null && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs text-fg-muted">
          <Spinner size={12} />
          <span>
            {t.view.retrying
              .replace("{n}", String(retrying))
              .replace("{total}", String(MAX_SEND_ATTEMPTS))}
          </span>
        </div>
      )}

      {error && (
        <div className="px-4 pt-4">
          <Alert severity="error">{errorText(err, error)}</Alert>
        </div>
      )}

      {notice && (
        <div className="px-4 pt-4">
          <Alert severity={notice.kind === "error" ? "error" : "info"}>{notice.text}</Alert>
        </div>
      )}

      {settling && (
        <div className="px-4 pt-4">
          <Alert severity="info">{t.view.settling}</Alert>
        </div>
      )}

      {loadingHistory ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : messages.length === 0 &&
        pending.length === 0 &&
        queue.length === 0 &&
        turn.activeUserMessage === null ? (
        // Empty conversation: center the composer with a prompt to begin, so a
        // fresh chat invites a first message instead of showing a blank column.
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          {resumeCandidate && (
            <div className="flex w-full flex-col items-center gap-4">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-fg">
                  {t.view.resumeHeading}
                </h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Jump back into your most recent conversation with agent {workspace.r}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFragmentSid(resumeCandidate.id)}
                className="group mx-auto flex w-full max-w-[720px] flex-col items-start gap-1.5 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-left shadow-elevated transition-colors hover:border-accent hover:bg-elevated"
              >
                <span className="w-full truncate text-sm font-medium text-fg">
                  {resumeCandidate.title}
                </span>
                {resumeCandidate.alias && (
                  <span className="w-full truncate text-xs text-fg-muted">
                    {resumeCandidate.alias}
                  </span>
                )}
                {resumeCandidate.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {resumeCandidate.tags.map((tag) => (
                      <TagChip key={tag.name} tag={tag} />
                    ))}
                  </span>
                )}
              </button>
            </div>
          )}
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-fg">{t.view.startHeading}</h2>
            <p className="mt-2 text-sm text-fg-muted">
              {t.view.startBody.replace("{agent}", workspace.r)}
            </p>
          </div>
          {composer}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {/* The bottom padding is deliberately a viewport fraction, not a fixed
              gap for the composer. Pinning a new message to the TOP only works
              if there is something below it to scroll against -- with a small
              pad, a short conversation has nothing to scroll and the message
              stays under the composer, which is the bug this fixes. Keeping it
              constant (rather than adding a spacer only while a turn runs) is
              what stops the page from lurching when the turn finishes and the
              spacer would have vanished under the reader. */}
          <div className="absolute inset-0 overflow-auto pt-6 pb-[80vh]">
            <div className="w-full">
              {messages.map((m, i) => {
                const { text, refs } = parseAnexos(m.content);
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const changed = Boolean(prev && prev.role !== m.role);
                // A message with no same-role neighbor on either side stands alone
                // (flanked by the other speaker, or at an edge), so it gets the
                // roomier padding -- applied to both user and agent bands.
                const standalone = prev?.role !== m.role && next?.role !== m.role;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      messageRefs.current[i] = el;
                    }}
                    className={bandGap({ changed })}
                  >
                    <div
                      className={`${messageBand({ role: m.role })} ${bandPad(standalone)}`}
                      onClick={() => {
                        // A drag-to-select ends in a click here; don't hijack it
                        // (toggling state would drop the selection). Only the
                        // mobile tap-to-reveal-actions toggles, and only when
                        // there's no active text selection.
                        if (!window.getSelection()?.isCollapsed) return;
                        setOpenActions((cur) => (cur === i ? null : i));
                      }}
                    >
                      <div className="relative mx-auto w-full max-w-[720px] px-4">
                        {m.content.trim() !== "" && (
                          // Desktop only: transparent toolbar at the message's
                          // top-right, in the card's top padding (above the text). Mobile uses the tapped
                          // row below the card instead (rendered after the band).
                          <div className="absolute right-1.5 bottom-full mb-1 z-10 hidden items-center gap-0.5 opacity-0 transition-opacity md:flex md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            {renderActions(m, i)}
                          </div>
                        )}
                        {text && <MessageContent content={text} />}
                        {refs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {refs.map((r) => (
                              <AttachmentButton
                                key={r.path}
                                workspace={workspace}
                                path={r.path}
                                name={r.name}
                                tone="chip"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Mobile only: tapping the card opens this action row below
                        it (before the next message); no hover on touch. */}
                    {m.content.trim() !== "" && openActions === i && (
                      <div className="flex items-center gap-0.5 px-2 py-1 md:hidden">
                        {renderActions(m, i)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* The turn in flight: the user's message, then the reply as it
                  is revealed. Both come from the store, so they are still here
                  after switching conversations (or workspaces) and back --
                  which is what makes a running turn stop looking like it was
                  never sent. */}
              {turn.activeUserMessage !== null && (
                <div
                  className={bandGap({ changed: true })}
                  // Only the anchor when nothing is still pending behind it --
                  // otherwise the newest thing on screen is a pending bubble.
                  ref={pending.length === 0 ? newestSentRef : undefined}
                >
                  <div className={`${messageBand({ role: "user" })} ${bandPad(false)}`}>
                    <div className="relative mx-auto w-full max-w-[720px] px-4">
                      <MessageContent content={parseAnexos(turn.activeUserMessage).text} />
                    </div>
                  </div>
                  <div className={`${messageBand({ role: "assistant" })} ${bandPad(false)}`}>
                    <div className="relative mx-auto w-full max-w-[720px] px-4">
                      {revealed === "" ? (
                        // Before the first word: progress only. The two never
                        // share the band.
                        <TurnProgress progress={progress} lastEventAt={turn.lastEventAt} />
                      ) : (
                        <>
                          <MessageContent content={parseAnexos(revealed).text} streaming />
                          {sending && (
                            <span className="ml-0.5 inline-block h-4 w-[0.45em] animate-blink bg-current align-text-bottom" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Queued: committed, waiting behind the running turn. Quieter
                  than a pending burst -- it is already on its way. */}
              {queue.map((content, i) => (
                <div key={`queued-${i}`} className={bandGap({ changed: false })}>
                  <div className={`${messageBand({ role: "user" })} origin-queued ${bandPad(false)}`}>
                    <div className="relative mx-auto w-full max-w-[720px] px-4">
                      <MessageContent content={parseAnexos(content).text} />
                      <span className="mt-1 block text-xs text-fg-muted/70">{t.view.queued}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Stacked-but-not-yet-sent messages: same user band, its origin
                  bar pulsing to signal "pending" until the batch flushes. */}
              {pending.map((content, i) => {
                const { text, refs } = parseAnexos(content);
                // All pending are the user's; a run touches, and a lone pending
                // after an agent message stands alone (roomier padding).
                const prevIsUser = i > 0 || messages[messages.length - 1]?.role === "user";
                const alone = !prevIsUser && i === pending.length - 1;
                return (
                  <div
                    key={`pending-${i}`}
                    className={bandGap({ changed: !prevIsUser })}
                    ref={i === pending.length - 1 ? newestSentRef : undefined}
                  >
                    <div className={`${messageBand({ role: "user" })} origin-pulse ${bandPad(alone)}`}>
                      <div className="relative mx-auto w-full max-w-[720px] px-4">
                        {text && <MessageContent content={text} />}
                        {refs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {refs.map((r) => (
                              <AttachmentButton
                                key={r.path}
                                workspace={workspace}
                                path={r.path}
                                name={r.name}
                                tone="chip"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* The composer floats, suspended over the chat; the scroll area's
              bottom padding keeps the last messages clear of it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-6">
            <div className="pointer-events-auto mx-auto w-full max-w-[720px]">{composer}</div>
          </div>
        </div>
      )}
      </div>

      {filesOpen && (
        <UploadsSidebar
          workspace={workspace}
          refreshSignal={mediaRefresh}
          onClose={() => setFilesOpen(false)}
          onReference={onChatRef}
        />
      )}

      <SecretsDrawer
        workspace={workspace}
        open={secretsOpen}
        onClose={() => setSecretsOpen(false)}
        onRestartNeeded={onRestartNeeded}
      />

    </div>
  );
}
