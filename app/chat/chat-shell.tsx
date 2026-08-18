"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Folders, Menu, MessageSquarePlus, MessagesSquare, X } from "lucide-react";
import {
  useFragment,
  setView,
  toWorkspace,
  setFragmentProject,
  setFragmentProjectSid,
} from "./fragment";
import { resolvePanel } from "./sidebar-panel-state";
import { useWorkspaceGroups } from "./use-workspaces";
import { useProjects } from "./use-projects";
import { projectInitials } from "@/lib/projects";
import { createConversation } from "@/lib/chatSession";
import { restoreDockedTurns } from "./turn-restore";
import type { ChatReference } from "@/lib/chatReference";
import { accountName } from "@/lib/subscriptions";
import UnifiedSidebar from "./unified-sidebar";
import ChatView from "./chat-view";
import TurnDock from "./turn-dock";
import CanvasTimeline from "./canvas-timeline";
import WorkspaceGrid from "./workspace-grid";
import RestartBanner from "./restart-banner";
import ResizablePane, { type RailPanel } from "./resizable-pane";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import BrandName from "@/app/brand-name";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// 240 was the history pane's floor, and the conversation rows are what set it.
const SIDEBAR_MIN = 240;
// One pane replaces two. 300 is the larger of the two old defaults, because
// conversation rows carry inline actions and tags; 240 was the history pane's floor.
const SIDEBAR_DEFAULT = 300;
// A NEW key. Two old widths cannot be half-applied to one pane, and reading the old
// `navWidth` would hand members a narrower sidebar than either of the two they had.
const LAYOUT_KEY = "chat-sidebar";

