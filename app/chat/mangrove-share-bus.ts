// "Share this in the mangrove", published by whatever the member clicked.
//
// Module scope, not a prop, and the geometry is what forces it: the files tab and the
// knowledge graph live in the pane BESIDE the conversation, while the mangrove is a
// destination that replaces the centre. The two are siblings under the shell with no
// common ancestor below it, and the mangrove screen does not exist yet at the moment
// the share is asked for — clicking the control is part of what puts it on screen.
//
// This is `media-preview-bus.ts` with a different payload, deliberately: the same
// pending-slot-plus-listeners shape, for the same reason it has one.

/** A workspace file, by the path the files tab already holds. */
export interface FileShare {
  kind: "file";
  /** What the proxy resolves. NEVER the display name -- they differ under a folder. */
  path: string;
  /** What the composer shows the member. */
  name: string;
}

/** Entities out of the knowledge graph, by name. */
export interface EntitiesShare {
  kind: "entities";
  names: string[];
}

export type MangroveShare = FileShare | EntitiesShare;

const listeners = new Set<(share: MangroveShare) => void>();

/**
 * The share nobody was listening for, held until somebody is.
 *
 * The FIRST share is always published into an empty room: the mangrove screen mounts
 * as a result of the same click, after the fan-out below has finished. Both halves
 * are needed and the screen drains both — this slot on mount, the subscription for
 * every share after it, which is the case where the member is already standing on the
 * mangrove with the files pane open beside it.
 *
 * CONSUMED, not remembered. After `takePendingShare` there is nothing left to re-open,
 * so navigating back to the mangrove later does not reopen a composer holding a file
 * the member shared an hour ago.
 */
let pending: MangroveShare | null = null;

export function subscribeToShareRequests(fn: (share: MangroveShare) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The share published while nothing was listening, once. Null when there is none. */
export function takePendingShare(): MangroveShare | null {
  const share = pending;
  pending = null;
  return share;
}

export function requestMangroveShare(share: MangroveShare): void {
  // Parked BEFORE the fan-out, as the preview bus does: the listener is what a
  // mounted screen reacts to, the slot is what an unmounted one finds on arrival.
  pending = share;
  for (const fn of [...listeners]) fn(share);
}
