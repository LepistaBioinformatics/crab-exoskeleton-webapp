"use client";

import { useEffect, useRef, useState } from "react";
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
import { TagChip } from "@/app/chat/conversation-enrichment";
import { CopyButton } from "@/components/ui/copy-button";
import { Alert } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";

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
      <span className="select-none self-center pl-1 text-fg-muted" aria-hidden>
        {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
      </span>
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
      <div className="flex items-center gap-2 border-b border-brand/30 px-4 py-2">
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">
          agent {workspace.r}
        </span>
        <ViewModeToggle view="chat" />
        <div className="flex flex-1 items-center justify-end gap-1">
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
          {resumeCandidate && (
            <div className="flex w-full flex-col items-center gap-4">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-fg">
                  Continue where you left off
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
            <h2 className="font-display text-2xl font-bold text-fg">Start a new chat</h2>
            <p className="mt-2 text-sm text-fg-muted">
              Ask agent {workspace.r} anything to get going.
            </p>
          </div>
          {composer}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-auto pt-6 pb-40">
            <div className="w-full">
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
                        {streaming && (
                          <span className="ml-0.5 inline-block h-4 w-[0.45em] animate-blink bg-current align-text-bottom" />
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
              <div ref={pendingEndRef} />
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
