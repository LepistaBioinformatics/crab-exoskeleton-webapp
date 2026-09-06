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
 *
 * Deliberately NOT a store: there is no state here to read, only an event. A remembered
 * "last requested file" would re-open a document every time a view remounted.
 */
export type PreviewRequest = Pick<Attachment, "path" | "name"> & { size?: number };

const listeners = new Set<(file: PreviewRequest) => void>();

export function subscribeToPreviewRequests(fn: (file: PreviewRequest) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function requestPreview(file: PreviewRequest): void {
  for (const fn of [...listeners]) fn(file);
}
