"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  canDrop,
  createFolder,
  deleteFolder,
  dropTarget,
  isInsideReserved,
  isReservedFolder,
  moveMedia,
} from "@/lib/media";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  Upload,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { cva } from "class-variance-authority";
import {
  listWorkspaceMedia,
  deleteMedia,
  downloadMedia,
  previewKind,
  uploadMedia,
  droppedDirectories,
  isExternalFileDrag,
  type Attachment,
} from "@/lib/media";
import { FileThumb, formatSize } from "@/app/chat/file-visuals";
import type { Workspace } from "./fragment";
import FilePreview from "@/app/chat/file-preview";
import { subscribeToPreviewRequests, takePendingPreview } from "@/app/chat/media-preview-bus";
import { subscribeToMediaChanged } from "@/app/chat/media-refresh-bus";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PanelEmpty } from "@/components/ui/panel-empty";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCopy, errorText } from "@/lib/i18n/errors";
import { commonCopy } from "@/lib/i18n/common";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

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
const rootZone = cva("relative min-h-8 rounded-lg transition-colors", {
  variants: { over: { true: "bg-accent/10 ring-1 ring-accent/40", false: "" } },
  defaultVariants: { over: false },
});

// The workspace's files: the tree, and the document that takes its place while one is
// open.
//
// It was the right-hand pane of the chat view and it renders in a right-hand pane again,
// but it is no longer the pane: the width it persisted, the drag handle, the mobile
// drawer and the close button are `workspace-pane.tsx`'s now, one level up. What did NOT
// come back is the sliding track that used to offer a list of the OTHER four sections —
// the sidebar lists those, so a copy here would be a second way in to where the member
// already is.
//
// The split is worth the file it costs. This component is a file listing; the pane is a
// column of the shell. Welded together, every change to either read as a change to a
// panel that did two jobs — which is how the close button and the section list ended up
// inside a files tree in the first place.
//
// Nothing below the chrome changed through any of it: the tree, the drag-and-drop, the
// folder operations and the preview are the same code they were.
export default function FilesScreen({ workspace }: { workspace: Workspace }) {
  const t = useT(chatCopy);
  const c = useT(commonCopy);
  const err = useT(errorCopy);
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The file the preview overlay is showing, or null. Held here rather than per row so
  // only one can ever be open.
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);

  // Changing workspace CLOSES the open document.
  //
  // A preview holds a path, and a path belongs to one workspace directory. Left open
  // across a switch it pointed at a file the new workspace does not have: the pane
  // showed an error and stayed on it, so the way back to the file list was a control
  // the member had to find while looking at a failure.
  //
  // Clearing this one piece of state is the whole fix, because the screen is derived —
  // `openDoc` comes from `previewFile`, and `!openDoc` is the tree. There is no pane to
  // navigate.
  //
  // Kept even though the shell now keys this screen on the workspace, which remounts it:
  // correctness that depends on a caller's `key` is correctness the next caller can drop
  // without noticing.
  //
  // `workspace.p` counts as a workspace change for the reason the file listing says it
  // does: it selects WHICH directory is being listed, so entering or leaving a project
  // invalidates a path exactly as switching agents does.
  //
  // DECLARED BEFORE the request effect below, so a preview arriving in the same commit
  // as a workspace change wins rather than being cleared by it.
  useEffect(() => {
    setPreviewFile(null);
    // The delete error goes with it: it names a path in the workspace being left, so
    // it is the same staleness one line further on.
    setDeleteError(null);
  }, [workspace.t, workspace.s, workspace.r, workspace.p]);

  // A document asked for from the transcript, collected on arrival.
  //
  // It used to be a prop, because the panel was a sibling of the view holding the chip
  // that was clicked. It is not a sibling any more: the click navigates here, so THIS
  // component does not exist when the request is published and no subscription of its
  // own could hear it. The bus parks the request and this drains it — see
  // media-preview-bus for why a parked request is not the remembered "last file" that
  // module refuses to keep.
  //
  // Mount only: this half answers the click that OPENED the pane, and arriving is what
  // opens the document.
  useEffect(() => {
    const requested = takePendingPreview();
    if (requested) {
      setPreviewFile({ path: requested.path, name: requested.name, size: requested.size });
    }
  }, []);

  // AND THE OTHER HALF, for the click that opens no pane because one is already open.
  //
  // This screen used to fill the centre, so a chip click always navigated away from the
  // transcript the chip was in and a mount was always what collected the request. The
  // pane sits BESIDE the transcript, which is the whole point of it — so the second chip
  // a member clicks writes the `rs` that is already there, fires no `hashchange`,
  // remounts nothing, and the drain above never runs again. The document would simply
  // not open, and only from the second click on.
  //
  // The parked copy is taken as well as the delivered one: `requestPreview` parks before
  // it fans out, so leaving it would re-open this document the next time the pane is
  // opened on something else.
  useEffect(
    () =>
      subscribeToPreviewRequests((file) => {
        takePendingPreview();
        setPreviewFile({ path: file.path, name: file.name, size: file.size });
      }),
    [],
  );

  // Somebody else changed this workspace's files — an upload from the composer, a drop
  // on the transcript. A prop carried this while the panel was mounted beside the
  // composer; a screen that renders INSTEAD of the composer cannot be handed one.
  useEffect(() => subscribeToMediaChanged(() => setLocalRefresh((n) => n + 1)), []);

  // The document showing in the detail slot, or null for the tree.
  //
  // DERIVED, never stored as a second piece of state: the kind is a pure function of
  // the path, and a copy of it could disagree with the row that opened it. A file whose
  // extension is not previewable resolves to null, so a stale request cannot leave the
  // screen on a blank pane.
  const openDoc =
    previewFile && previewKind(previewFile.path)
      ? {
          file: previewFile,
          leaf: previewFile.name.slice(previewFile.name.lastIndexOf("/") + 1),
          kind: previewKind(previewFile.path)!,
        }
      : null;
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
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
  // Whether the drag currently over the pane came from OUTSIDE the browser. The two
  // kinds land in different places — an external drag uploads, an internal one moves
  // — so the root zone has to say which one it is offering to do.
  const [externalDrag, setExternalDrag] = useState(false);

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

  // `pending` is the error a caller already has in hand — a dropped folder, which
  // is refused before any upload starts. It is set here rather than by the caller
  // because this function clears the alert on entry, and an upload FAILURE
  // legitimately replaces it: the file that could not be stored is the more
  // actionable of the two.
  async function onUpload(files: FileList | File[], folder = "", pending: string | null = null) {
    setFolderError(pending);
    setUploading(true);
    try {
      // Sequential rather than Promise.all: each upload chowns the uploads tree on
      // the proxy side, and a burst of parallel writes into one directory buys
      // nothing on a panel where two or three files is the realistic case.
      for (const file of Array.from(files)) {
        const stored = await uploadMedia(workspace, file);
        // A destination folder costs a SECOND call: an upload cannot express a
        // subfolder, because StoreMedia reduces the name to a base name. If the
        // move fails the file is visibly at the root with the error beside it —
        // which is the right failure, since nothing was lost.
        if (folder) {
          await moveMedia(workspace, stored.name, dropTarget(stored.name, folder));
        }
      }
      setLocalRefresh((n) => n + 1);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "unknown");
      setLocalRefresh((n) => n + 1);
    } finally {
      setUploading(false);
    }
  }

  // A drop from OUTSIDE the browser, which is an upload — as opposed to the drag
  // of a row already in this tree, which is a move. The two share the highlight and
  // nothing else: they answer different questions (`canDrop` for a move, "is it
  // carrying files" for an upload) and merging them is what made the external drop
  // inert, since every handler was gated on an internal drag being in progress.
  function onExternalDrop(folder: string, dt: DataTransfer) {
    const directories = droppedDirectories(dt);
    const files = Array.from(dt.files ?? []).filter((f) => !directories.includes(f.name));
    const refusal = directories.length ? "media_directory" : null;
    if (files.length) void onUpload(files, folder, refusal);
    else setFolderError(refusal);
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
  }, [workspace.t, workspace.s, workspace.r, workspace.p, localRefresh]);

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

  // Saves the file to disk. The listing's `name` carries the folder path, but what the
  // browser should call the saved file is just the leaf.
  //
  // Failures land in the pane's existing error slot rather than in a per-row message:
  // the row is one line tall and hides its controls when the pointer leaves it, so a
  // message anchored there would be gone before it was read.
  async function onDownload(file: Attachment) {
    setFolderError(null);
    setDownloadingPath(file.path);
    try {
      await downloadMedia(workspace, file.path, file.name.slice(file.name.lastIndexOf("/") + 1));
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "unknown");
    } finally {
      setDownloadingPath(null);
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
  //
  // MARGIN, not padding. It was `paddingLeft`, and an inline style beats a class — so at
  // depth 0 it wrote `padding-left: 0` straight over the row's own `px-2` and every
  // top-level name sat flush against the edge of the panel. A margin composes with the
  // padding instead of replacing it, and it insets the row's hover highlight too, which
  // is what makes the nesting read.
  const indent = (depth: number) => ({ marginLeft: depth * 12 });

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

  // Drop props shared by every folder row and by the root zone, for BOTH kinds of
  // drop: a row from this tree (a move) and files from outside the browser (an
  // upload).
  function dropProps(folder: string) {
    const move = dragPath !== null && canDrop(dragPath, folder);
    // The system folder takes neither kind of drop: the proxy answers 403 for a
    // write into it, and it is the agent's, not the member's.
    //
    // It has to SWALLOW the drop rather than ignore it. A target that does not
    // accept `dragover` is not offered the drop at all — the browser hands it to the
    // nearest ancestor that did, which here is the root zone, so ignoring it would
    // quietly file the drop at the root instead. Refusing out loud is the only
    // answer that matches what the member sees.
    const reserved = isReservedFolder(folder) || isInsideReserved(folder);
    const accepts = (e: React.DragEvent) => move || isExternalFileDrag(e.dataTransfer);
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        if (reserved) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "none";
          return;
        }
        // preventDefault is what makes a target droppable at all; without it the
        // browser refuses the drop and the row silently does nothing.
        e.preventDefault();
        e.stopPropagation();
        setDropFolder(folder);
        setExternalDrag(isExternalFileDrag(e.dataTransfer));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation();
        // `dragleave` fires for every CHILD the pointer crosses and the synthetic event
        // BUBBLES, so a pointer moving inside a row — over its chevron, its name, its
        // count — cleared the highlight that the very next `dragover` put back. At
        // pointer speed that is a strobe, not a highlight, and it reads as the pane
        // freezing.
        //
        // `relatedTarget` is where the pointer actually went. Still inside this row
        // means it never left. Null (it left the window) counts as leaving.
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) {
          return;
        }
        setDropFolder((cur) => (cur === folder ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropFolder(null);
        setExternalDrag(false);
        if (reserved) {
          setFolderError("media_reserved");
          return;
        }
        if (isExternalFileDrag(e.dataTransfer)) onExternalDrop(folder, e.dataTransfer);
        else onDropInto(folder);
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
        setExternalDrag(false);
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
                className="opacity-0 transition-opacity group-hover/dir:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
                className="opacity-0 transition-opacity group-hover/dir:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
        className="group flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-elevated"
        {...dragProps(f.name)}
      >
        {/* A TYPE icon, then the name, then the size.
            
            This row carried no icon for a while, and the reason was sound: a generic file
            glyph was identical on every line, so it said nothing while costing the name
            its width. What earns the width back is VARYING — "this one is a PDF, that one
            is a spreadsheet" is readable before the name is, which is the whole point in a
            narrow column where names truncate.

            `aria-hidden` because the extension is already in the visible name: announcing
            "PDF" before "report.pdf" is noise to a screen reader, not information.

            `min-w-0` is what lets `truncate` engage inside a flex row — without it the
            name would push the controls off the edge. */}
        <FileThumb workspace={workspace} path={f.path} name={node.leaf} />
        {/* The NAME opens the document, rather than an eye icon at the far edge of the
            row that only appears on hover. A member looking for a file looks at its
            name; making the thing they are already reading the thing they can click is
            the whole affordance (file-preview-in-pane). A file with no preview keeps a
            plain label — a link that does nothing is worse than no link. */}
        {previewKind(f.path) ? (
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm text-fg underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current hover:text-accent"
            title={node.leaf}
            aria-label={`${t.preview.action} ${node.leaf}`}
            onClick={() => setPreviewFile(f)}
          >
            {node.leaf}
          </button>
        ) : (
          /* Dimmed, and that is the signal: with the name as the control, a member has
             to be able to see WHICH names are controls. This one only downloads. */
          <span className="min-w-0 truncate text-sm text-fg-muted" title={node.leaf}>
            {node.leaf}
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">
          {formatSize(f.size)}
        </span>
        {/* The actions, all of them, at the right edge — one click each rather than a
            menu that had to be opened first to find out what was in it.
            Revealed on hover, but their SPACE is always reserved: releasing it would
            widen the name on mouse-out and re-truncate it on mouse-in, so every row the
            pointer crossed would flicker.

            `[@media(hover:none)]` keeps them visible where there is no hover to reveal
            them with. Keyed on the CAPABILITY rather than on a width breakpoint, which
            is the reflex: a touch laptop at desktop width has exactly this problem, and
            a narrow desktop window does not. Reserving the space already means showing
            them costs no layout. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <IconButton
            variant="ghost"
            size="sm"
            disabled={downloadingPath === f.path}
            aria-label={`${t.attachment.download} ${node.leaf}`}
            title={t.attachment.download}
            onClick={() => void onDownload(f)}
          >
            <Download size={14} aria-hidden />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={`${t.uploads.deletePrefix} ${f.name}`}
            title={c.actions.delete}
            onClick={() => {
              setDeleteError(null);
              setDeletingPath(f.path);
            }}
          >
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </div>
      </li>
    );
  }

  return (
    // The same column the pane's detail slot was, and it still needs a parent with a
    // height — the tree below scrolls in a `flex-1` region, which resolves to nothing
    // when nothing above it is measured. workspace-screen.tsx is where that height now
    // comes from, and where the reason is written down.
    <div className="flex min-h-0 flex-1 flex-col">
      {openDoc ? (
        <>
          {/* The way back, said in a control of its own rather than folded into the
              heading. The panel had one line for both, because one line was all a narrow
              column had; here the frame's heading already says FILES — where you are —
              and this row says which document is standing in for the tree (FR-5.5). */}
          <div className="flex items-center gap-2 pb-3">
            <Button size="sm" variant="outlined" onClick={() => setPreviewFile(null)}>
              <ChevronLeft size={14} aria-hidden />
              {t.uploads.files}
            </Button>
            <span
              className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg"
              title={openDoc.leaf}
            >
              {openDoc.leaf}
            </span>
            <IconButton
              variant="ghost"
              size="sm"
              disabled={downloadingPath === openDoc.file.path}
              aria-label={`${t.attachment.download} ${openDoc.leaf}`}
              title={t.attachment.download}
              onClick={() => void onDownload(openDoc.file)}
            >
              <Download size={15} aria-hidden />
            </IconButton>
          </div>
          {/* The document takes the files slot while it is open (FR-5.5): one detail
              destination, and the way back is the control above. */}
          <FilePreview
            workspace={workspace}
            path={openDoc.file.path}
            name={openDoc.leaf}
            kind={openDoc.kind}
            size={openDoc.file.size}
          />
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 px-2 pt-2">
            <input
              ref={fileRef}
              type="file"
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
            {/* Last, and pushed to the far end: the agent writes into this same tree
                between visits, so "look again" is an action on the whole listing rather
                than one more thing to do to it. It was the panel header's control; the
                header is gone and the row of listing-wide actions is where it belongs. */}
            <IconButton
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-label={t.uploads.refreshAria}
              title={t.uploads.refresh}
              onClick={() => setLocalRefresh((n) => n + 1)}
            >
              <RefreshCw size={15} aria-hidden />
            </IconButton>
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
              {/* Absolutely positioned, and `pointer-events-none`, because BOTH
                  would otherwise feed the flicker this pane had: a hint in the
                  flow pushes every row down as it appears, which slides the row
                  out from under the pointer, which hides the hint, which slides
                  the rows back — a loop that sustains itself at pointer speed.
                  An element that can receive pointer events would add its own
                  dragenter/dragleave pair on top of that. */}
              {externalDrag && dropFolder === "" && (
                <p className="pointer-events-none absolute inset-x-1 top-1 z-10 rounded-md bg-surface/95 px-2 py-1 text-center text-xs font-semibold text-accent shadow-sm">
                  {t.uploads.dropToUpload}
                </p>
              )}
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
    </div>
  );
}
