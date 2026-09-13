/**
 * "The workspace's files changed", published by whatever changed them.
 *
 * Module scope, not a prop, for a reason the sibling `media-preview-bus` does not have:
 * the two readers are no longer in the same tree. The composer's `@`-mention list lives
 * inside the chat view; the files screen is the shell's, in the pane beside it. A React
 * prop cannot cross that, and a counter lifted into the shell would make the shell an
 * owner of something neither of its children is about.
 *
 * Deliberately payload-free. "Something changed, re-read" is all either side does with
 * it, and a payload would invite a listener to trust it instead of re-reading — which is
 * how a stale list survives a refresh signal.
 */

const listeners = new Set<() => void>();

export function subscribeToMediaChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishMediaChanged(): void {
  // A copy, because a listener is free to unsubscribe from inside its own callback and
  // mutating the set mid-iteration would skip the next one.
  for (const fn of [...listeners]) fn();
}
