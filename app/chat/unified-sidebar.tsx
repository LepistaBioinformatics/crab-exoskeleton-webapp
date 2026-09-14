"use client";

import { CircleArrowLeft, MessageSquarePlus } from "lucide-react";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import LogoutButton from "./logout-button";
import HistorySidebar from "./history-sidebar";
import SidebarDestinations from "./sidebar-destinations";
import AdminLink from "./admin-link";
import InstallAppButton from "./install-app-button";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";
import type { Section } from "./workspace-sections";

// The one sidebar: brand header, the new-chat action, the destinations, the
// conversation list, the account footer. One column, top to bottom.
//
// IT USED TO SLIDE. Two panels sat side by side on a track twice the pane's width and it
// translated between them, asking "which agent" and then "which conversation" in
// sequence. The track is gone with the first of those questions: choosing an agent
// happens on the agent grid in the centre of the screen now, which is where it always
// had more room than a 300px column could give it.
//
// Everything the track needed has gone with it -- the `armed` flag that kept the first
// settling jump from animating, the focus requests that put the cursor back after a
// slide, the `inert` on whichever panel was off screen. None of it was incidental: each
// answered a real bug. They are named here because their absence is the thing to check
// if the sidebar ever starts moving on its own again.

export default function UnifiedSidebar({
  email,
  workspace,
  project,
  projectsOpen,
  openSection,
  onProjects,
  onSection,
  onNewChat,
  onConversationSelect,
  onCollapse,
  hideProjects,
  showDestinations = true,
}: {
  email: string;
  /** Null until the fragment resolves a workspace. */
  workspace: Workspace | null;
  /** agent-projects: the project being browsed, from the fragment's `p`. */
  project: string | null;
  /** The centre pane is showing the projects screen -- the fragment's `v`. */
  projectsOpen: boolean;
  /** The section open in the pane beside the conversation, or null -- the fragment's `rs`. */
  openSection: Section | null;
  onProjects: () => void;
  /** The section the pane should show next, or null to close it. */
  onSection: (next: Section | null) => void;
  onNewChat: () => void;
  /**
   * Closes the mobile drawer. Wired to every row that changes what is on screen behind
   * it -- a conversation, the projects screen, a section -- because leaving it open would
   * cover the thing the member just asked for.
   *
   * A section row is included even though its pane opens on the OPPOSITE edge: on a phone
   * that pane is a full-screen drawer of its own, so it covers this one regardless, and
   * the drawer left standing underneath is what the member finds when they close it.
   * On desktop there is no drawer and this is a no-op.
   */
  onConversationSelect?: () => void;
  onCollapse?: () => void;
  /** The agent's proxy predates projects; the row is omitted rather than disabled. */
  hideProjects?: boolean;
  /**
   * False while the pane is COLLAPSED, which is also the state the hover preview shows
   * it in. The rail standing beside the preview already lists these same destinations as
   * icons, so showing them again inside the preview offered the menu twice and the
   * conversations once — and the conversations are what a member hovers a collapsed
   * sidebar to find.
   */
  showDestinations?: boolean;
}) {
  const t = useT(chatCopy);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Logo size={32} />
        <BrandName className="min-w-0 flex-1 truncate font-display text-base font-semibold text-fg" />
        {onCollapse && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.nav.collapseSidebar}
            title={t.nav.collapse}
            onClick={onCollapse}
            className="hidden md:inline-flex"
          >
            <CircleArrowLeft size={18} aria-hidden />
          </IconButton>
        )}
      </div>

      {/* Everything between the header and the footer needs a workspace to mean
          anything: there is no list of chats, no project and no files until an agent is
          chosen. With none chosen the centre pane IS the agent grid, so the sidebar has
          nothing to add and says nothing rather than explaining itself. */}
      {workspace && (
        <>
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={onNewChat}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-fg transition-colors hover:bg-elevated"
            >
              <MessageSquarePlus size={16} className="shrink-0" aria-hidden />
              <span className="truncate">{t.history.newChat}</span>
            </button>
          </div>

          {/* HIDDEN AT `md+` WHEN COLLAPSED, not dropped. `collapsed` is a desktop-only
              state: below `md` this pane is an off-canvas drawer and there is no rail,
              so removing the rows on a phone because the desktop pane happens to be
              collapsed would take the only way to reach them. The breakpoint is the
              same one the rail appears at, which is what makes the swap exact. */}
          <div className={showDestinations ? undefined : "md:hidden"}>
            <SidebarDestinations
              projectsOpen={projectsOpen}
              openSection={openSection}
              hideProjects={hideProjects}
              onProjects={() => {
                onProjects();
                onConversationSelect?.();
              }}
              onSection={(next) => {
                onSection(next);
                onConversationSelect?.();
              }}
            />
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <HistorySidebar
              // Keyed by workspace so switching agents remounts the list instead of
              // showing the previous agent's conversations for a beat.
              //
              // The PROJECT is deliberately not in this key: the fetch depends on
              // `workspace.p` directly, and keying on it would throw away the panel's
              // scroll position and folds on every project switch.
              key={`${workspace.t}|${workspace.s}|${workspace.r}`}
              workspace={workspace}
              project={project}
              onSelect={onConversationSelect}
            />
          </div>
        </>
      )}

      {!workspace && <div className="min-h-0 flex-1" />}

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-rule px-2 py-2">
        <AdminLink />
        <InstallAppButton />
      </div>

      {/* The account footer is the one piece of chrome present on every /chat and
          /admin view, so the language toggle lives here. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-rule px-4 py-3">
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
