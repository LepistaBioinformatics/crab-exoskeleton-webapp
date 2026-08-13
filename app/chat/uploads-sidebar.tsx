"use client";

import React, { MouseEvent, useEffect, useRef, useState } from "react";
import {
  canDrop,
  createFolder,
  deleteFolder,
  dropTarget,
  isReservedFolder,
  moveMedia,
} from "@/lib/media";
import {
  Brain,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  Upload,
  Network,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cva } from "class-variance-authority";
import {
  listWorkspaceMedia,
  deleteMedia,
  uploadMedia,
  MEDIA_ACCEPT,
  type Attachment,
} from "@/lib/media";
import type { Workspace } from "./fragment";
import AttachmentButton from "@/app/chat/attachment-button";
import MemoryEditor from "@/app/chat/memory-editor";
import MemoryGraphPanel from "@/app/chat/memory-graph-panel";
import ScheduledTasksPanel from "@/app/chat/scheduled-tasks-panel";
import type { ChatReference } from "@/lib/chatReference";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy, type ChatDict } from "@/lib/i18n/chat";
import { PANEL_HEADER_H } from "./panel-header";
import { useT } from "@/lib/i18n/context";

const MIN_WIDTH = 240;
// No fixed maximum: the knowledge graph is the reason — a member inspecting it wants
// the column as wide as their screen. The only ceiling is the viewport itself, so the
// resize handle (the panel's LEFT edge) can never be dragged off-screen and leave the
// width unrecoverable. `maxWidth()` is a function, not a constant, because the answer
// changes when the window does.
const DEFAULT_WIDTH = 280;

function maxWidth(): number {
  if (typeof window === "undefined") return Number.MAX_SAFE_INTEGER;
  return Math.max(MIN_WIDTH, window.innerWidth - 48);
}
const WIDTH_KEY = "chat-files-width";

// The agent organizes its workspace into real folders, so a listing entry's
// `name` can be a path ("reports/2026/q2.pdf"). Rendering that flat gives a wall
// of look-alike rows; this turns it into a tree the user can open and explore.

export type FileNode = { kind: "file"; leaf: string; file: Attachment };
export type DirNode = {
  kind: "dir";
  leaf: string;
  path: string;
  children: TreeNode[];
};
export type TreeNode = FileNode | DirNode;

// Folders before files, each alphabetical and case-insensitive -- the ordering
// every file explorer uses, so the panel needs no explanation.
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.leaf.localeCompare(b.leaf, undefined, { sensitivity: "base" });
  });
}

export function buildFileTree(files: Attachment[]): TreeNode[] {
  const root: TreeNode[] = [];
  // Folder path -> its children array, so repeated prefixes reuse one node.
  const dirs = new Map<string, TreeNode[]>();

  const dirChildren = (segments: string[]): TreeNode[] => {
    let siblings = root;
    let prefix = "";
    for (const seg of segments) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      let children = dirs.get(prefix);
      if (!children) {
        children = [];
        dirs.set(prefix, children);
        siblings.push({ kind: "dir", leaf: seg, path: prefix, children });
      }
      siblings = children;
    }
    return siblings;
  };

  for (const f of files) {
    const parts = f.name.split("/").filter(Boolean);
    if (f.isDir) {
      // A folder listed in its own right. Walking its FULL segment list creates (or
      // reuses) the node chain including the leaf, so an EMPTY folder gets a row —
      // which is the whole reason the listing carries folders at all. No file is
      // pushed: a directory is a branch, never an entry.
      if (parts.length > 0) dirChildren(parts);
      continue;
    }
    const leaf = parts.pop();
    if (!leaf) continue; // a name that is only slashes: nothing to show
    dirChildren(parts).push({ kind: "file", leaf, file: f });
  }

  sortNodes(root);
  for (const children of dirs.values()) sortNodes(children);
  return root;
}