// The whole /chat experience on one route: the nav drawer is always present;
// the history drawer + chat view mount only when the fragment carries a valid
// workspace. On desktop each sidebar collapses/resizes independently (persisted
// in localStorage); on mobile they are hamburger-toggled overlay drawers.
export default function ChatShell({ email }: { email: string }) {
  const t = useT(chatCopy);
  const fragment = useFragment();
  const resolved = fragment !== null;
  // agent-projects: read from the FRAGMENT, like the rest of the selection. It was a
  // route param for a while — see fragment.ts setFragmentProject for why that made
  // every project click replay the sidebar's slide.
  const project = fragment?.p ?? null;
  // The project rides on the workspace, so every client that already takes a
  // workspace addresses the right directory without a second argument.
  const base = fragment ? toWorkspace(fragment) : null;
  const workspace = base ? { ...base, p: project } : null;
  const sessionId = fragment?.sid;

  // Canvas is a desktop-only top-level view; on mobile a shared `view=canvas`
  // link is ignored and the traditional chat renders (spec edge case).
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const canvas = fragment?.view === "canvas" && !!workspace && desktop;

  // Bumped whenever something the member did needs a restart (a secret write),
  // so the banner appears at once instead of at its next poll.
  const [restartRefresh, setRestartRefresh] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  // Which group the button that opened the drawer wants in front. Both buttons open
  // the same pane and the same components; this only decides what is expanded and
  // scrolled to.

  // Restore persisted desktop layout once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.width === "number") setWidth(saved.width);
      if (typeof saved.collapsed === "boolean") setCollapsed(saved.collapsed);
    } catch {
      // ignore malformed layout
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ width, collapsed }));
    } catch {
      // storage unavailable -- layout just won't persist
    }
  }, [width, collapsed]);

  const closeDrawer = () => setDrawerOpen(false);

  // ONE mobile button, and it TOGGLES.
  //
  // There were two — a hamburger for workspaces and a message icon for conversations —
  // on the reasoning that losing the direct conversation shortcut would turn the most
  // frequent action into open-scroll-pick. Unifying the panes removed that reasoning:
  // both groups are open by default, so the drawer already lands with the conversation
  // list on screen. The second button differed only for a member who had collapsed
  // Conversations by hand, which is not worth a permanent second control that looks
  // like another way to open the same panel.
  //
  // And it toggles rather than only opening: pressing the control that opened a panel
  // is how anyone closes one, and it did nothing.
  const toggleDrawer = () => setDrawerOpen((v) => !v);

  // WHICH PANEL the sidebar shows, owned here rather than inside it because the
  // COLLAPSED RAIL has to advertise the same answer. Two copies of `browsing` would be
  // exactly the drift sidebar-panel-state.ts is shaped to prevent.
  const [browsing, setBrowsing] = useState(false);
  // The collapsed sidebar's hover preview, owned here because the PREVIEWED panel
  // renders its own collapse control. Left inside the pane, that control called
  // collapse on an already-collapsed pane — a no-op, so the button a member could
  // plainly see did nothing. Here it can end the preview, which is what it means.
  const [peeking, setPeeking] = useState(false);
  // The composer's context slot, owned HERE rather than in ChatView: Canvas replaces the
  // chat view entirely, so a reference picked on the timeline would unmount with the view
  // it was picked from. Held above both, it survives the switch.
  const [chatRef, setChatRef] = useState<ChatReference | null>(null);
  // The tree, for the subscription NAME the chat header leads with. Same hook the
  // sidebar and the workspace grid use, so all three agree on it and on what a 401 means.
  const router = useRouter();
  const { groups } = useWorkspaceGroups();

  // background-turn-dock: a reload loses sight of every turn but the one it happens to
  // mount, so the dock is rebuilt from the proxy as soon as we know which workspaces to
  // ask. Fire-and-forget, and idempotent at module scope — this effect can re-run on a
  // groups refetch and the fan-out must not.
  useEffect(() => {
    if (!groups) return;
    const workspaces = groups.flatMap((tenant) =>
      tenant.accounts.flatMap((account) =>
        account.agents.map((agent) => ({
          t: agent.tenantId,
          s: agent.subsAccId,
          r: agent.role,
        })),
      ),
    );
    if (workspaces.length === 0) return;
    void restoreDockedTurns(workspaces, () => router.push("/signin"));
  }, [groups, router]);
  // The same list the sidebar's projects section shows, so the rail cannot offer a
  // shortcut into a project that was just deleted.
  const { projects } = useProjects(workspace ?? null);
  const subscription = workspace
    ? accountName(groups, workspace.t, workspace.s)
    : null;
  const panel = resolvePanel({
    workspace: workspace ?? null,
    browsing,
    forceWorkspaces: canvas,
  });

  // The rail's content hints.
  //
  // Chats is OMITTED entirely until a workspace exists, rather than rendered inert.
  // It was disabled at first, and a disabled button swallows the click — so the icon
  // was visible, looked like a way in, and did not even open the pane. An icon that is
  // there always works; one with nothing behind it is not there.
  const railPanels: RailPanel[] = [
    {
      key: "workspaces",
      Icon: Boxes,
      label: t.shell.workspaces,
      active: panel === "workspaces",
      onSelect: () => setBrowsing(true),
    },
    ...(workspace
      ? [
          {
            key: "chats",
            Icon: MessagesSquare,
            label: t.shell.conversations,
            active: panel === "chats",
            onSelect: () => setBrowsing(false),
          },
        ]
      : []),
  ];

  // The projects, as shortcuts. A collapsed rail could not previously say WHICH
  // project you were in — the one question a 48px column is actually well shaped to
  // answer — and getting into one meant opening the pane first.
  //
  // Initials rather than a folder glyph each: a column of identical folders names
  // nothing, and the name is the only thing that tells one project from the next.
  //
  // These NAVIGATE, unlike the panel entries above them, which is why they are their
  // own group behind a hairline. Same fragment write the sidebar's list uses, so both
  // entry points enter a project identically.
  const railProjects: RailPanel[] = projects.map((p) => ({
    key: `project-${p.id}`,
    Icon: Folders,
    label: p.name,
    initials: projectInitials(p.name),
    active: project === p.id,
    onSelect: () => setFragmentProject(p.id),
  }));

  // Actions, not destinations: a third group because clicking one DOES something
  // rather than changing what the pane would show.
  const railActions: RailPanel[] = workspace
    ? [
        {
          key: "new-chat",
          Icon: MessageSquarePlus,
          label: t.history.newChat,
          active: false,
          emphasis: true,
          // Project AND session in one write: the new chat is born in whichever
          // project the rail is showing, and two separate hash writes would put a
          // half-state into the history stack.
          onSelect: () => {
            void createConversation(workspace, project).then((c) =>
              setFragmentProjectSid(project, c.id),
            );
          },
        },
      ]
    : [];

  const railGroups = [railPanels, railProjects, railActions].filter(
    (g) => g.length > 0,
  );

  return (
    // `h-dvh`, not `h-screen`: `100vh` is the LARGE viewport, which ignores both the
    // retractable browser UI and the soft keyboard, so the column stayed taller than the
    // screen and the top bar went with it. The dynamic viewport tracks what is actually
    // visible. Paired with `interactiveWidget: "resizes-content"` in app/layout.tsx —
    // neither half works alone.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 border-b border-brand/30 bg-surface px-3 py-2 md:hidden">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={drawerOpen ? t.shell.closeMenu : t.shell.openWorkspaces}
          aria-expanded={drawerOpen}
          onClick={toggleDrawer}
        >
          {drawerOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </IconButton>
        <span className="flex-1 truncate font-display text-sm font-semibold text-fg">
          {workspace ? `${t.shell.agentPrefix} ${workspace.r}` : <BrandName />}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for mobile drawers */}
        {drawerOpen && (
          <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={closeDrawer} aria-hidden />
        )}

        <ResizablePane
          ariaLabel={t.shell.workspaces}
          open={drawerOpen}
          collapsed={collapsed}
          width={width}
          minWidth={SIDEBAR_MIN}
          // Clearing the preview on expand matters: left true, the NEXT collapse would
          // render the preview with no hover behind it, which reads as collapse failing.
          onExpand={() => {
            setCollapsed(false);
            setPeeking(false);
          }}
          onResize={setWidth}
          groups={railGroups}
          peeking={peeking}
          onPeekChange={setPeeking}
        >
          <UnifiedSidebar
            email={email}
            resolved={resolved}
            workspace={workspace}
            project={project}
            forceWorkspaces={canvas}
            onConversationSelect={closeDrawer}
            // UNDEFINED while collapsed, which OMITS the header's collapse button
            // entirely (the sidebar guards on this prop).
            //
            // That is the fix for the button that did nothing: while collapsed — and the
            // hover preview shows the panel in exactly that state — "collapse" is a state
            // the pane is already in, so the control could only ever be a no-op. Two
            // open/close controls were visible at once, and the one under the cursor was
            // the dead one. Now there is one control per state: this button while open,
            // the rail's mirrored one while closed.
            onCollapse={
              collapsed
                ? undefined
                : () => {
                    setCollapsed(true);
                    setPeeking(false);
                  }
            }
            browsing={browsing}
            setBrowsing={setBrowsing}
          />
        </ResizablePane>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Above both the chat and the canvas: a pending restart is a property
              of the workspace, not of the view you happen to be in. */}
          {workspace && (
            // Keyed by the workspace so switching agents remounts it: without
            // this the previous workspace's pending status renders for a beat
            // against the newly selected one.
            <RestartBanner
              key={`${workspace.t}|${workspace.s}|${workspace.r}`}
              workspace={workspace}
              refreshKey={restartRefresh}
            />
          )}
          <div className="min-h-0 flex-1">
            {!resolved ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={28} />
              </div>
            ) : canvas && workspace ? (
              <CanvasTimeline
                workspace={workspace}
                onReference={(ref) => {
                  setChatRef(ref);
                  // Back to the chat, because that is where the composer is — picking a
                  // reference is the member saying they want to say something about it.
                  setView("chat");
                }}
              />
            ) : workspace ? (
              <ChatView
                workspace={workspace}
                subscription={subscription}
                sessionId={sessionId}
                project={project}
                chatRef={chatRef}
                onChatRef={setChatRef}
                onRestartNeeded={() => setRestartRefresh((n) => n + 1)}
              />
            ) : (
              // No workspace chosen yet: the content pane BECOMES the picker, rather
              // than a welcome note pointing at a sidebar that is collapsed on narrow
              // screens. Falls back to the welcome copy when there is nothing to pick.
              <WorkspaceGrid />
            )}
          </div>
          {/* Last child of the chat column, and a SIBLING of ChatView rather than a child:
              ChatView is keyed on the workspace above and unmounts on a workspace switch,
              which is exactly the moment the dock has to keep standing.

              SPEC_DEVIATION: spec DEC-11 put the mobile dock ABOVE the composer.
              Reason: the composer lives inside ChatView, so "above the composer" would
              mean mounting the dock inside the component it must outlive. DEC-11's actual
              goal — no collision with the composer or the soft keyboard — is met instead by
              document order (the bar cannot cover what precedes it, since the shell is
              `h-dvh` with `interactiveWidget: "resizes-content"`) plus hiding the bar on
              mobile while a text field has focus. See dock-segments.hidesForKeyboard. */}
          <TurnDock currentSid={sessionId} currentWorkspace={workspace} desktop={desktop} />
        </main>
      </div>
    </div>
  );
}
