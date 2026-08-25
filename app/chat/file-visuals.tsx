"use client";

import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { fileTypeGroup, mediaUrl, previewKind, type FileTypeGroup } from "@/lib/media";
import type { Workspace } from "@/app/chat/fragment";

// How a workspace file is DRAWN when it is not being shown: the glyph for its type
// and the size beside its name. Shared by the files pane and by the chat's
// attachment previews — two copies of the glyph table is how a new file type comes
// to be drawn one way in the sidebar and another in the conversation.

// One glyph per file-type GROUP.
//
// Grouped rather than per-extension because the icon only helps along distinctions a
// member makes at a glance: "spreadsheet" and "archive" are such distinctions, `.xlsx`
// versus `.xls` is not. `unknown` gets the plain file glyph — the honest answer for an
// extension we do not recognise, and better than a confident wrong one.
//
// Colour, deliberately not the accent: in this design system the accent means
// "interactive", and a type marker is not. Muted keeps it subordinate to the name, which
// is what the member is actually scanning.
export const FILE_TYPE_ICONS: Record<FileTypeGroup, LucideIcon> = {
  pdf: FileType,
  image: FileImage,
  markdown: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  code: FileCode,
  audio: FileAudio,
  video: FileVideo,
  unknown: File,
};

export function FileTypeIcon({ group, size = 14 }: { group: FileTypeGroup; size?: number }) {
  const Icon = FILE_TYPE_ICONS[group];
  // aria-hidden: the extension is already in the visible name, so announcing the type
  // before it would be noise to a screen reader rather than information.
  return <Icon size={size} aria-hidden className="shrink-0 text-fg-muted" />;
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A row's leading mark: the picture itself for an image, the type glyph for anything
 * else.
 *
 * 20px, which is the row's existing line height — a bigger thumbnail would push the
 * rows apart, and this pane exists to show a lot of files at once. Deliberately
 * `object-cover`: at this size a letterboxed image is grey with a stripe in it, while a
 * crop of the middle still reads as "the blue chart".
 *
 * `previewKind`, not `fileTypeGroup`, for the same reason the chat previews use it:
 * the group counts `.svg`, which cannot decode from an `application/octet-stream`
 * response. A file whose extension lies about its bytes falls back to the glyph.
 */
export function FileThumb({
  workspace,
  path,
  name,
}: {
  workspace: Workspace;
  path: string;
  name: string;
}) {
  const [broken, setBroken] = useState(false);
  if (previewKind(path) !== "image" || broken) {
    return <FileTypeIcon group={fileTypeGroup(path)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image cannot take a
    // runtime-resolved workspace URL, and optimization is off in this deployment.
    <img
      src={mediaUrl(workspace, path)}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      title={name}
      className="h-5 w-5 shrink-0 rounded object-cover"
    />
  );
}
