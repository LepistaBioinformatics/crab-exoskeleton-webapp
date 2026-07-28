"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose } from "lucide-react";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import LogoutButton from "./logout-button";
import WorkspaceNav from "./workspace-nav";
import HistorySidebar from "./history-sidebar";
import AdminLink from "./admin-link";
import InstallAppButton from "./install-app-button";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// The one sidebar: brand header, a Workspaces group, a Conversations group, and the
// account footer.
//
// It replaced two independent ResizablePanes that between them cost up to 580px of
// horizontal chrome (280 + 300) before the conversation got any width, and that
// duplicated two headers, two search inputs, two collapse buttons and two scroll
// containers — for what a member reads as one question: which agent, and which
// conversation.
//
// HEIGHT is this component's job and nowhere else's:
//
//   Workspaces takes its content's height, capped at 40vh, scrolling inside itself
//   past that. Conversations takes the remainder and scrolls inside itself. Both
//   headers stay visible. (vh and not %, for the reason at the wrapper below.)
//
// Not an accordion (switching agent then picking a conversation is the pane's main
// job, and both lists are visible for that today) and not one pane-wide scroll (with
// many workspaces that pushes the Conversations header, and its search, below the
// fold).

// There is no "focus" prop any more. Mobile had two buttons — a hamburger for
// workspaces, a message icon for conversations — and this component opened and
// scrolled to whichever group was asked for. Unifying the panes made the second button
// redundant: both groups are open by default, so the single drawer already lands with
// the conversation list on screen, and the request only differed for a member who had
// collapsed Conversations by hand. One toggling button replaced the pair, so the
// request, its counter and the deferred scroll all went with it.

const GROUPS_KEY = "chat-sidebar-groups";

interface GroupState {
  workspaces: boolean;
  conversations: boolean;
}

const BOTH_OPEN: GroupState = { workspaces: true, conversations: true };

// Module-level so effects can persist without closing over anything that changes per
// render — which is what made the first version's focus effect omit a dependency.
function persist(next: GroupState): GroupState {
  try {
    window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures must not block the toggle itself.
  }
  return next;
}

export default function UnifiedSidebar({
  email,
  workspace,
  hideConversations,
  onConversationSelect,
  onCollapse,
}: {
  email: string;
  /** Null until the fragment resolves a workspace. */
  workspace: Workspace | null;
  /**
   * True in the canvas view. The canvas already lanes every conversation, so listing
   * them beside it is the same information twice, competing for height with the tree
   * — and switching agent is the only navigation the canvas still needs.
   */
  hideConversations: boolean;
  /**
   * Closes the mobile drawer. Wired to CONVERSATION selection only.
   *
   * Picking a workspace deliberately leaves the drawer open: it swaps which agent's
   * conversations the group below is listing, and that list is the thing the member
   * came for. Closing there made choosing an agent and then one of its chats two
   * open-close cycles.
   */
  onConversationSelect?: () => void;
  onCollapse?: () => void;
}) {
  const t = useT(chatCopy);
  const [groups, setGroups] = useState<GroupState>(BOTH_OPEN);

  // Restore the persisted open/closed state once. Both open is the default: the pair
  // is what the two sidebars always showed at the same time.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUPS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GroupState>;
      setGroups({
        workspaces: parsed.workspaces ?? true,
        conversations: parsed.conversations ?? true,
      });
    } catch {
      // A corrupt value is not worth a broken sidebar; both-open is a fine answer.
    }
  }, []);

  function setGroup(key: keyof GroupState, open: boolean) {
    setGroups((prev) => persist({ ...prev, [key]: open }));
  }

  const showConversations = !hideConversations;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Logo size={32} />
        <BrandName className="min-w-0 flex-1 truncate font-display text-base font-semibold text-fg" />
        {onCollapse && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.nav.collapseWorkspaces}
            title={t.nav.collapse}
            onClick={onCollapse}
            className="hidden md:inline-flex"
          >
            <PanelLeftClose size={18} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* The cap is in vh, NOT 40%. A percentage max-height resolves against the
            parent's height, and this parent is a flex item sized by flex resolution —
            the case browsers treat as indefinite, where the percentage is ignored. The
            tree would then render at full content height and push the Conversations
            header off screen, which is the exact failure that ruled out a single
            pane-wide scroll. vh resolves against the viewport and needs no definite
            parent; the pane is full-height, so it means the same thing in practice.

            shrink-0 with a cap: the group takes min(content, 40vh) and never grows,
            so a small tree still leaves Conversations nearly everything. */}
        <div className="flex max-h-[40vh] min-h-0 shrink-0 flex-col border-b border-brand/20">
          {/* No onSelect: picking an agent must not close the drawer. */}
          <WorkspaceNav
            open={groups.workspaces}
            onToggle={() => setGroup("workspaces", !groups.workspaces)}
          />
        </div>

        {showConversations && (
          <div className="flex min-h-0 flex-1 flex-col">
            {workspace ? (
              <HistorySidebar
                // Keyed by workspace so switching agents remounts the list instead
                // of showing the previous agent's conversations for a beat.
                key={`${workspace.t}|${workspace.s}|${workspace.r}`}
                workspace={workspace}
                onSelect={onConversationSelect}
                open={groups.conversations}
                onToggle={() => setGroup("conversations", !groups.conversations)}
              />
            ) : (
              // Present with an empty state, not absent: a group that appears once a
              // workspace is picked makes the pane's shape depend on selection, and
              // the first-run member is exactly who needs telling what to do next.
              <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
                <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {t.shell.conversations}
                </span>
              </div>
            )}
            {!workspace && (
              <p className="px-3 pb-2 text-xs leading-relaxed text-fg-muted">
                {t.nav.pickWorkspaceForConversations}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-brand/20 px-2 py-2">
        <AdminLink />
        <InstallAppButton />
      </div>

      {/* The account footer is the one piece of chrome present on every /chat and
          /admin view, so the language toggle lives here. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-brand/20 px-4 py-3">
        <span className="min-w-0 truncate text-sm text-fg-muted" title={email}>
          {email}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher />
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
