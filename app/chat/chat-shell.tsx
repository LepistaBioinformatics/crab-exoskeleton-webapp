"use client";

import { useEffect, useState } from "react";
import { Menu, MessageSquare } from "lucide-react";
import { useFragment, toWorkspace } from "./fragment";
import UnifiedSidebar, { type FocusRequest, type SidebarFocus } from "./unified-sidebar";
import ChatView from "./chat-view";
import CanvasTimeline from "./canvas-timeline";
import EmptyState from "./empty-state";
import RestartBanner from "./restart-banner";
import ResizablePane from "./resizable-pane";
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
  const workspace = fragment ? toWorkspace(fragment) : null;
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
  // A counter, not just the group: tapping the same button twice has to read as two
  // requests, or a member who collapsed a group by hand gets a drawer that ignores
  // the button they just pressed.
  const [focus, setFocus] = useState<FocusRequest>({ group: "workspaces", n: 0 });

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

  // Both mobile buttons open the SAME drawer; they differ only in which group they
  // ask for. Dropping the direct conversation button would turn switching
  // conversation, the most frequent action, from one tap into open-scroll-pick.
  const openDrawer = (want: SidebarFocus) => {
    setFocus((prev) => ({ group: want, n: prev.n + 1 }));
    setDrawerOpen(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 border-b border-brand/30 bg-surface px-3 py-2 md:hidden">
        <IconButton variant="ghost" size="sm" aria-label={t.shell.openWorkspaces} onClick={() => openDrawer("workspaces")}>
          <Menu size={20} aria-hidden />
        </IconButton>
        <span className="flex-1 truncate font-display text-sm font-semibold text-fg">
          {workspace ? `${t.shell.agentPrefix} ${workspace.r}` : <BrandName />}
        </span>
        {workspace && (
          <IconButton variant="ghost" size="sm" aria-label={t.shell.conversations} onClick={() => openDrawer("conversations")}>
            <MessageSquare size={20} aria-hidden />
          </IconButton>
        )}
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
          onExpand={() => setCollapsed(false)}
          onResize={setWidth}
        >
          <UnifiedSidebar
            email={email}
            workspace={workspace}
            focus={focus}
            hideConversations={canvas}
            onSelect={closeDrawer}
            onCollapse={() => setCollapsed(true)}
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
              <CanvasTimeline workspace={workspace} />
            ) : workspace ? (
              <ChatView
                workspace={workspace}
                sessionId={sessionId}
                onRestartNeeded={() => setRestartRefresh((n) => n + 1)}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
