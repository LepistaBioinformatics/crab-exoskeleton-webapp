"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createConversation,
  touchConversation,
  syncSessionRefs,
  notifyConversationsUpdated,
  renameConversation,
  upsertTag,
} from "@/lib/chatSession";
import MessageContent from "@/app/chat/message-content";
import Composer from "@/app/chat/composer";
import { cva } from "class-variance-authority";
import { KeyRound, PanelRight, Reply } from "lucide-react";
import { setFragmentSid, historyQuery, useFragment, type Workspace } from "@/app/chat/fragment";
import ViewModeToggle from "@/app/chat/view-mode-toggle";
import SecretsDrawer from "@/app/chat/secrets-drawer";
import UploadsSidebar from "@/app/chat/uploads-sidebar";
import AttachmentButton from "@/app/chat/attachment-button";
import { uploadMedia, parseAnexos, type Attachment } from "@/lib/media";
import { CopyButton } from "@/components/ui/copy-button";
import { Alert } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";

// Full-width bands (composer width), clearly attributed: a colored origin bar —
// accent cyan on the RIGHT for the user (::after), violet on the LEFT for the
// agent (::before) — plus distinct background tints and text indented to that
// side. No soft gradient between speakers (sharp boundary); the gap does the
// separating.
// Chromotherapy: the agent's messages carry a warm-yellow skin so they stand
// out and stick in memory. Light mode tints the whole band light yellow with a
// stronger (still light) yellow origin bar; dark mode keeps the neutral band but
// turns the text and bar yellow. The user's messages stay cyan, only shifting
// their text to a soft blue in dark mode.
const messageBand = cva("group relative w-full text-fg", {
  variants: {
    role: {
      // Vertical padding is applied per-message in the render (userPad) since it
      // depends on whether the user message stands alone between agent messages.
      user: "border-[0.5px] border-accent/60 dark:border-0 bg-accent/12 pl-16 pr-8 max-md:pl-4 max-md:pr-4 dark:text-[#90CAF9] after:absolute after:inset-y-0 after:right-0 after:w-1 after:bg-accent after:content-['']",
      assistant:
        "border-[0.5px] border-[#ad9d67]/60 dark:border-0 bg-[#fef9e742] dark:bg-elevated/70 pl-8 pr-16 max-md:pl-4 max-md:pr-4 dark:text-[#c9c7be] before:absolute before:inset-y-0 before:right-0 before:w-1 before:bg-[#ad9d67] before:content-['']",
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
function buildQuote(reply: ReplyTo): string {
  const who = reply.role === "user" ? "Você" : "Agente";
  const { text } = parseAnexos(reply.content);
  const oneLine = text.replace(/\s+/g, " ").trim();
  const snippet = oneLine.length > QUOTE_MAX ? `${oneLine.slice(0, QUOTE_MAX - 1)}…` : oneLine;
  return `> **${who}:** ${snippet}`;
}

// After an upload, picoclaw reloads to pick up the new workspace file. Give it a
// moment to settle before firing the turn, so the first message right after an
// attach doesn't hit the container mid-reload ("Can't reach the gateway").
const UPLOAD_SETTLE_MS = 1500;

// Sending a turn retries on transport / gateway failure (fetch throws or a 5xx)
// with exponential backoff -- 1s, then doubling, capped -- up to
// MAX_SEND_ATTEMPTS, showing a discreet notice while it retries. A 4xx
// (auth/validation) is terminal and surfaced at once, never retried.
const MAX_SEND_ATTEMPTS = 10;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const retryDelay = (attempt: number) => Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Debounced batch send. A message isn't POSTed the instant you hit send: it
// joins a pending queue and, after SEND_DEBOUNCE_MS of no further typing/sending,
// the whole queue flushes as ONE turn (a single API call). Typing again re-arms
// the timer -- since nothing has hit the API yet, the prior send is effectively
// cancelled. The queue is keyed by conversation id at module scope so it
// survives switching chats (and remounts): stacked messages are never lost.
const SEND_DEBOUNCE_MS = 3000;
const pendingOutbox = new Map<string, string[]>();

export default function ChatView({
  workspace,
  sessionId,
}: {
  workspace: Workspace;
  sessionId: string | undefined;
}) {
  const router = useRouter();
  const fragment = useFragment();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [mediaRefresh, setMediaRefresh] = useState(0);
  const [settling, setSettling] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  // Composed-but-not-yet-sent messages for the current conversation (mirrors
  // pendingOutbox for reactivity); each shows as a pulsing user band.
  const [pending, setPending] = useState<string[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const lastUploadAtRef = useRef(0);

  // The uploads panel is a permanent right column; remember whether it's open.
  useEffect(() => {
    setFilesOpen(localStorage.getItem("chat-files-open") === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("chat-files-open", filesOpen ? "1" : "0");
  }, [filesOpen]);

  // Chat-style scroll: a brand new message pins its *top* into view (so a long
  // reply can be read from the start while it's still streaming), while the
  // very first load of a conversation jumps to the most recent message.
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  // Pending bubbles live after the message list (not in messageRefs); a sentinel
  // lets us scroll them into view so the "not sent yet" pulse is never below the
  // fold in a long conversation.
  const pendingEndRef = useRef<HTMLDivElement | null>(null);
  const creatingSid = useRef(false);

  // Always mirrors the currently-viewed session, so an in-flight stream can
  // tell whether the user is still looking at the conversation the reply
  // belongs to before it touches the (single, shared) messages state.
  const activeSidRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    activeSidRef.current = sessionId;
  }, [sessionId]);

  // Clear the pending flush timer on unmount. The queue itself lives in
  // pendingOutbox (module scope), so it survives and is never lost.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
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
    setError(null);
    // The newly-viewed conversation isn't the one mid-send (if any) -- reset so
    // its composer isn't stuck disabled by another conversation's in-flight send.
    setSending(false);
    setRetrying(null);
    // Pending attachments belong to the composer of the conversation you were
    // in -- drop them when switching.
    setAttachments([]);
    setAttachError(null);
    setReplyTo(null);
    setOpenActions(null);
    setLoadingHistory(true);

    // Restore this conversation's stacked (pending) messages and cancel any timer
    // left from the previous conversation. We do NOT re-arm here: a stack parked
    // by switching away stays parked (never force-sends just from looking at it);
    // its countdown resumes only when the user re-engages -- types (bumpFlush) or
    // sends (enqueue) -- both of which re-arm.
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    setPending(pendingOutbox.get(sessionId) ?? []);

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

  // Keep the newest pending bubble in view when the stack grows (or is restored),
  // so the pulsing "not sent yet" signal is visible even in a scrolled chat.
  useEffect(() => {
    if (pending.length > 0) pendingEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pending.length]);

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
        lastUploadAtRef.current = Date.now();
      }
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Upload failed.");
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
    if (!trimmed && attachments.length === 0) return null;
    const refs = attachments.map((a) => `[anexo: ${a.path}]`).join("\n");
    const quote = replyTo ? buildQuote(replyTo) : "";
    return [quote, trimmed, refs].filter(Boolean).join("\n\n");
  }

  // (Re)arm the debounce: after SEND_DEBOUNCE_MS with no further activity, the
  // pending queue for `sid` flushes as one turn.
  function armFlush(sid: string) {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => flushPending(sid), SEND_DEBOUNCE_MS);
  }

  // Enqueue a composed message as PENDING (pulsing), not sent yet. Consumes the
  // reply/attachments (as a real send would) and arms the debounce.
  function enqueue(text: string): boolean {
    if (!sessionId || sending) return false;
    const composed = compose(text);
    if (composed === null) return false;
    const sid = sessionId;
    setReplyTo(null);
    setAttachments([]);
    // The outbox (module scope) is the source of truth; mirror into state for
    // rendering. Reading from it (not the `pending` closure) avoids stale state.
    const next = [...(pendingOutbox.get(sid) ?? []), composed];
    pendingOutbox.set(sid, next);
    setPending(next);
    armFlush(sid);
    return true;
  }

  // A keystroke while a stack is pending pushes the flush back, so the user can
  // keep adding messages before any of them hit the API.
  function bumpFlush() {
    if (sessionId && (pendingOutbox.get(sessionId)?.length ?? 0) > 0) armFlush(sessionId);
  }

  // The debounce fired: send the whole pending stack for `sid` as ONE turn. Only
  // the actively-viewed conversation flushes (others keep their stack until the
  // user returns to them).
  function flushPending(sid: string) {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    // Only flush the conversation currently in view; if the user navigated away
    // before the timer fired, leave the stack intact in the outbox for later.
    if (sid !== activeSidRef.current) return;
    const texts = pendingOutbox.get(sid);
    if (!texts || texts.length === 0) return;
    pendingOutbox.delete(sid);
    setPending([]);
    postTurn(texts.join("\n\n"), sid);
  }

  // POST one (already-composed) turn and stream the reply. Unchanged from the
  // original send path other than taking the composed text + sid as arguments.
  function postTurn(composed: string, sid: string): void {
    // The new user message's index -- scroll its *top* into view once it (and
    // the assistant placeholder after it) render.
    setScrollToIndex(messages.length);
    setMessages((prev) => [...prev, { role: "user", content: composed }, { role: "assistant", content: "" }]);
    setSending(true);
    setError(null);

    void (async () => {
    // If a file was just uploaded, wait for picoclaw to settle (reload) before
    // firing the turn, so the first message after an attach doesn't hit the
    // container mid-reload. Shows a friendly "saving your file" note meanwhile.
    // Attachments were consumed at enqueue time, so detect them from the
    // composed text (the "[anexo: …]" refs) rather than the now-cleared array.
    const hadUpload = composed.includes("[anexo:");
    const sinceUpload = Date.now() - lastUploadAtRef.current;
    const settleWait = hadUpload ? Math.max(0, UPLOAD_SETTLE_MS - sinceUpload) : 0;
    if (settleWait > 0) {
      setSettling(true);
      await new Promise((resolve) => setTimeout(resolve, settleWait));
      setSettling(false);
    }

    // If the user switches to another conversation mid-stream, we STOP painting
    // this reply (it would otherwise land in the wrong conversation) but keep
    // DRAINING the response so the turn finishes server-side and picoclaw
    // persists it -- the reply is never cut. Once detached we never repaint,
    // even if the user comes back, to avoid racing the history reload.
    let detached = false;

    try {
      const body = JSON.stringify({
        message: composed,
        session_id: sid,
        tenant_id: workspace.t,
        subs_acc_id: workspace.s,
      });

      // Retry the send until picoclaw accepts the turn (a streamable body):
      // transport failures and 5xx are retried with exponential backoff; a 4xx
      // is terminal (its real reason is surfaced and we stop).
      let stream: ReadableStream<Uint8Array> | null = null;
      let terminal = false;
      for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS && !terminal; attempt++) {
        try {
          const r = await fetch(`/api/chat/${workspace.r}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (r.status === 401) {
            router.push("/signin");
            return;
          }
          if (r.ok && r.body) {
            stream = r.body; // accepted -- stop retrying
            break;
          }
          if (r.status < 500) {
            // 4xx: the proxy's real reason (403 not licensed, 409 not
            // scaffolded, 400 bad request). Retrying won't help.
            const data = await r.json().catch(() => null);
            if (activeSidRef.current === sid) setError(errorMessage(data?.error));
            terminal = true;
            break;
          }
          // 5xx / missing body -> fall through to the backoff retry
        } catch {
          // network/transport error -> fall through to the backoff retry
        }
        if (attempt < MAX_SEND_ATTEMPTS) {
          if (activeSidRef.current === sid) setRetrying(attempt);
          await sleep(retryDelay(attempt));
        }
      }
      if (activeSidRef.current === sid) setRetrying(null);

      if (!stream) {
        // A terminal 4xx already set its error; otherwise every attempt failed.
        if (activeSidRef.current === sid) {
          if (!terminal) {
            setError("Still can't reach the gateway after several attempts. Try again shortly.");
          }
          setMessages((prev) => prev.slice(0, -1)); // drop the empty assistant placeholder
        }
        return;
      }

      // The turn was accepted -- picoclaw is now running it and will persist
      // the session. ONLY now create/bump the postgres row (deferred +
      // success-gated), so clicking a chat or a failed/rejected send never
      // leaves a conversation row with no picoclaw transcript behind it.
      touchConversation(workspace, sid, composed).catch(() => {});
      setAttachments([]); // consumed by this turn

      await consumeStream(stream, (delta) => {
        if (detached) return;
        if (activeSidRef.current !== sid) {
          detached = true; // user navigated away -- keep draining, stop painting
          return;
        }
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (!last || last.role !== "assistant") return prev;
          next[next.length - 1] = { role: "assistant", content: last.content + delta };
          return next;
        });
      });

      // Left mid-stream but came back before it finished -> pull the now-complete
      // transcript so the finished reply replaces whatever partial was shown.
      if (detached && activeSidRef.current === sid) {
        await reloadHistory(sid);
      }

      // The turn is done and picoclaw has persisted the session -- resolve and
      // store the proxy session ids on the postgres row (best-effort). Not
      // gated on the active sid: the reply drained even if the user navigated
      // away, so its refs are still correct.
      syncSessionRefs(workspace, sid).catch(() => {});

      // Nudge the sidebar to re-read the now-final transcript. recency was
      // already bumped at send time (so the tree's updatedAt-keyed cache won't
      // refetch on its own); the tree treats this event as a force-refresh of
      // the active conversation, so the completed assistant reply shows up.
      notifyConversationsUpdated();
    } catch {
      // Keep whatever partial content already streamed in -- only surface the
      // error banner if the user is still viewing this conversation.
      if (activeSidRef.current === sid) setError("Can't reach the gateway right now.");
    } finally {
      if (activeSidRef.current === sid) {
        setSending(false);
        setRetrying(null);
      }
    }
    })();
  }

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
        flash("error", "Uso: /rename <novo título>");
        return true;
      }
      renameConversation(sessionId, arg)
        .then((saved) => {
          notifyConversationsUpdated();
          flash("ok", `Chat renomeado para “${saved}”.`);
        })
        .catch((e) => flash("error", e instanceof Error ? e.message : "Não consegui renomear."));
      return true;
    }

    if (cmd === "/tag") {
      if (!arg) {
        flash("error", "Uso: /tag <nome> [valor] [#cor]");
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
        flash("error", "Uso: /tag <nome> [valor] [#cor]");
        return true;
      }
      upsertTag(sessionId, { name, value: val || name, metadata: color ? { color } : {} })
        .then(() => {
          notifyConversationsUpdated();
          flash("ok", `Tag “${name}” aplicada.`);
        })
        .catch((e) => flash("error", e instanceof Error ? e.message : "Não consegui aplicar a tag."));
      return true;
    }

    flash("error", `Comando desconhecido: ${cmd}. Tente /rename ou /tag.`);
    return true;
  }

  // The message index + reply + copy, reused by the desktop (hover, bottom-right)
  // and mobile (tap-to-open, below the card) placements. The index rides in the
  // same cluster as the buttons.
  const renderActions = (m: ChatMessage, index: number) => (
    <>
      <span className="select-none self-center px-1 text-[11px] font-semibold tabular-nums text-fg-muted">
        {index + 1}
      </span>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label="Responder a esta mensagem"
        title="Responder"
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
      attachError={attachError}
      onPickFiles={uploadFiles}
      onRemoveAttachment={removeAttachment}
      replyTo={replyTo}
      onCancelReply={() => setReplyTo(null)}
    />
  );

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-brand/30 px-4 py-2">
        <span className="min-w-0 truncate font-display text-sm font-semibold text-fg">
          agent {workspace.r}
        </span>
        <div className="flex items-center gap-1">
          <ViewModeToggle view="chat" />
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Agent secrets"
            title="Agent secrets"
            onClick={() => setSecretsOpen(true)}
          >
            <KeyRound size={18} aria-hidden />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Workspace files"
            title="Workspace files"
            onClick={() => setFilesOpen((o) => !o)}
          >
            <PanelRight size={18} aria-hidden />
          </IconButton>
        </div>
      </div>

      {retrying !== null && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs text-fg-muted">
          <Spinner size={12} />
          <span>Couldn&apos;t reach the gateway — retrying… (attempt {retrying} of {MAX_SEND_ATTEMPTS})</span>
        </div>
      )}

      {error && (
        <div className="px-4 pt-4">
          <Alert severity="error">{error}</Alert>
        </div>
      )}

      {notice && (
        <div className="px-4 pt-4">
          <Alert severity={notice.kind === "error" ? "error" : "info"}>{notice.text}</Alert>
        </div>
      )}

      {settling && (
        <div className="px-4 pt-4">
          <Alert severity="info">Estamos guardando o arquivo para você…</Alert>
        </div>
      )}

      {loadingHistory ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : messages.length === 0 && pending.length === 0 ? (
        // Empty conversation: center the composer with a prompt to begin, so a
        // fresh chat invites a first message instead of showing a blank column.
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-fg">Start a new chat</h2>
            <p className="mt-2 text-sm text-fg-muted">
              Ask agent {workspace.r} anything to get going.
            </p>
          </div>
          {composer}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-auto px-4 pt-6 pb-40">
            <div className="mx-auto w-full max-w-[720px]">
              {messages.map((m, i) => {
                const streaming = sending && i === messages.length - 1 && m.role === "assistant";
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
                      {m.content.trim() !== "" && (
                        // Desktop only: transparent toolbar at the message's
                        // bottom-right, revealed on hover. Mobile uses the tapped
                        // row below the card instead (rendered after the band).
                        <div className="absolute bottom-1.5 right-1.5 z-10 hidden items-center gap-0.5 opacity-0 transition-opacity md:flex md:group-hover:opacity-100 md:group-focus-within:opacity-100">
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
                      {streaming && (
                        <span className="ml-0.5 inline-block h-4 w-[0.45em] animate-blink bg-current align-text-bottom" />
                      )}
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

              {/* Stacked-but-not-yet-sent messages: same user band, its origin
                  bar pulsing to signal "pending" until the batch flushes. */}
              {pending.map((content, i) => {
                const { text, refs } = parseAnexos(content);
                // All pending are the user's; a run touches, and a lone pending
                // after an agent message stands alone (roomier padding).
                const prevIsUser = i > 0 || messages[messages.length - 1]?.role === "user";
                const alone = !prevIsUser && i === pending.length - 1;
                return (
                  <div key={`pending-${i}`} className={bandGap({ changed: !prevIsUser })}>
                    <div className={`${messageBand({ role: "user" })} origin-pulse ${bandPad(alone)}`}>
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
                );
              })}
              <div ref={pendingEndRef} />
            </div>
          </div>
          {/* The composer floats, suspended over the chat; the scroll area's
              bottom padding keeps the last messages clear of it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6">
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
        />
      )}

      <SecretsDrawer
        workspace={workspace}
        open={secretsOpen}
        onClose={() => setSecretsOpen(false)}
      />
    </div>
  );
}

function errorMessage(raw: unknown): string {
  if (raw === "connectivity") return "Can't reach the gateway right now.";
  if (typeof raw === "string" && raw.trim()) return raw;
  return "Something went wrong sending your message.";
}

// Parses the proxy's OpenAI-style SSE stream (`data: {...}\n\n`, terminated by
// `data: [DONE]\n\n`) and calls onDelta with each chunk's
// choices[0].delta.content as it arrives.
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload);
        const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        // skip a malformed frame rather than aborting the whole stream
      }
    }
  }
}