/** Every folder path in the tree — used to expand all while filtering. */
export function allFolderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === "dir") {
        out.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A permanent, resizable right-hand column (desktop) listing the current
// workspace's uploads. Not an overlay -- part of the layout, toggled from the
// chat header. Filter box + per-file delete. Refreshes on `refreshSignal`.
// What a workspace holds. Ordered deliberately: memory and the graph are what a
// member asks about ("what does it know about me"), scheduled tasks are what it does
// on its own, files are what they manage.
type Section = "memory" | "graph" | "tasks" | "files";

const SECTION_ORDER: Section[] = ["memory", "graph", "tasks", "files"];

const SECTIONS: Record<
  Section,
  {
    Icon: typeof Brain;
    label: (t: ChatDict) => string;
    blurb: (t: ChatDict) => string;
  }
> = {
  memory: {
    Icon: Brain,
    label: (t) => t.memory.title,
    blurb: (t) => t.uploads.sections.memory,
  },
  graph: {
    Icon: Network,
    label: (t) => t.memoryGraph.title,
    blurb: (t) => t.uploads.sections.graph,
  },
  tasks: {
    Icon: CalendarClock,
    label: (t) => t.scheduledTasks.title,
    blurb: (t) => t.uploads.sections.tasks,
  },
  files: {
    Icon: FileText,
    label: (t) => t.uploads.files,
    blurb: (t) => t.uploads.sections.files,
  },
};

// The track holds both panes side by side at exactly twice the panel's width and
// slides by half.
//
// It MUST be rendered inside a clipping box — see `viewport` below. A translated
// 200%-wide track does not stop existing when it moves off the panel: without
// `overflow-hidden` on an ancestor, the outgoing pane slid left and kept painting on
// top of the chat. That was the first version of this, and nothing in the type system
// or the tests noticed.
const track = cva(
  "flex h-full w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none",
  {
    variants: { open: { true: "-translate-x-1/2", false: "translate-x-0" } },
    defaultVariants: { open: false },
  },
);

// The clipping box the track slides inside. Same shape unified-sidebar uses.
const viewport = cva("relative min-h-0 flex-1 overflow-hidden");

const slot = cva(
  "flex w-1/2 min-h-0 shrink-0 flex-col overflow-hidden outline-none",
);

// A folder row is both a drag source and a drop target. `over` is set only when the
// pointer is on a folder the current drag may LEGALLY land in — canDrop decides, so an
// illegal target never lights up and the member is not invited to try.
const folderRow = cva(
  "group/dir flex items-center gap-0.5 rounded-lg transition-colors",
  {
    variants: {
      over: { true: "bg-accent/15 ring-1 ring-accent/50", false: "" },
    },
    defaultVariants: { over: false },
  },
);

// The tree root is a drop target too: dragging something OUT of a folder needs
// somewhere to land, and without this the only way back to the root would be to
// re-upload.
const rootZone = cva("min-h-8 rounded-lg transition-colors", {
  variants: { over: { true: "bg-accent/10 ring-1 ring-accent/40", false: "" } },
  defaultVariants: { over: false },
});

export default function UploadsSidebar({
  workspace,
  refreshSignal,
  onClose,
  onReference,
  initialSection = null,
}: {
  workspace: Workspace;
  refreshSignal: number;
  onClose: () => void;
  /**
   * Carries a scheduled task or one of its executions up to the chat view, which
   * holds it as a context slot for the next message. The panel's only outbound
   * value — everything else here flows inward.
   */
  onReference?: (ref: ChatReference) => void;
  /**
   * Which detail to open on mount, or null for the menu.
   *
   * Exists for two reasons. It makes the detail panes reachable in a test at all — the
   * detail CONTENT is conditional on the chosen section, so at first paint with the
   * menu showing there is nothing of the files pane in the markup, and that is exactly
   * how a missing "New folder" button went unnoticed by six passing tests. And it is
   * the seam a future "open the files panel" link would use.
   */
  initialSection?: Section | null;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  // The tasks panel's own refresh counter, deliberately separate from
  // localRefresh: sharing one would re-list the files tree on every task refresh,
  // and the two sections never need refreshing together.
  const [taskRefresh, setTaskRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  // Which detail the member has opened, or null for the menu. This panel is a
  // two-pane sliding track (the idiom unified-sidebar already uses): a root listing
  // the three things a workspace holds, and one detail pane that renders whichever
  // was picked. Two panes rather than four because the animation is identical and the
  // incoming pane simply renders different content.
  const [section, setSection] = useState<Section | null>(initialSection);
  // Drag state. `dragPath` is the workspace-relative path being dragged (a file's
  // `name` or a folder's `path` — both already live in the same space, without the
  // `uploads/` prefix). `dropFolder` is the folder currently under the pointer, or ""
  // for the tree root.
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<{
    path: string;
    files: number;
  } | null>(null);
  // Folders the user has opened. Collapsed by default so a deep workspace shows
  // its shape first rather than dumping every file at once.
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Upload straight into the workspace, without going through a message.
  //
  // Deliberately does NOT touch the composer: this is file management, not
  // composing. The counterpart in the chat box attaches what it uploads because the
  // point there is to talk about it; here the point is that the file simply exists
  // for the agent to find later.
  //
  // It always lands at the ROOT of uploads/. Not a UI choice — StoreMedia reduces the
  // name to a safe basename, so the API cannot express a subfolder. Dragging it into
  // one afterwards already works.
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload(files: FileList) {
    setFolderError(null);
    setUploading(true);
    try {
      // Sequential rather than Promise.all: each upload chowns the uploads tree on
      // the proxy side, and a burst of parallel writes into one directory buys
      // nothing on a panel where two or three files is the realistic case.
      for (const file of Array.from(files)) {
        await uploadMedia(workspace, file);
      }
      setLocalRefresh((n) => n + 1);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "unknown");
    } finally {
      setUploading(false);
    }
  }

  function toggleFolder(path: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  useEffect(() => {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    // Clamped on READ as well as on drag: a width persisted on a wide monitor must not
    // swallow the whole screen when the same member opens the app on a laptop.
    if (raw >= MIN_WIDTH) setWidth(Math.min(raw, maxWidth()));
  }, []);
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    listWorkspaceMedia(workspace)
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // `workspace.p` belongs here as much as t/s/r do: it selects WHICH workspace
    // directory is listed. Omitted, entering a project kept the agent's own files on
    // screen and leaving it kept showing whatever was loaded last.
  }, [workspace.t, workspace.s, workspace.r, workspace.p, refreshSignal, localRefresh]);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: globalThis.MouseEvent) => {
      // Right-hand column: dragging the LEFT edge leftward widens it.
      const next = startWidth + (startX - ev.clientX);
      setWidth(Math.max(MIN_WIDTH, Math.min(next, maxWidth())));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function onDelete(path: string) {
    setDeleteError(null);
    try {
      await deleteMedia(workspace, path);
      setFiles((prev) => (prev ? prev.filter((f) => f.path !== path) : prev));
      setDeletingPath(null);
    } catch (e) {
      setDeleteError(errorText(err, e instanceof Error ? e.message : null));
    }
  }

  const q = query.trim().toLowerCase();
  const visible = (files ?? []).filter(
    (f) => !q || f.name.toLowerCase().includes(q),
  );
  const pending = deletingPath
    ? (files ?? []).find((f) => f.path === deletingPath)
    : null;
  const tree = buildFileTree(visible);
  // While filtering, every folder opens: a match buried three levels down is
  // useless if the user still has to guess which folder to click.
  const expanded = q ? new Set(allFolderPaths(tree)) : openFolders;

  // Indentation is inline rather than a Tailwind class because the depth is
  // dynamic; a per-level class would need a lookup table for no gain.
  const indent = (depth: number) => ({ paddingLeft: depth * 12 });

  // Every write refreshes the listing rather than patching local state: the agent
  // writes into this same tree, so re-reading is the only way the panel stays honest
  // about what is actually there.
  async function runFolderOp(op: () => Promise<unknown>) {
    setFolderBusy(true);
    setFolderError(null);
    try {
      await op();
      setLocalRefresh((n) => n + 1);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "unknown");
    } finally {
      setFolderBusy(false);
    }
  }

  function onDropInto(folder: string) {
    const src = dragPath;
    setDragPath(null);
    setDropFolder(null);
    if (!src || !canDrop(src, folder)) return;
    void runFolderOp(() => moveMedia(workspace, src, dropTarget(src, folder)));
  }

  // Counted from the tree already in hand, so the confirmation can NAME the number
  // before the member commits. The proxy returns its own count afterwards; the two
  // disagreeing means the agent wrote something in between.
  function filesUnder(folder: string): number {
    // `!f.isDir` matters: the listing now carries folders too, so without it a
    // confirmation promising "3 files" would be counting subfolders among them.
    return (files ?? []).filter(
      (f) => !f.isDir && f.name.startsWith(folder + "/"),
    ).length;
  }

  function onNewFolder() {
    const name = window.prompt(t.uploads.newFolderPrompt)?.trim();
    if (!name) return;
    // Refused here for a clear message, and refused AGAIN by the proxy, which is the
    // actual enforcement — this path arrives over the network.
    if (isReservedFolder(name)) {
      setFolderError("media_reserved");
      return;
    }
    void runFolderOp(() => createFolder(workspace, name));
  }

  // Rename through a prompt, the same idiom the new-folder button uses. A rename IS a
  // move within the same parent — the proxy has no separate operation for it — so this
  // computes the sibling path and moves.
  function promptRename(path: string, currentLeaf: string) {
    const next = window.prompt(t.uploads.rename, currentLeaf)?.trim();
    if (!next || next === currentLeaf) return;
    if (next.includes("/")) {
      setFolderError("invalid_request");
      return;
    }
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    void runFolderOp(() =>
      moveMedia(workspace, path, parent ? `${parent}/${next}` : next),
    );
  }

  // Drop props shared by every folder row and by the root zone.
  function dropProps(folder: string) {
    const active = dragPath !== null && canDrop(dragPath, folder);
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!active) return;
        // preventDefault is what makes a target droppable at all; without it the
        // browser refuses the drop and the row silently does nothing.
        e.preventDefault();
        e.stopPropagation();
        setDropFolder(folder);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation();
        setDropFolder((cur) => (cur === folder ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        onDropInto(folder);
      },
    };
  }

  function dragProps(path: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragPath(path);
        e.dataTransfer.effectAllowed = "move";
        // Some browsers cancel a drag with no payload at all.
        e.dataTransfer.setData("text/plain", path);
      },
      onDragEnd: () => {
        setDragPath(null);
        setDropFolder(null);
      },
    };
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.kind === "dir") {
      const isOpen = expanded.has(node.path);
      // The system folder: shown translated, not draggable, and with no rename or
      // delete control. The proxy refuses all three independently — this is the
      // interface explaining itself, not the enforcement.
      const reserved = isReservedFolder(node.path);
      return (
        <li key={`dir:${node.path}`} role="treeitem" aria-expanded={isOpen}>
          <div
            className={folderRow({ over: dropFolder === node.path })}
            {...dropProps(node.path)}
            {...dragProps(node.path)}
          >
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={indent(depth)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs font-semibold text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <ChevronRight
                size={13}
                aria-hidden
                className={`shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              {isOpen ? (
                <FolderOpen size={13} className="shrink-0" aria-hidden />
              ) : (
                <Folder size={13} className="shrink-0" aria-hidden />
              )}
              {/* The system folder is SHOWN translated, never renamed: the path on disk
                  stays `attachments` because the proxy writes there. The title keeps the
                  real path so a member can still see what it is. */}
              <span className="truncate" title={node.path}>
                {reserved ? t.uploads.attachmentsFolder : node.leaf}
              </span>
              {reserved && (
                <Lock
                  size={11}
                  className="shrink-0 opacity-60"
                  aria-label={t.uploads.systemFolder}
                />
              )}
            </button>
            {!reserved && (
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.uploads.renameAria} ${node.leaf}`}
                title={t.uploads.rename}
                onClick={() => promptRename(node.path, node.leaf)}
                className="opacity-0 transition-opacity group-hover/dir:opacity-100 focus-visible:opacity-100"
              >
                <Pencil size={13} aria-hidden />
              </IconButton>
            )}
            {!reserved && (
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`${t.uploads.deleteFolderAria} ${node.leaf}`}
                title={t.uploads.deleteFolder}
                onClick={() =>
                  setDeletingFolder({
                    path: node.path,
                    files: filesUnder(node.path),
                  })
                }
                className="opacity-0 transition-opacity group-hover/dir:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 size={13} aria-hidden />
              </IconButton>
            )}
            {/* How many entries the folder holds, LAST in the row — after the rename and
                delete controls rather than inside the folder button. Those controls only
                fade in on hover but always occupy their space, so the count sits at a
                fixed right edge and does not shift when the row is hovered. */}
            <span className="shrink-0 pr-1 font-mono text-[10px] text-fg-muted opacity-70">
              {node.children.length}
            </span>
          </div>
          {isOpen && (
            <ul role="group" className="mt-1 flex flex-col gap-1">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    const f = node.file;
    return (
      <li
        key={`file:${f.path}`}
        role="treeitem"
        style={indent(depth)}
        className="group flex items-center gap-2 rounded-lg border border-brand/30 bg-elevated px-2 py-1.5"
        {...dragProps(f.name)}
      >
        <FileText size={14} className="shrink-0 text-fg-muted" aria-hidden />
        {/* The row shows only the leaf; the folder is the branch above it. */}
        <AttachmentButton
          workspace={workspace}
          path={f.path}
          name={node.leaf}
          size={f.size}
          tone="row"
        />
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">
          {formatSize(f.size)}
        </span>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`${t.uploads.deletePrefix} ${f.name}`}
          title={c.actions.delete}
          onClick={() => {
            setDeleteError(null);
            setDeletingPath(f.path);
          }}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 size={14} aria-hidden />
        </IconButton>
      </li>
    );
  }

  return (
    <>
      {/* On mobile the panel is an overlay drawer; the backdrop dismisses it. */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={{ width }}
        // pane-open animates width from 0 on mount (see globals.css). It is an
        // animation rather than a transition precisely because this width is
        // drag-resizable: a transition would make the drag lag.
        // `max-md:w-[92vw]!` — the `!` is load-bearing. `width` above is an inline style (it is
        // drag-resizable on desktop), and an inline style beats an ordinary class, so the mobile
        // drawer was stuck at the desktop DEFAULT_WIDTH of 280px. On a phone that is a thin column
        // that squeezes the panel's content, and `max-w-[92vw]` could not help: a max only caps a
        // width, it never widens one. Tailwind v4 puts the important modifier at the END.
        className="pane-open relative flex shrink-0 flex-col overflow-hidden border-l border-brand/30 bg-surface max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:w-[92vw]! max-md:max-w-[92vw] max-md:shadow-xl"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t.uploads.resize}
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
        />

        <div
          className={`flex shrink-0 items-center gap-1 border-b border-brand/30 px-3 py-2 ${PANEL_HEADER_H}`}
        >
          {section === null ? (
            <h2 className="flex-1 font-display text-sm font-semibold text-fg">
              {t.uploads.workspace}
            </h2>
          ) : (
            <button
              type="button"
              onClick={() => setSection(null)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:text-accent"
            >
              <ChevronLeft
                size={15}
                className="shrink-0 text-fg-muted"
                aria-hidden
              />
              <span className="truncate font-display text-sm font-semibold text-fg">
                {SECTIONS[section].label(t)}
              </span>
            </button>
          )}
          {section === "files" && (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t.uploads.refreshAria}
              title={t.uploads.refresh}
              onClick={() => setLocalRefresh((n) => n + 1)}
            >
              <RefreshCw size={15} aria-hidden />
            </IconButton>
          )}
          {/* Same affordance as the files tree, for the same reason: the agent
              schedules tasks between visits, so the member needs a way to pick up a
              task they just asked for without leaving the panel. */}
          {section === "tasks" && (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t.scheduledTasks.refreshAria}
              title={t.scheduledTasks.refresh}
              onClick={() => setTaskRefresh((n) => n + 1)}
            >
              <RefreshCw size={15} aria-hidden />
            </IconButton>
          )}
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.uploads.closePanel}
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </IconButton>
        </div>

        {/* BOTH PANES STAY MOUNTED through the slide — unmounting the outgoing one is how
          a slide animates to a blank column. Only the off-screen pane leaves the tab
          order. Same contract as unified-sidebar's track. */}
        <div className={viewport()}>
          <div className={track({ open: section !== null })}>
            <div
              className={slot()}
              aria-hidden={section !== null}
              inert={section !== null || undefined}
            >
              <nav aria-label={t.uploads.workspace}>
                <ul>
                  {SECTION_ORDER.map((key) => {
                    const s = SECTIONS[key];
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSection(key)}
                          className="flex w-full items-center gap-2 border-b border-brand/30 px-3 py-3 text-left transition-colors hover:bg-elevated"
                        >
                          <s.Icon
                            size={16}
                            className="shrink-0 text-accent"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-sm font-semibold text-fg">
                              {s.label(t)}
                            </span>
                            <span className="block text-[11px] leading-snug text-fg-muted">
                              {s.blurb(t)}
                            </span>
                          </span>
                          <ChevronRight
                            size={14}
                            className="shrink-0 text-fg-muted"
                            aria-hidden
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            <div
              className={slot()}
              aria-hidden={section === null}
              inert={section === null || undefined}
            >
              {section === "memory" && <MemoryEditor workspace={workspace} />}
              {section === "graph" && (
                <MemoryGraphPanel
                  workspace={workspace}
                  active={section === "graph"}
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
              {section === "files" && (
                <>
                  <div className="flex items-center gap-1 px-2 pt-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept={MEDIA_ACCEPT}
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.length) void onUpload(e.target.files);
                        // Reset so re-picking the SAME file fires onChange again.
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outlined"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden />
                      {t.uploads.upload}
                    </Button>
                    <Button
                      size="sm"
                      variant="outlined"
                      disabled={folderBusy}
                      onClick={onNewFolder}
                    >
                      <FolderPlus size={14} aria-hidden />
                      {t.uploads.newFolder}
                    </Button>
                    {(folderBusy || uploading) && <Spinner size={14} />}
                  </div>

                  {/* Said once, permanently, rather than as a dialog per action: the
                      agent references these paths in its knowledge graph, in MEMORY.md
                      and in skills, so renaming or moving something it mentioned breaks
                      that reference silently. A modal on every drag would be clicked
                      through without reading. */}
                  <p className="px-2 pt-1 text-[10px] leading-snug text-fg-muted">
                    {t.uploads.organiseHint}
                  </p>

                  {folderError && (
                    <div className="px-2 pt-1">
                      <Alert severity="error">
                        {errorText(err, folderError)}
                      </Alert>
                    </div>
                  )}

                  <div className="px-2 pt-2">
                    <div className="relative">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
                      />
                      <Input
                        variant="subtle"
                        inputSize="sm"
                        className="pl-9"
                        placeholder={t.uploads.filterPlaceholder}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-2">
                    {error && <Alert severity="error">{error}</Alert>}

                    {!error && files === null && (
                      <div className="flex justify-center py-4">
                        <Spinner size={20} />
                      </div>
                    )}

                    {/* A live filter hiding every file is not an empty workspace, and
                        the two states send the member somewhere different — so they
                        stay distinct, sharing only their presentation. */}
                    {files !== null &&
                      visible.length === 0 &&
                      (q ? (
                        <PanelEmpty
                          icon={Search}
                          title={t.uploads.noMatches}
                          body={t.uploads.noMatchesHint}
                        />
                      ) : (
                        <PanelEmpty
                          icon={FolderOpen}
                          title={t.uploads.noneYet}
                          body={t.uploads.noneYetHint}
                        />
                      ))}

                    {/* The tree root is a drop target too: dragging something OUT of a
                        folder needs somewhere to land, and without this the only way
                        back to the root would be to re-upload. */}
                    <div
                      className={rootZone({ over: dropFolder === "" })}
                      {...dropProps("")}
                    >
                      {tree.length > 0 && (
                        <ul
                          role="tree"
                          aria-label={t.uploads.files}
                          className="flex flex-col gap-1"
                        >
                          {tree.map((node) => renderNode(node, 0))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recursive and destructive, so the count is NAMED before the click. It is
            computed from the listing already in hand; the proxy returns its own count
            afterwards, and the two disagreeing means the agent wrote something in
            between. */}
        <ConfirmDialog
          open={deletingFolder !== null}
          title={t.uploads.deleteFolderTitle}
          message={t.uploads.deleteFolderMessage
            .replace("{name}", deletingFolder?.path ?? "")
            .replace("{count}", String(deletingFolder?.files ?? 0))}
          confirmLabel={c.actions.delete}
          onConfirm={() => {
            const target = deletingFolder;
            setDeletingFolder(null);
            if (target)
              void runFolderOp(() => deleteFolder(workspace, target.path));
          }}
          onCancel={() => setDeletingFolder(null)}
        />

        <ConfirmDialog
          open={deletingPath !== null}
          title={t.uploads.deleteTitle}
          message={
            deleteError ??
            t.uploads.deleteMessage.replace(
              "{name}",
              pending?.name ?? t.uploads.deleteFallbackName,
            )
          }
          confirmLabel={c.actions.delete}
          onConfirm={() => deletingPath && onDelete(deletingPath)}
          onCancel={() => {
            setDeletingPath(null);
            setDeleteError(null);
          }}
        />
      </aside>
    </>
  );
}
