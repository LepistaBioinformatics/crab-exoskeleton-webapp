import { errorCode } from "@/lib/i18n/errors";
import type { Workspace } from "@/app/chat/fragment";

export interface Attachment {
  path: string; // workspace-relative, e.g. "uploads/ab12cd34-photo.png"
  name: string;
  size?: number;
  /**
   * A folder rather than a file.
   *
   * The listing used to carry files only, and the tree derived its folders from the
   * PREFIXES of file paths — which works until a folder is empty. A member who created
   * one saw no row, and therefore no drop target to put a file into.
   */
  isDir?: boolean;
}

// Attach categories shown in the composer's attach menu. Each opens the picker
// filtered to its extensions; "Outros" (rendered separately) uses MEDIA_ACCEPT
// (the full allowlist). Must stay in sync with the proxy's MediaAllowedExts.
export interface MediaCategory {
  key: string;
  label: string;
  exts: string[];
}

export const MEDIA_CATEGORIES: MediaCategory[] = [
  { key: "image", label: "Imagens", exts: ["png", "jpg", "jpeg", "webp", "gif"] },
  { key: "doc", label: "Documentos", exts: ["pdf", "txt", "md", "csv", "doc", "docx", "odt"] },
  { key: "sheet", label: "Planilhas", exts: ["xls", "xlsx", "ods"] },
  { key: "slides", label: "Apresentações", exts: ["ppt", "pptx", "odp"] },
  { key: "archive", label: "Comprimidos", exts: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"] },
];

// The full allowlist (union of every category) — the proxy rejects anything
// outside it with 400.
export const MEDIA_ALL_EXTS = [...new Set(MEDIA_CATEGORIES.flatMap((c) => c.exts))];

// `accept` string for a set of extensions (e.g. ".png,.jpg").
export function acceptFor(exts: string[]): string {
  return exts.map((e) => `.${e}`).join(",");
}

// Full allowlist as an `accept` string (used by the "Outros" option).
export const MEDIA_ACCEPT = acceptFor(MEDIA_ALL_EXTS);

export async function uploadMedia(workspace: Workspace, file: File): Promise<Attachment> {
  const form = new FormData();
  form.set("role", workspace.r);
  form.set("tenant_id", workspace.t);
  form.set("subs_acc_id", workspace.s);
  // agent-projects: the only writer here that cannot use `withProject` — this is a
  // multipart body, not a query. Omitted entirely (never sent empty) when there is
  // no project: the proxy 404s an unknown id, and "" would be one.
  //
  // It was missing, and the file landed in the agent's own workspace while the turn
  // told the PROJECT's agent to open it. The agent then searched for a path that did
  // not exist and gave up.
  if (workspace.p) form.set("project", workspace.p);
  form.set("file", file, file.name);

  const res = await fetch("/api/media", { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return { path: data.path, name: data.name, size: data.size };
}

// Lists the files already stored in the workspace uploads dir (for the uploads
// sidebar).
export async function listWorkspaceMedia(workspace: Workspace): Promise<Attachment[]> {
  const query = withProject(new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...(workspace.p ? { project: workspace.p } : {}),
  }), workspace);
  const res = await fetch(`/api/media?${query.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

// The member-facing folder, and the name it used to have.
//
// Both are matched everywhere a stored path is read, and the legacy one is not
// deprecation politeness: the prefix is a LABEL the proxy strips before resolving,
// so every `[anexo: uploads/...]` marker already sitting in a picoclaw transcript
// still points at a real file. Those transcripts are never rewritten. Matching
// only the new name would stop rendering download chips for every past
// conversation -- silently, since a marker that does not match is left as prose.
const PUBLIC_PREFIX_RE = /^(?:public|uploads)\//;

// Display name for a workspace path: drop the folder prefix and any legacy
// 8-hex storage uid prefix.
export function attachmentName(path: string): string {
  return path.replace(PUBLIC_PREFIX_RE, "").replace(/^[0-9a-f]{8}-/, "");
}

const ANEXO_RE = /\[anexo:\s*((?:public|uploads)\/[^\]\s]+)\]/gi;

// Pulls `[anexo: public/...]` references out of a message so they can render as
// download chips, and returns the remaining text (refs stripped) for markdown.
export function parseAnexos(content: string): { text: string; refs: Attachment[] } {
  const refs: Attachment[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  ANEXO_RE.lastIndex = 0;
  while ((match = ANEXO_RE.exec(content)) !== null) {
    const path = match[1];
    if (!seen.has(path)) {
      seen.add(path);
      refs.push({ path, name: attachmentName(path) });
    }
  }
  const text = content.replace(ANEXO_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, refs };
}

/**
 * The URL that serves one file's bytes.
 *
 * Exported because an `<img>` can point straight at it: the route authenticates from
 * the session COOKIE, so a plain src needs no fetch, no blob and no revocation, and the
 * browser gets to stream and cache it. An `<iframe>` may NOT — the proxy answers with
 * `Content-Disposition: attachment` (handlers.go), which an iframe honours by
 * downloading instead of rendering. Frames go through `fetchMediaBlob` for that reason.
 */
export function mediaUrl(workspace: Workspace, path: string): string {
  const query = withProject(new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    path,
  }), workspace);
  return `/api/media/download?${query.toString()}`;
}

/**
 * The MIME type a preview has to assert locally, or null when none is needed.
 *
 * The proxy serves EVERY media file as `application/octet-stream` with
 * `Content-Disposition: attachment` (crab-shell-proxy handlers.go), which is a
 * deliberate posture: a member's file is untrusted content and must never render
 * inline from this origin. `res.blob()` inherits that type, and a browser trusts the
 * blob's own type over an `<object type=…>` attribute — so a PDF preview showed the
 * fallback in Firefox and downloaded itself in Chromium.
 *
 * Images are unaffected and get null: `<img>` sniffs the bytes and ignores the type.
 * Re-typing is scoped to the blob: URL the preview builds, which is an opaque origin —
 * the server's posture for every other consumer is untouched.
 */
export function previewBlobType(kind: PreviewKind): string | null {
  return kind === "pdf" ? "application/pdf" : null;
}

/** One file's bytes. Shared by the download-to-disk path and by the preview. */
export async function fetchMediaBlob(workspace: Workspace, path: string): Promise<Blob> {
  const res = await fetch(mediaUrl(workspace, path));
  if (!res.ok) throw new Error(await errorCode(res));
  return res.blob();
}

// Downloads one file: fetches the bytes and triggers a browser save with the
// display name (no direct navigation, so it stays out of history).
export async function downloadMedia(workspace: Workspace, path: string, name: string): Promise<void> {
  const blob = await fetchMediaBlob(workspace, path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteMedia(workspace: Workspace, path: string): Promise<void> {
  const query = withProject(new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...(workspace.p ? { project: workspace.p } : {}),
    path,
  }), workspace);
  const res = await fetch(`/api/media?${query.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorCode(res));
}


// --- Preview -------------------------------------------------------------
//
// Which files the webapp can SHOW rather than only hand to the operating system.
// Deliberately a subset of MEDIA_ALL_EXTS: everything else (office documents,
// archives) would need a parsing library, so those keep the download-only menu.

export type PreviewKind = "image" | "markdown" | "text" | "pdf";

const PREVIEW_KINDS: Record<string, PreviewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  md: "markdown",
  txt: "text",
  csv: "text",
  pdf: "pdf",
};

/**
 * How a file can be previewed, or null when it cannot be.
 *
 * Case-insensitive: the agent writes `REPORT.MD` as readily as `report.md`, and an
 * extension check that missed one would look like a broken menu rather than a rule.
 */
export function previewKind(nameOrPath: string): PreviewKind | null {
  const leaf = nameOrPath.slice(nameOrPath.lastIndexOf("/") + 1);
  const dot = leaf.lastIndexOf(".");
  if (dot <= 0) return null; // no extension, or a dotfile with none
  return PREVIEW_KINDS[leaf.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Text bodies are read whole into memory, so the size is checked against the
 * LISTING's `size` before the request rather than after `blob.text()` has already
 * frozen the tab. 2 MB is far past any report an agent writes and far short of a
 * CSV export that would hang.
 */
export const PREVIEW_TEXT_MAX = 2 * 1024 * 1024;

/**
 * Resolves an image reference found INSIDE a previewed markdown file against that
 * file's own folder, so `![](diagram.png)` in `uploads/reports/q2.md` becomes
 * `uploads/reports/diagram.png`.
 *
 * Returns null for anything already absolute (`http:`, `https:`, `data:`, or a
 * root-relative path) — those are left exactly as the author wrote them.
 *
 * Without this the src resolves against the WEBAPP's origin and renders a broken
 * image, which reads as a bug rather than as a limit.
 */
export function resolveMediaRef(filePath: string, src: string): string | null {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.startsWith("#")) {
    return null;
  }
  const base = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  const segments = base ? base.split("/") : [];
  for (const part of src.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

// --- Uploads-tree organisation -------------------------------------------
//
// Create a folder, move a file or folder, delete a folder and its contents. All
// three write into the same directory an upload does, so they carry the same gate.
//
// There is no rename: a move within the same parent IS the rename, and the proxy
// implements them as one call with one set of failure modes. Callers compute the
// destination path and use `moveMedia`.

async function mediaWrite(path: string, method: "POST" | "DELETE", body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return res.json().catch(() => ({}));
}

export function createFolder(workspace: Workspace, path: string): Promise<unknown> {
  return mediaWrite("/api/media/folder", "POST", {
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...(workspace.p ? { project: workspace.p } : {}),
    path,
  });
}

export function moveMedia(workspace: Workspace, from: string, to: string): Promise<unknown> {
  return mediaWrite("/api/media/move", "POST", {
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...(workspace.p ? { project: workspace.p } : {}),
    path: from,
    to,
  });
}

/** Recursive. Returns how many files the proxy actually removed. */
export async function deleteFolder(workspace: Workspace, path: string): Promise<number> {
  const out = (await mediaWrite("/api/media/folder", "DELETE", {
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...(workspace.p ? { project: workspace.p } : {}),
    path,
  })) as { removedFiles?: number };
  return typeof out.removedFiles === "number" ? out.removedFiles : 0;
}

/**
 * Where a drag may legally land, decided before the request so an illegal drop is
 * refused with no round trip and no flicker.
 *
 * Pure and exported because the rules are easy to state and easy to get wrong:
 * a folder cannot go into itself or its own descendant, nothing can land where it
 * already is, and a folder path is a PREFIX of its descendants' paths — so the
 * comparison needs the separator, or "notes" would look like an ancestor of
 * "notes-old".
 */
export function canDrop(sourcePath: string, targetFolder: string): boolean {
  if (!sourcePath) return false;
  // The system folder is neither draggable nor a destination: the proxy refuses both,
  // so lighting it up would invite a 403.
  if (isReservedFolder(sourcePath) || isInsideReserved(sourcePath)) return false;
  if (isReservedFolder(targetFolder) || isInsideReserved(targetFolder)) return false;
  const parent = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
  if (parent === targetFolder) return false; // already there
  if (targetFolder === sourcePath) return false; // onto itself
  if (targetFolder.startsWith(sourcePath + "/")) return false; // into its own descendant
  return true;
}

/** The destination path a drop produces: the target folder plus the source's name. */
export function dropTarget(sourcePath: string, targetFolder: string): string {
  const name = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
  return targetFolder ? `${targetFolder}/${name}` : name;
}

/**
 * The folder the SYSTEM owns, not the member: `attachments`, where the proxy puts
 * files the AGENT produced.
 *
 * A member renaming it would silently detach every future delivery, and creating their
 * own folder by that name would collide with it. Only the TOP LEVEL is reserved —
 * `reports/attachments` is an ordinary folder somebody may legitimately want, and
 * forbidding the word everywhere would be a rule about vocabulary rather than about
 * ownership.
 *
 * The proxy enforces the same rule independently and answers 403. This exists so the
 * interface can hide the controls and explain itself, not as the enforcement.
 */
export const RESERVED_FOLDER = "attachments";

export function isReservedFolder(path: string): boolean {
  return path === RESERVED_FOLDER;
}

/** True for anything living inside the system folder. */
export function isInsideReserved(path: string): boolean {
  return path.startsWith(RESERVED_FOLDER + "/");
}

// agent-projects: appends the project so the proxy resolves the project's own
// workspace directory instead of the agent's. Absent for a project-less view,
// which keeps every existing request byte-identical.
function withProject(query: URLSearchParams, workspace: Workspace): URLSearchParams {
  if (workspace.p) query.set("project", workspace.p);
  return query;
}
