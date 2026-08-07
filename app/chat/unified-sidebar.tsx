"use client";

import { useEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { CircleArrowLeft } from "lucide-react";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import LogoutButton from "./logout-button";
import WorkspaceNav from "./workspace-nav";
import HistorySidebar from "./history-sidebar";
import AdminLink from "./admin-link";
import InstallAppButton from "./install-app-button";
import { resolvePanel, type SidebarPanel } from "./sidebar-panel-state";
import { useWorkspaceGroups } from "./use-workspaces";
import {
  accountName,
  type TenantGroup,
} from "@/lib/subscriptions";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// The one sidebar: brand header, ONE OF TWO PANELS, and the account footer.
//
// The two panels answer the two questions a member asks in sequence — which agent,
// then which conversation — and they are shown in that sequence. The previous version
// stacked them, splitting the column horizontally with the tree capped at 40vh above
// the conversation list. That put both questions on screen at once, competing for the
// same vertical space, and members read the result as one confusing pane rather than
// two clear steps.
//
// Everything the stacked version needed to arbitrate height is therefore gone: the
// 40vh cap and its vh-not-% argument, the per-group collapse, and the localStorage key
// that persisted which groups were open. Each panel now simply takes the body's full
// height and scrolls inside itself.

// The TRACK holds both panels side by side at exactly twice the viewport width and
// slides by half. Percent widths are safe here in a way the old percentage max-height
// was not: this resolves against a definite inline size (the pane's `--pane-w` on
// desktop, the drawer's fixed 300px on mobile), not against a flex-resolved height.
const track = cva("flex h-full w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none", {
  variants: {
    panel: {
      workspaces: "translate-x-0",
      chats: "-translate-x-1/2",
    },
  },
  defaultVariants: { panel: "workspaces" },
});

// Half the track, i.e. exactly the sidebar's width. `outline-none` because the slot is
// focused programmatically after a slide (tabIndex -1) and a focus ring around the
// whole panel would read as a selection rather than a landing point.
const slot = cva("flex w-1/2 min-h-0 shrink-0 flex-col outline-none");

export default function UnifiedSidebar({
  email,
  workspace,
  project,
  forceWorkspaces,
  onConversationSelect,
  onCollapse,
  browsing,
  setBrowsing,
}: {
  email: string;
  /** Null until the fragment resolves a workspace. */
  workspace: Workspace | null;
  /** agent-projects: from the route, null on /chat. */
  project: string | null;
  /**
   * True in the canvas view, which pins the tree. The canvas already lanes every
   * conversation, so listing them beside it is the same information twice — and
   * switching agent is the only navigation it still needs.
   */
  forceWorkspaces: boolean;
  /**
   * Closes the mobile drawer. Wired to CONVERSATION selection only.
   *
   * Picking a workspace deliberately leaves the drawer open: the slide to that
   * workspace's conversations happens INSIDE the open drawer, and that list is the
   * thing the member came for. Closing there made choosing an agent and then one of
   * its chats two open-close cycles.
   */
  onConversationSelect?: () => void;
  onCollapse?: () => void;
  /**
   * "The back control was pressed" — owned by the shell, not here, because the
   * COLLAPSED rail has to indicate which panel it would open, and a copy of this flag
   * living in each place is exactly the drift sidebar-panel-state.ts exists to avoid.
   */
  browsing: boolean;
  setBrowsing: (browsing: boolean) => void;
}) {
  const t = useT(chatCopy);

  // The workspace list, shared with the shell and the workspace grid via
  // useWorkspaceGroups: both panels here need it (the conversations panel names the
  // subscription its chats belong to), and so does the header outside.
  const { groups, error: workspacesError } = useWorkspaceGroups();

  // The back control was pressed. Deliberately not persisted: a stored panel outlives
  // the fragment that justified it, so a reload or a shared link would open on the
  // wrong one. Everything else is derived.
  const panel = resolvePanel({ workspace, browsing, forceWorkspaces });
  const showingChats = panel === "chats";

  // FOCUS HAS TO FOLLOW THE SLIDE. The control the member just activated — the back
  // button, an agent leaf — is inside the panel that is leaving, and `inert` on its
  // ancestor blurs it. Without this, pressing back drops focus to <body>, and inside
  // the mobile drawer (an overlay) there is no way back in except tabbing from the top
  // of the document.
  //
  // It is a REQUEST recorded by the handlers, not an effect watching `panel`, because
  // not every panel change is something the member asked for: the lone-workspace
  // shortcut flips to chats on its own, and stealing focus there is exactly the bug
  // this is meant to avoid.
  const [focusRequest, setFocusRequest] = useState<SidebarPanel | null>(null);
  const workspacesSlot = useRef<HTMLDivElement>(null);
  const chatsSlot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait for the panel to actually BE the requested one. Picking a workspace writes
    // the fragment, and the `hashchange` that resolves it lands a task later — so on
    // the render that records the request the chats panel is still inert, and focusing
    // an inert subtree does nothing at all.
    //
    // It also has to be an EFFECT rather than a `focus()` in the handler: on the
    // render this fires, `inert` has already been lifted off the incoming slot. Call
    // it at handler time and you are focusing a still-inert subtree, which does
    // nothing at all and fails silently.
    if (!focusRequest || panel !== focusRequest) return;
    // The SLOT, not the first control inside it. The slot is stable; the conversation
    // list is keyed by workspace and remounts when the agent changes, which lands a
    // beat after the panel flips — so focus placed on a control in there is blown away
    // by the remount moments later. The container survives it, and Tab from there
    // walks into the panel exactly as if the control had been focused.
    //
    // preventScroll IS LOAD-BEARING, not a nicety. `overflow-hidden` stops a user from
    // scrolling; it does not stop the browser, and focusing an element scrolls it into
    // view. Without this the viewport's scrollLeft jumps a full panel width to "reveal"
    // the chats slot — which the track had ALREADY revealed by translating — and the
    // two offsets compound, sliding the panel clean out of the box. The result is a
    // sidebar that animates over to nothing at all, and comes back on reload only
    // because a fresh document has scrollLeft 0.
    (focusRequest === "chats" ? chatsSlot : workspacesSlot).current?.focus({
      preventScroll: true,
    });
    setFocusRequest(null);
  }, [focusRequest, panel]);

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
            <CircleArrowLeft size={18} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* BOTH PANELS STAY MOUNTED for the whole transition. Unmounting the outgoing
            one is how a slide animates to a blank column — and back preserves the
            workspace precisely so the conversation list never loses its prop. Only the
            off-screen panel is taken out of the tab order. */}
        <div className={track({ panel })}>
          <div
            ref={workspacesSlot}
            // Focusable only programmatically (tabIndex -1) and named, so landing here
            // after a slide announces which panel you landed on.
            tabIndex={-1}
            role="group"
            aria-label={t.shell.workspaces}
            className={slot()}
            aria-hidden={showingChats}
            inert={showingChats || undefined}
          >
            <WorkspaceNav
              groups={groups}
              error={workspacesError}
              // Picking a workspace slides to its conversations. No onSelect closing
              // the drawer: see the prop's note above.
              onSelect={() => {
                setBrowsing(false);
                setFocusRequest("chats");
              }}
              // A lone workspace is entered automatically — unless the member came
              // back here on purpose, in which case selecting it for them would throw
              // them straight forward again.
              autoSelect={!browsing}
            />
          </div>

          <div
            ref={chatsSlot}
            tabIndex={-1}
            role="group"
            aria-label={workspace ? `${t.shell.agentPrefix} ${workspace.r}` : undefined}
            className={slot()}
            aria-hidden={!showingChats}
            inert={!showingChats || undefined}
          >
            {workspace ? (
              <HistorySidebar
                // Keyed by workspace so switching agents remounts the list instead
                // of showing the previous agent's conversations for a beat.
                key={`${workspace.t}|${workspace.s}|${workspace.r}|${project ?? ""}`}
                workspace={workspace}
                project={project}
                // Null until the tree loads, or when the subscription carries no name.
                // The header falls back to the agent alone rather than showing a uuid
                // where a name belongs.
                subscription={accountName(groups, workspace.t, workspace.s)}
                onSelect={onConversationSelect}
                onBack={() => {
                  setBrowsing(true);
                  setFocusRequest("workspaces");
                }}
              />
            ) : (
              // Unreachable in practice — the track only moves here once a workspace
              // is set — but the slot is always rendered, so it needs something that
              // is not a crash on a required prop.
              <div className="flex-1" />
            )}
          </div>
        </div>
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
