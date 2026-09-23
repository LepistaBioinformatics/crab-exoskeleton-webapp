"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MessageSquarePlus, MessagesSquare, X } from "lucide-react";
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
import { asSection, type Section } from "./workspace-sections";
import { railDestinationGroups } from "./sidebar-destinations";
import { useMangroveEnabled } from "./use-mangrove";
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
import MangroveScreen from "./mangrove-screen";
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
  // Bumped by "New chat" — see the function for why a navigation alone is not enough.
  const [composeFocus, setComposeFocus] = useState(0);

  // THE SECTION THE PANE IS CLOSING ON, which outlives the fragment that named it.
  //
  // `rs` clears the instant the pane is dismissed — and three gestures dismiss it: the
  // pane's own X, the collapsed rail's icon, and the sidebar row toggled off — so the
  // <aside> left the tree in the same frame and there was nothing left to animate. The
  // pane opened over 200ms and vanished in one.
  //
  // Holding the section here for the length of the exit is the only shape that covers all
  // three gestures: a `closing` flag owned by the pane itself would only ever see the X.
  const [exiting, setExiting] = useState<Section | null>(null);
  const lastSection = useRef<Section | null>(null);
  useEffect(() => {
    if (openSection !== null) setExiting(null);
    else if (lastSection.current !== null) setExiting(lastSection.current);
    lastSection.current = openSection;
  }, [openSection]);
  // What the pane renders: the open section, or the one it is still playing out.
  const shownSection = openSection ?? exiting;

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
  // THE ROW IS ABSENT WHERE THERE IS NO MANGROVE, which it was not: only
  // `projects` was ever filtered, so a deployment without one still offered
  // `Mangrove Network` in the sidebar and answered with a blank centre pane. The
  // screen hides ITSELF on the proxy's 404, which is what made every comment in
  // this area read as though the row did too.
  //
  // Hidden while the answer is still unknown, not shown-then-withdrawn. A row
  // that arrives a beat late costs the deployments that HAVE a mangrove almost
  // nothing; a row that appears and vanishes hands the ones that do not a window
  // in which the member can press it.
  const mangroveOn = useMangroveEnabled(workspace);
  const hidden = { projects: hideProjects, mangrove: mangroveOn !== true };

  const centre = resolveCentre({ resolved, workspace, destination, sid: sessionId ?? null });

  // "New chat" NAVIGATES now; it does not create. It used to mint a conversation and
  // write its id straight into the fragment, which put a member in a blank transcript
  // holding a `sid` no row existed for -- the same state FR-3.5 removed from entering a
  // place. Dropping `sid` lands on the landing, whose composer is the one mint.
  //
  // The bump is for the case where the landing is ALREADY what is on screen: the hash
  // written is the hash already in the bar, which fires no hashchange and re-renders
  // nothing, so the press had no effect at all on the one screen a member is most
  // likely to press it from. It moves the cursor to the composer instead.
  function newChat() {
    if (!workspace) return;
    setFragmentProject(project);
    setComposeFocus((n) => n + 1);
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
        onMangrove: () => setDestination("mangrove"),
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
  // reopening it on itself. The rows arrive in the SAME GROUPS the open column labels
  // them with — screens, then tools — because a rail cannot carry the two labels and the
  // hairline between groups is what is left to say the two kinds apart.
  // THE CONVERSATION LIST, as an entry of its own, and one of the reasons the rail is
  // groups rather than one list.
  //
  // What the collapsed pane previews is the conversation list — and it used to appear
  // from a hover anywhere on the column, so reaching for Files meant dismissing a list
  // that had opened over the screen on the way past. Naming it gives the preview a place
  // to come FROM: this is the only entry carrying `peek`, and every other one closes it.
  //
  // Clicking EXPANDS, which is the exception to the rule two groups below — the others
  // choose a panel without opening the pane, because opening on click pinned the sidebar
  // on what was meant to be a glance. This entry has no panel to choose: the list it
  // names is what the expanded pane already shows, so "open it properly" is the only verb
  // a click could have.
  const railConversations: RailPanel[] = workspace
    ? [
        {
          key: "conversations",
          Icon: MessagesSquare,
          label: t.shell.conversations,
          active: false,
          peek: true,
          onSelect: () => {
            setCollapsed(false);
            setPeeking(false);
          },
        },
      ]
    : [];

  const railDestinations: RailPanel[][] = workspace
    ? railDestinationGroups({
        t,
        openDestination: destination,
        openSection,
        hidden,
        onDestination: setDestination,
        onSection: setRightSidebar,
      })
    : [];

  const railActions: RailPanel[] = workspace
    ? [
        {
          key: "new-chat",
          Icon: MessageSquarePlus,
          label: t.history.newChat,
          blurb: t.history.newChatBlurb,
          active: false,
          emphasis: true,
          onSelect: newChat,
        },
      ]
    : [];

  // THE SAME ORDER THE OPEN SIDEBAR READS, top to bottom: New chat, the screens, the
  // tools, then the conversation list. The rail had the list first and the action last,
  // so the two renderings of one column disagreed about where anything was — and the
  // rail is what a member reads while the column is collapsed, which is exactly when
  // they cannot check.
  const railGroups = [railActions, ...railDestinations, railConversations].filter(
    (g) => g.length > 0,
  );

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
            openDestination={destination}
            openSection={openSection}
            hidden={hidden}
            onDestination={(to) => setDestination(to)}
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
            {centre.kind === "destination" && workspace && centre.at === "projects" && (
              <ProjectsScreen
                workspace={workspace}
                browsedProject={project}
                onBrowse={(id) => setFragmentProject(id)}
              />
            )}
            {centre.kind === "destination" && workspace && centre.at === "mangrove" && (
              <MangroveScreen
                workspace={workspace}
                // The NAME, never `project` -- both are strings, so tsc would take the
                // id just as happily and a member would read a uuid.
                projectName={openProject?.name ?? null}
                onReference={setChatRef}
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
                focusSignal={composeFocus}
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
        {shownSection && workspace && (
          <WorkspaceScreen
            // Keyed by the workspace AND the project: a section addresses one workspace
            // directory, so entering a project must rebuild it rather than leave the
            // agent's own memory or files on screen under the project's name.
            key={`${workspace.t}|${workspace.s}|${workspace.r}|${project ?? ""}`}
            workspace={workspace}
            section={shownSection}
            onClose={() => setRightSidebar(null)}
            closing={openSection === null}
            onClosed={() => setExiting(null)}
            onReference={setChatRef}
            onRestartNeeded={() => setRestartRefresh((n) => n + 1)}
          />
        )}
      </div>
    </div>
  );
}
