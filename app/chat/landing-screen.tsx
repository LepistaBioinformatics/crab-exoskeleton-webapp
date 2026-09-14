"use client";

import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { cva } from "class-variance-authority";
import { createConversation, type ConversationSummary } from "@/lib/chatSession";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { Spinner } from "@/components/ui/spinner";
import Composer from "./composer";
import ConversationSearchBar from "./conversation-search-bar";
import { useConversations } from "./use-conversations";
import { useConversationSearch } from "./use-conversation-search";
import { enqueue as storeEnqueue } from "./turn-store";
import { setFragmentProjectSid, useFragment } from "./fragment";
import ConversationTree from "./conversation-tree";
import type { Project } from "@/lib/projects";
import type { Workspace } from "./fragment";
import { chatCopy } from "@/lib/i18n/chat";
import { useLocale, useT } from "@/lib/i18n/context";
import { BCP47 } from "@/lib/i18n/format";

// WHAT A PLACE LOOKS LIKE BEFORE A CONVERSATION IS CHOSEN — the agent's root and a
// project's root alike (FR-3.1).
//
// There was no such screen. `resolveCentre` answered "chat" for a workspace with no
// `sid`, and what made that honest was an effect in ChatView that MINTED a conversation
// on sight of an absent one. Entering a project drops `sid` deliberately, so entering a
// place put the member inside a blank transcript rather than in the place — with the
// project's own conversations one column away in the sidebar and nothing in the middle.
//
// So: a composer, because starting one is the common case and it should take no
// navigation; and under it the scope's conversations with the same search the sidebar
// has, because the other case is coming back to one.
//
// NOTHING IS CREATED UNTIL THE MEMBER SENDS (FR-3.5). `createConversation` mints an id
// and persists nothing — the row appears on the first message — so a landing that minted
// on arrival would leave a ghost id in the fragment for every place the member merely
// looked at, which is what the breadcrumb's chevron was tripping over.

const row = cva(
  [
    "flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left",
    "transition-colors hover:bg-elevated",
  ],
);

