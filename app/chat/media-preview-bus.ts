import type { Attachment } from "@/lib/media";

/**
 * "Open this file in the panel", published by whatever the member clicked.
 *
 * Module scope, not a prop: an attachment chip is rendered inside a message's markdown,
 * several components below the view that owns the panel, and threading a callback down
 * that path would put a preview parameter on every component in between — including the
 * markdown renderer, which has no business knowing about panels. The codebase already
 * signals across the tree this way (`notifyConversationsUpdated`, the turn store's
 * listeners), and this is that pattern with one payload.
 */
export type PreviewRequest = Pick<Attachment, "path" | "name"> & { size?: number };

const listeners = new Set<(file: PreviewRequest) => void>();

/**
 * The request nobody was listening for, held until somebody is.
 *
 * A chip's click reaches a mounted listener when the files pane is ALREADY open, and
 * nothing at all when it is not: opening the pane is part of what the click asks for, so
 * the files screen mounts after the fan-out below has finished. Without somewhere to
 * wait, that first request is published into an empty room and the document never opens.
 *
 * Both halves are needed and the files screen drains both — `takePendingPreview` on
 * mount for the click that opened the pane, a subscription for every click after it.
 *
 * This is not the "remembered last requested file" this module used to warn against: a
 * remembered value re-opens a document on every remount, and this one is CONSUMED. After
 * `takePendingPreview` there is nothing left to re-open.
 */
let pending: PreviewRequest | null = null;

export function subscribeToPreviewRequests(fn: (file: PreviewRequest) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The request published while nothing was listening, once. Null when there is none. */
export function takePendingPreview(): PreviewRequest | null {
  const file = pending;
  pending = null;
  return file;
}

export function requestPreview(file: PreviewRequest): void {
  // Parked BEFORE the fan-out. The two halves answer different questions and both are
  // needed: the listener is what NAVIGATES to the files screen, the slot is what the
  // screen finds waiting when it gets there.
  pending = file;
  for (const fn of [...listeners]) fn(file);
}
