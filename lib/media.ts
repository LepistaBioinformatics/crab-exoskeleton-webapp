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
  form.set("file", file, file.name);

  const res = await fetch("/api/media", { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return { path: data.path, name: data.name, size: data.size };
}

// Lists the files already stored in the workspace uploads dir (for the uploads
// sidebar).
export async function listWorkspaceMedia(workspace: Workspace): Promise<Attachment[]> {
  const query = new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
  });
  const res = await fetch(`/api/media?${query.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

// Display name for a workspace path: drop the "uploads/" prefix and any legacy
// 8-hex storage uid prefix.
export function attachmentName(path: string): string {
  return path.replace(/^uploads\//, "").replace(/^[0-9a-f]{8}-/, "");
}

const ANEXO_RE = /\[anexo:\s*(uploads\/[^\]\s]+)\]/gi;

// Pulls `[anexo: uploads/...]` references out of a message so they can render as
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

// Downloads one file: fetches the bytes and triggers a browser save with the
// display name (no direct navigation, so it stays out of history).
export async function downloadMedia(workspace: Workspace, path: string, name: string): Promise<void> {
  const query = new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    path,
  });
  const res = await fetch(`/api/media/download?${query.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const blob = await res.blob();
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
  const query = new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    path,
  });
  const res = await fetch(`/api/media?${query.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorCode(res));
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
    path,
  });
}

export function moveMedia(workspace: Workspace, from: string, to: string): Promise<unknown> {
  return mediaWrite("/api/media/move", "POST", {
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
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
