"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import {
  useFragment,
  toWorkspace,
  clearWorkspace,
  setDestination,
  setRightSidebar,
  setFragmentProject,
  setFragmentProjectSid,
} from "./fragment";
import { asDestination, resolveCentre } from "./destination";
import { asSection, nextSidebarValue } from "./workspace-sections";
import { DESTINATION_ROWS, rowIcon, rowKey, rowLabel } from "./sidebar-destinations";
import { buildCrumbs } from "./crumbs";
import { useWorkspaceGroups } from "./use-workspaces";
import { useProjects } from "./use-projects";
import { useConversations } from "./use-conversations";
import { restoreDockedTurns } from "./turn-restore";
import type { ChatReference } from "@/lib/chatReference";
import { accountName } from "@/lib/subscriptions";
import UnifiedSidebar from "./unified-sidebar";
import Breadcrumb from "./breadcrumb";
import ChatView from "./chat-view";
import TurnDock from "./turn-dock";
import WorkspaceGrid from "./workspace-grid";
import ProjectsScreen from "./projects-screen";
import LandingScreen from "./landing-screen";
import WorkspaceScreen from "./workspace-screen";
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

// The whole /chat experience on one route.
//
// The shell owns FOUR things its children cannot: where the member is (the fragment),
// what the centre pane therefore shows, what is open in the pane beside it, and the
// breadcrumb that names the first of those. The breadcrumb is here rather than inside
// ChatView deliberately — ChatView is keyed on the workspace and
// unmounts on a switch, which is exactly why TurnDock is its sibling too. Chrome that
// says "where am I" must outlive the thing it is describing.
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
  // TWO KEYS, TWO RENDER TARGETS, and the shell is where that stops being an abstraction:
  // `v` decides what fills the CENTRE instead of the conversation, `rs` decides what
  // opens BESIDE it. Neither is consulted about the other, which is the whole reason
  // there are two of them (fragment.ts records the reversal that produced the pair).
  const destination = asDestination(fragment?.v);
  const openSection = asSection(fragment?.rs);

  // Drives the turn dock's layout: it docks differently on a phone.
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // Bumped whenever something the member did needs a restart (a secret write),
  // so the banner appears at once instead of at its next poll.
  const [restartRefresh, setRestartRefresh] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [peeking, setPeeking] = useState(false);

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

  // ONE mobile button, and it TOGGLES. Pressing the control that opened a panel is how
  // anyone closes one, and it used to do nothing.
  const toggleDrawer = () => setDrawerOpen((v) => !v);

  // The composer's context slot. Owned here rather than in ChatView because ChatView is
  // keyed on the workspace and unmounts on a switch; a reference picked before the
  // switch would go with it.
  const [chatRef, setChatRef] = useState<ChatReference | null>(null);
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

  // The same three lists the screens themselves read, so the breadcrumb can never name a
  // project or a conversation that the surface below it has already dropped.
  const { projects, error: projectsError } = useProjects(workspace ?? null);
  const { conversations } = useConversations(workspace ?? null);
  const subscription = workspace
    ? accountName(groups, workspace.t, workspace.s)
    : null;

  const openProject = projects.find((p) => p.id === project) ?? null;
  const openConversation = conversations.find((c) => c.id === sessionId) ?? null;
  // The alias wins where there is one: it is what the member named the conversation,
  // and the title is what the transcript's first message made of it.
  const conversationTitle =
    openConversation?.alias?.trim() || openConversation?.title || null;

  // An agent whose proxy predates projects. The row and the screen go together — a
  // sidebar row that leads to a screen rendering nothing is worse than no row.
  const hideProjects = projectsError === "projects_unsupported";

  const centre = resolveCentre({ resolved, workspace, destination, sid: sessionId ?? null });

  // "New chat" NAVIGATES now; it does not create. It used to mint a conversation and
  // write its id straight into the fragment, which put a member in a blank transcript
  // holding a `sid` no row existed for -- the same state FR-3.5 removed from entering a
  // place. Dropping `sid` lands on the landing, whose composer is the one mint.
  function newChat() {
    if (!workspace) return;
    setFragmentProject(project);
    closeDrawer();
  }

  const crumbs = useMemo(
    () =>
      buildCrumbs({
        workspace,
        subscription,
        project: openProject,
        conversationTitle,
        destination,
        t,
        onWorkspace: clearWorkspace,
        // Keeps `p`: asking to see the list is not leaving the project you are in
        // (FR-1.5). The grid marks it as the one you are inside.
        onProjects: () => setDestination("projects"),
        // Up one level from a conversation is the PROJECT, which drops `sid` and lands
        // on the project's own screen. It used to be the list of projects, which is what
        // `Projects` above it carries now.
        onProject: () => openProject && setFragmentProject(openProject.id),
      }),
    [workspace, subscription, openProject, conversationTitle, destination, t],
  );

  // The rail's content hints: the SAME rows the open sidebar lists, read off the same
  // array, plus the one action. Project shortcuts used to live here because a collapsed
  // rail could not say WHICH project you were in; the breadcrumb says it now, at every
  // width.
  //
  // A row means here exactly what it means there, toggle included: `nextSidebarValue` is
  // what both call, so clicking the open section on the rail closes the pane rather than
  // reopening it on itself.
  const railDestinations: RailPanel[] = workspace
    ? DESTINATION_ROWS.filter((r) => !(r.kind === "projects" && hideProjects)).map((r) => ({
        key: rowKey(r),
        Icon: rowIcon(r),
        label: rowLabel(r, t),
        active: r.kind === "projects" ? destination !== null : openSection === r.section,
        onSelect: () =>
          r.kind === "projects"
            ? setDestination("projects")
            : setRightSidebar(nextSidebarValue(openSection, r.section)),
      }))
    : [];

  const railActions: RailPanel[] = workspace
    ? [
        {
          key: "new-chat",
          Icon: MessageSquarePlus,
          label: t.history.newChat,
          active: false,
          emphasis: true,
          onSelect: newChat,
        },
      ]
    : [];

  const railGroups = [railDestinations, railActions].filter((g) => g.length > 0);

  return (
    // `h-dvh`, not `h-screen`: `100vh` is the LARGE viewport, which ignores both the
    // retractable browser UI and the soft keyboard, so the column stayed taller than the
    // screen and the top bar went with it. The dynamic viewport tracks what is actually
    // visible. Paired with `interactiveWidget: "resizes-content"` in app/layout.tsx —
    // neither half works alone.
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for mobile drawers */}
        {drawerOpen && (
          <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={closeDrawer} aria-hidden />
        )}

        <ResizablePane
          ariaLabel={t.shell.destinations}
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
            workspace={workspace}
            project={project}
            projectsOpen={destination !== null}
            openSection={openSection}
            hideProjects={hideProjects}
            onProjects={() => setDestination("projects")}
            onSection={setRightSidebar}
            onNewChat={newChat}
            onConversationSelect={closeDrawer}
            // FR-4.2. The hover preview renders this same sidebar in its collapsed
            // state, and the rail beside it already lists the destinations as icons.
            showDestinations={!collapsed}
            // UNDEFINED while collapsed, which OMITS the header's collapse button
            // entirely: while collapsed — and the hover preview shows the panel in
            // exactly that state — "collapse" is a state the pane is already in, so the
            // control could only ever be a no-op.
            onCollapse={
              collapsed
                ? undefined
                : () => {
                    setCollapsed(true);
                    setPeeking(false);
                  }
            }
          />
        </ResizablePane>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* ONE bar across the top, and it is the path. It replaces both the mobile
              agent strip and the chat view's own header, which named the subscription
              and agent while the sidebar separately named the project — two opposite
              corners of the screen for one location. */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={drawerOpen ? t.shell.closeMenu : t.shell.openMenu}
              aria-expanded={drawerOpen}
              onClick={toggleDrawer}
              className="md:hidden"
            >
              {drawerOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </IconButton>
            {crumbs.length > 0 ? (
              <Breadcrumb
                crumbs={crumbs}
                // Passed unconditionally. Whether the menu is offered is decided from
                // the LAST CRUMB, inside the bar, because that is the fact the menu
                // depends on and the only place that knows it — see breadcrumb.tsx.
                sessionId={sessionId ?? null}
                onChanged={() => {}}
                onDeleted={() => setFragmentProject(project)}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg">
                <BrandName />
              </span>
            )}
          </div>

          {/* Above the centre pane: a pending restart is a property of the workspace,
              not of the view you happen to be in. */}
          {workspace && (
            // Keyed by the workspace so switching agents remounts it: without this the
            // previous workspace's pending status renders for a beat against the newly
            // selected one.
            <RestartBanner
              key={`${workspace.t}|${workspace.s}|${workspace.r}`}
              workspace={workspace}
              refreshKey={restartRefresh}
            />
          )}
          <div className="min-h-0 flex-1">
            {centre.kind === "loading" && (
              <div className="flex h-full items-center justify-center">
                <Spinner size={28} />
              </div>
            )}
            {/* No workspace chosen yet: the content pane BECOMES the picker, rather than
                a welcome note pointing at a sidebar that is collapsed on narrow screens.
                It is also the only way back in, which is why the breadcrumb's root
                segment keeps its link however short the path is. */}
            {centre.kind === "agents" && <WorkspaceGrid />}
            {centre.kind === "destination" && workspace && (
              <ProjectsScreen
                workspace={workspace}
                browsedProject={project}
                onBrowse={(id) => setFragmentProject(id)}
              />
            )}
            {/* A place before a conversation is chosen: the agent's root and a
                project's root alike. It replaced an empty transcript, and the effect
                that used to fill that transcript with a freshly minted conversation is
                gone with it -- see landing-screen.tsx. */}
            {centre.kind === "landing" && workspace && (
              <LandingScreen
                // Keyed by the scope, so entering a project rebuilds the list rather
                // than showing the previous scope's conversations for a beat.
                key={`${workspace.t}|${workspace.s}|${workspace.r}|${project ?? ""}`}
                workspace={workspace}
                project={openProject}
                onOpen={(id) => setFragmentProjectSid(project, id)}
              />
            )}
            {centre.kind === "chat" && workspace && (
              <ChatView
                workspace={workspace}
                sessionId={sessionId}
                project={project}
                chatRef={chatRef}
                onChatRef={setChatRef}
                onRestartNeeded={() => setRestartRefresh((n) => n + 1)}
              />
            )}
          </div>
          {/* Last child of the chat column, and a SIBLING of ChatView rather than a
              child: ChatView is keyed on the workspace above and unmounts on a workspace
              switch, which is exactly the moment the dock has to keep standing. It now
              outlives a destination change too, which is the same requirement with a
              second reason. */}
          <TurnDock currentSid={sessionId} currentWorkspace={workspace} desktop={desktop} />
        </main>

        {/* THE PANE, AND IT IS A SIBLING OF <main>, NOT A CHILD OF IT.
            The two are peers in the same flex row, exactly as the sidebar is on the other
            edge, which is what makes "beside the conversation" true at the layout level:
            the centre column reflows to whatever is left, rather than the pane sliding
            over the transcript the member opened it to read alongside.

            The height chain the five panels need starts here — this row is
            `min-h-0 flex-1` under `h-dvh`, so the <aside> stretches to a definite height
            and workspace-pane.tsx can hand one down. */}
        {openSection && workspace && (
          <WorkspaceScreen
            // Keyed by the workspace AND the project: a section addresses one workspace
            // directory, so entering a project must rebuild it rather than leave the
            // agent's own memory or files on screen under the project's name.
            key={`${workspace.t}|${workspace.s}|${workspace.r}|${project ?? ""}`}
            workspace={workspace}
            section={openSection}
            onClose={() => setRightSidebar(null)}
            onReference={setChatRef}
            onRestartNeeded={() => setRestartRefresh((n) => n + 1)}
          />
        )}
      </div>
    </div>
  );
}