export default function LandingScreen({
  workspace,
  project,
  onOpen,
  focusSignal,
}: {
  /** Carries `p`, so the conversation list below is already the scope's. */
  workspace: Workspace;
  /** The project being stood in, for the line under the heading. Null at the agent's root. */
  project: Project | null;
  /** A conversation was chosen. The shell writes the fragment. */
  onOpen: (sid: string) => void;
  /**
   * Bumped when "New chat" is pressed. On every other screen that press NAVIGATES here;
   * pressed while already here it wrote the hash that was already in the bar, which
   * fires no hashchange and re-rendered nothing — a button that looked like a way in and
   * did nothing, on the one screen a member is most likely to press it.
   */
  focusSignal?: number;
}) {
  const t = useT(chatCopy);
  const tag = BCP47[useLocale().locale];
  const router = useRouter();
  const fragment = useFragment();
  // Tree unless the member asked for a list, which is the sidebar's own rule read off
  // the same fragment key. ONE setting, one control: the switch lives in the sidebar's
  // panel and this follows it rather than offering a second one that could disagree.
  const asList = fragment?.hv === "list";
  const { conversations: all, loaded } = useConversations(workspace);

  // THE PROJECT FILTER, and leaving it out was a defect.
  //
  // `listConversations` sends tenant/subscription/role and NOT the project, so it
  // answers with every conversation of the agent — the ones at its root and the ones
  // inside each project. The sidebar has always narrowed that itself; this screen did
  // not, so it listed the whole agent under a project's name, and opening a row from
  // another project wrote THIS project's `p` beside that conversation's `sid`. The
  // transcript then read from the wrong workspace directory, came back empty, and the
  // chat rendered its "pick one or start one" empty state — which is what a member
  // reported as "sometimes it opens the conversation and sometimes it doesn't".
  //
  // Client-side, like the sidebar's, because the full list is already fetched: the
  // search and the tree both need every conversation to build from.
  const inScope = (c: ConversationSummary) => (c.project ?? null) === (workspace.p ?? null);
  const conversations = all.filter(inScope);

  const { query, setQuery, results, searching } = useConversationSearch(
    workspace,
    conversations,
  );

  // `results` is null for an empty query — "no filter", which is not "filtered to
  // nothing" and must not render as an empty list.
  const visible = results ?? conversations;

  // THE PROJECT IS PASSED, and it is the invariant the deleted mint effect existed to
  // protect: a conversation created without it is answered by the main agent and reads
  // its history from the wrong workspace directory.
  //
  // One fragment write for both keys, so the history stack never holds a half-state, and
  // the text is enqueued against the new id rather than handed to the chat view — the
  // turn store is module scope, so the message survives this screen being replaced by
  // the transcript.
  // Returns true — the composer clears — before the promise settles, and that is safe
  // because `createConversation` MINTS LOCALLY: it is `crypto.randomUUID()` and an
  // object, `async` only in its signature, with no request and no failure mode. The row
  // is created by the first message (`touchConversation`). If that ever starts hitting
  // the network, the text has to be held until it resolves.
  function send(text: string): boolean {
    const body = text.trim();
    if (!body) return false;
    void createConversation(workspace, workspace.p ?? null).then((conversation) => {
      storeEnqueue(conversation.id, body, {
        workspace,
        project: workspace.p ?? null,
        onUnauthorized: () => router.push("/signin"),
      });
      setFragmentProjectSid(workspace.p ?? null, conversation.id);
    });
    return true;
  }

  return (
    // The scroll belongs to the frame for the reason DestinationScreen records: a screen
    // that scrolled its own body would take its heading with it. The composer is pinned
    // above it rather than scrolling away, because it is the thing this screen is for.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="font-display text-xl font-bold text-fg sm:text-2xl">
          {t.landing.title}
        </h1>
        {project && (
          <p className="mt-1 text-sm text-fg-muted">
            {t.landing.inProject.replace("{name}", project.name)}
          </p>
        )}
        <div className="mt-4">
          <Composer
            onSend={send}
            sending={false}
            loadingHistory={false}
            // No conversation to upload against yet — see Composer's `canAttach`.
            sessionId=""
            canAttach={false}
            attachments={[]}
            uploading={false}
            attachError={null}
            workspace={workspace}
            onPickFiles={() => {}}
            onRemoveAttachment={() => {}}
            replyTo={null}
            onCancelReply={() => {}}
            chatRef={null}
            onCancelChatRef={() => {}}
            mentionFiles={[]}
            focusSignal={focusSignal}
          />
        </div>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-6">
        <h2 className="text-sm font-semibold text-fg">{t.landing.conversations}</h2>
        <div className="mt-2">
          <ConversationSearchBar
            value={query}
            onChange={setQuery}
            conversations={conversations}
            searching={searching}
          />
        </div>

        {/* THE FIRST READ HAS TO COME BACK BEFORE THIS SAYS THERE IS NOTHING. The list
            starts empty and fills from an effect, so "no conversations yet" would flash
            on every arrival — and a member reaches this screen four ways: entering an
            agent, entering a project, pressing New chat, and deleting the one they were
            reading. */}
        {!loaded && !query ? (
          <div className="flex justify-center py-6">
            <Spinner size={20} />
          </div>
        ) : visible.length === 0 ? (
          <PanelEmpty
            icon={MessageSquare}
            title={query ? t.history.noMatches : t.history.noneYet}
            body={query ? t.history.noMatchesHint : undefined}
          />
        ) : asList ? (
          <ul className="mt-2 flex flex-col">
            {visible.map((conversation) => (
              <li key={conversation.id}>
                <button type="button" onClick={() => onOpen(conversation.id)} className={row()}>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {label(conversation)}
                  </span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {new Date(conversation.updatedAt).toLocaleDateString(tag, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // The same tree the sidebar draws, off the same `hv` key and the same list.
          // It navigates itself (`setFragmentSid`), which is correct here because `p`
          // is already this screen's project — the rows it shows are scoped to it.
          <div className="mt-2">
            <ConversationTree workspace={workspace} conversations={visible} />
          </div>
        )}
      </div>
    </div>
  );
}

// The alias wins where there is one: it is what the member named the conversation, and
// the title is what the transcript's first message made of it. Same order the breadcrumb
// reads them in, and the sidebar.
function label(conversation: ConversationSummary): string {
  return conversation.alias?.trim() || conversation.title;
}
