"use client";

import React, { MouseEvent, useEffect, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, RefreshCw, Search, Trash2, X } from "lucide-react";
import { listWorkspaceMedia, deleteMedia, type Attachment } from "@/lib/media";
import type { Workspace } from "./fragment";
import AttachmentButton from "@/app/chat/attachment-button";
import MemoryEditor from "@/app/chat/memory-editor";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 280;
const WIDTH_KEY = "chat-files-width";

// The agent organizes its workspace into real folders, so a listing entry's
// `name` can be a path ("reports/2026/q2.pdf"). Rendering that flat gives a wall
// of look-alike rows; this turns it into a tree the user can open and explore.

export type FileNode = { kind: "file"; leaf: string; file: Attachment };
export type DirNode = { kind: "dir"; leaf: string; path: string; children: TreeNode[] };
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
export default function UploadsSidebar({
  workspace,
  refreshSignal,
  onClose,
}: {
  workspace: Workspace;
  refreshSignal: number;
  onClose: () => void;
}) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  // Folders the user has opened. Collapsed by default so a deep workspace shows
  // its shape first rather than dumping every file at once.
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

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
    if (raw >= MIN_WIDTH && raw <= MAX_WIDTH) setWidth(raw);
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
  }, [workspace.t, workspace.s, workspace.r, refreshSignal, localRefresh]);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: globalThis.MouseEvent) => {
      // Right-hand column: dragging the LEFT edge leftward widens it.
      const next = startWidth + (startX - ev.clientX);
      setWidth(Math.max(MIN_WIDTH, Math.min(next, MAX_WIDTH)));
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
  const visible = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  const pending = deletingPath ? (files ?? []).find((f) => f.path === deletingPath) : null;
  const tree = buildFileTree(visible);
  // While filtering, every folder opens: a match buried three levels down is
  // useless if the user still has to guess which folder to click.
  const expanded = q ? new Set(allFolderPaths(tree)) : openFolders;

  // Indentation is inline rather than a Tailwind class because the depth is
  // dynamic; a per-level class would need a lookup table for no gain.
  const indent = (depth: number) => ({ paddingLeft: depth * 12 });

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.kind === "dir") {
      const isOpen = expanded.has(node.path);
      return (
        <li key={`dir:${node.path}`} role="treeitem" aria-expanded={isOpen}>
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            style={indent(depth)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs font-semibold text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
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
            <span className="truncate" title={node.path}>
              {node.leaf}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] opacity-70">
              {node.children.length}
            </span>
          </button>
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
      >
        <FileText size={14} className="shrink-0 text-fg-muted" aria-hidden />
        {/* The row shows only the leaf; the folder is the branch above it. */}
        <AttachmentButton workspace={workspace} path={f.path} name={node.leaf} tone="row" />
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">{formatSize(f.size)}</span>
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
      <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden />
      <aside
        style={{ width }}
        className="relative flex shrink-0 flex-col border-l border-brand/30 bg-surface max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:max-w-[90vw] max-md:shadow-xl"
      >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t.uploads.resize}
        onMouseDown={startResize}
        className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-accent/40 md:block"
      />

      <div className="flex items-center gap-2 border-b border-brand/30 px-3 py-2">
        <h2 className="flex-1 font-display text-sm font-semibold text-fg">{t.uploads.workspace}</h2>
        <IconButton variant="ghost" size="sm" aria-label={t.uploads.closePanel} onClick={onClose}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>

      <MemoryEditor workspace={workspace} />

      <div className="flex items-center gap-2 px-3 pt-3">
        <FileText size={16} className="text-accent" aria-hidden />
        <h3 className="flex-1 font-display text-sm font-semibold text-fg">{t.uploads.files}</h3>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t.uploads.refreshAria}
          title={t.uploads.refresh}
          onClick={() => setLocalRefresh((n) => n + 1)}
        >
          <RefreshCw size={15} aria-hidden />
        </IconButton>
      </div>

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

        {files !== null && visible.length === 0 && (
          <p className="py-3 text-center text-sm text-fg-muted">
            {q ? t.uploads.noMatches : t.uploads.noneYet}
          </p>
        )}

        {tree.length > 0 && (
          <ul role="tree" aria-label={t.uploads.files} className="flex flex-col gap-1">
            {tree.map((node) => renderNode(node, 0))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deletingPath !== null}
        title={t.uploads.deleteTitle}
        message={
          deleteError ??
          t.uploads.deleteMessage.replace("{name}", pending?.name ?? t.uploads.deleteFallbackName)
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
