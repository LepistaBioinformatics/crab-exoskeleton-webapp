"use client";

import { useEffect, useState } from "react";
import { Menu, MessageSquare } from "lucide-react";
import { useFragment, toWorkspace } from "./fragment";
import NavSidebar from "./nav-sidebar";
import HistorySidebar from "./history-sidebar";
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

const NAV_MIN = 220;
const NAV_DEFAULT = 280;
const HISTORY_MIN = 240;
const HISTORY_DEFAULT = 300;
const LAYOUT_KEY = "chat-sidebars";

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

  const [navOpen, setNavOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navWidth, setNavWidth] = useState(NAV_DEFAULT);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [historyWidth, setHistoryWidth] = useState(HISTORY_DEFAULT);

  // Restore persisted desktop layout once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.navWidth === "number") setNavWidth(s.navWidth);
      if (typeof s.historyWidth === "number") setHistoryWidth(s.historyWidth);
      if (typeof s.navCollapsed === "boolean") setNavCollapsed(s.navCollapsed);
      if (typeof s.historyCollapsed === "boolean") setHistoryCollapsed(s.historyCollapsed);
    } catch {
      // ignore malformed layout
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({ navWidth, historyWidth, navCollapsed, historyCollapsed }),
      );
    } catch {
      // storage unavailable -- layout just won't persist
    }
  }, [navWidth, historyWidth, navCollapsed, historyCollapsed]);

  const closeDrawers = () => {
    setNavOpen(false);
    setHistoryOpen(false);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 border-b border-brand/30 bg-surface px-3 py-2 md:hidden">
        <IconButton variant="ghost" size="sm" aria-label={t.shell.openWorkspaces} onClick={() => setNavOpen(true)}>
          <Menu size={20} aria-hidden />
        </IconButton>
        <span className="flex-1 truncate font-display text-sm font-semibold text-fg">
          {workspace ? `${t.shell.agentPrefix} ${workspace.r}` : <BrandName />}
        </span>
        {workspace && (
          <IconButton variant="ghost" size="sm" aria-label={t.shell.conversations} onClick={() => setHistoryOpen(true)}>
            <MessageSquare size={20} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for mobile drawers */}
        {(navOpen || historyOpen) && (
          <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={closeDrawers} aria-hidden />
        )}

        <ResizablePane
          ariaLabel={t.shell.workspaces}
          open={navOpen}
          collapsed={navCollapsed}
          width={navWidth}
          minWidth={NAV_MIN}
          onExpand={() => setNavCollapsed(false)}
          onResize={setNavWidth}
        >
          <NavSidebar
            email={email}
            onSelect={closeDrawers}
            onCollapse={() => setNavCollapsed(true)}
          />
        </ResizablePane>

        {workspace && !canvas && (
          <ResizablePane
            ariaLabel={t.shell.conversations}
            open={historyOpen}
            collapsed={historyCollapsed}
            width={historyWidth}
            minWidth={HISTORY_MIN}
            onExpand={() => setHistoryCollapsed(false)}
            onResize={setHistoryWidth}
          >
            <HistorySidebar
              workspace={workspace}
              onSelect={() => setHistoryOpen(false)}
              onCollapse={() => setHistoryCollapsed(true)}
            />
          </ResizablePane>
        )}

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
