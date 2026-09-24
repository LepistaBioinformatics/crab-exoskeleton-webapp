"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Workspace } from "./fragment";
import { SECTIONS, type Section } from "./workspace-sections";
import WorkspacePane from "./workspace-pane";
import FilesScreen from "./files-screen";
import MemoryEditor from "./memory-editor";
import MemoryGraphPanel from "./memory-graph-panel";
import ScheduledTasksPanel from "./scheduled-tasks-panel";
import SecretsSection from "./secrets-section";
import MangroveScreen from "./mangrove-screen";
import { IconButton } from "@/components/ui/icon-button";
import type { ChatReference } from "@/lib/chatReference";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// One of the five things a workspace holds, drawn in the pane beside the conversation.
//
// A dispatcher and nothing more. The bodies are the panels that already existed and
// their APIs are untouched (FR-5.1) — and the pane's own chrome is `workspace-pane.tsx`,
// which is where the width, the drag and the close control live.
//
// IT FILLED THE WHOLE CENTRE FOR A WHILE. The owner reversed that on 2026-09-12 after
// using it: opening Files took the conversation off the screen, and reading a document
// beside the transcript is most of what the pane was for. What did NOT come back is the
// pane's own sliding list of the other four — the sidebar names all five now, which is a
// louder answer to the complaint the right rail was built for, so a second list here
// would only be a way in to where the member already is.
//
// It does NOT own the projects screen. Projects is a place, not a pane: it replaces the
// conversation in the centre, `ProjectsScreen` renders its own frame there, and an agent
// whose proxy has no projects must render nothing at all (FR-2.4).
export default function WorkspaceScreen({
  workspace,
  section,
  onSection,
  hiddenSections,
  projectName,
  subscriptionName,
  onClose,
  closing,
  onClosed,
  onReference,
  onRestartNeeded,
}: {
  workspace: Workspace;
  section: Section;
  /**
   * Two strings the shell has already resolved for its own header, threaded through
   * for the mangrove alone. It needs them to say where a file will land and to name a
   * recipient that is the whole subscription -- and resolving either here would be a
   * second read that can be a beat behind the breadcrumb.
   */
  projectName?: string | null;
  subscriptionName?: string | null;
  /** Closes the pane — the shell clears `rs`. */
  /** Switch the pane to another section, from the heading's own list. */
  onSection?: (next: Section) => void;
  /** What this deployment does not have. Today that is the mangrove or nothing. */
  hiddenSections?: readonly Section[];
  onClose: () => void;
  /** Passed straight through to the pane's chrome; see `workspace-pane.tsx`. */
  closing?: boolean;
  onClosed?: () => void;
  /**
   * Carries a graph entity or a scheduled task up to the composer's context slot. It
   * belongs to the SHELL rather than to the chat view, which is why a pane can still
   * fill it: the member picks a reference here and sends it from the conversation that
   * is still on screen beside them.
   */
  onReference: (ref: ChatReference | null) => void;
  /** A written secret leaves the container needing a restart; the banner is the shell's. */
  onRestartNeeded: () => void;
}) {
  const t = useT(chatCopy);
  // Two counters, not one, and kept apart for the reason the panel that used to hold
  // them recorded: the agent writes to the graph mid-conversation and schedules tasks
  // between visits, so each goes stale on its own and neither needs the other re-read.
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [taskRefresh, setTaskRefresh] = useState(0);
  // A THIRD, for the same reason there are two: the mangrove goes stale on its own
  // schedule -- somebody else's agent publishing -- which has nothing to do with
  // either of the others.
  const [mangroveRefresh, setMangroveRefresh] = useState(0);

  // "Look again", offered where the pane puts a section's own controls. The files
  // screen keeps its copy inside its body instead, beside upload and new-folder: there
  // it reads as one more thing you can do to the listing, which is what it is.
  const refresh =
    section === "graph"
      ? { label: t.memoryGraph.refresh, aria: t.memoryGraph.refreshAria, bump: setGraphRefresh }
      : section === "tasks"
        ? { label: t.scheduledTasks.refresh, aria: t.scheduledTasks.refreshAria, bump: setTaskRefresh }
        : section === "mangrove"
          ? { label: t.mangrove.refresh, aria: t.mangrove.refreshAria, bump: setMangroveRefresh }
          : null;

  return (
    <WorkspacePane
      title={SECTIONS[section].label(t)}
      // The switcher in the heading. Passed from here rather than read inside the
      // pane, because the pane is a frame and does not know what a section is until
      // it is told -- and `hiddenSections` is the shell's answer, the same one the
      // sidebar filters its rows with.
      section={section}
      onSection={onSection}
      hiddenSections={hiddenSections}
      onClose={onClose}
      closing={closing}
      onClosed={onClosed}
      actions={
        refresh && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={refresh.aria}
            title={refresh.label}
            onClick={() => refresh.bump((n) => n + 1)}
          >
            <RefreshCw size={16} aria-hidden />
          </IconButton>
        )
      }
    >
      {/* NO WRAPPER, and that is the point. A `<div className="flex h-[70dvh] min-h-80
          flex-col">` stood here while these filled the centre: the frame there grew with
          its content, so a panel's `flex-1` scrolling region had nothing to be 1 of and
          resolved to zero pixels. The pane's body is already a definite-height flex
          column (see workspace-pane.tsx), so each of the five sizes itself from it
          directly and the workaround has nothing left to work around. */}
      {section === "memory" && <MemoryEditor workspace={workspace} />}
      {/* The sixth, and the only one not scoped by this workspace. It renders its own
          body frameless: the title, the scroll and the close control above are this
          pane's. */}
      {section === "mangrove" && (
        <MangroveScreen
          workspace={workspace}
          projectName={projectName}
          subscriptionName={subscriptionName}
          refreshSignal={mangroveRefresh}
          onReference={onReference}
        />
      )}
      {section === "graph" && (
        <MemoryGraphPanel
          workspace={workspace}
          // Always. `active` told the panel which of the track's two panes the member was
          // looking at, because both stayed mounted through the slide. The track is gone
          // and the pane mounts one section at a time, so the answer can no longer be
          // false.
          active
          refreshSignal={graphRefresh}
          onReference={onReference}
        />
      )}
      {section === "tasks" && (
        <ScheduledTasksPanel
          workspace={workspace}
          refreshSignal={taskRefresh}
          onReference={onReference}
        />
      )}
      {section === "files" && <FilesScreen workspace={workspace} />}
      {section === "secrets" && (
        <SecretsSection workspace={workspace} onRestartNeeded={onRestartNeeded} />
      )}
    </WorkspacePane>
  );
}
