import type { CSSProperties } from "react";

// How the two stacked boxes of the chats sidebar — projects and conversations —
// share the height between them.
//
// Pure, and its own module, because the bug it fixes is invisible in review: the
// panel READ correctly with the styles omitted, and the omission only showed as
// one box drawing over the other's header once a list got long enough.

export interface SplitBoxes {
  projects: CSSProperties;
  chats: CSSProperties;
}

// THE RULE: exactly one box may take the leftover height. Every other box is
// `flex: none` — its own content, never shrunk.
//
// Leaving a box's style undefined is NOT the same thing, which is what shipped:
// undefined means `flex: 0 1 auto`, so a collapsed box keeps `flex-shrink: 1`
// and a long list next to it squeezes the collapsed box below its own header
// height. Its header then overflows the box it is in and the neighbour, laid out
// after it, is drawn across the overflowing text.
const NONE: CSSProperties = { flex: "none" };
// `flexBasis: 0` so the box takes the leftover space rather than its content's
// height plus the leftover — the difference between "fill the rest" and "grow
// past the panel".
const FILL: CSSProperties = { flexGrow: 1, flexShrink: 1, flexBasis: 0 };

export function splitBoxStyles(input: {
  /** Both boxes open and side by side, so the seam between them can be dragged. */
  splittable: boolean;
  /** The projects box's share of the height while splittable, 0..1. */
  projectsShare: number;
  projectsOpen: boolean;
  chatsOpen: boolean;
}): SplitBoxes {
  if (input.splittable) {
    return {
      // flexGrow rather than a height: the panel is itself resizable, and the
      // shares stay proportional as it changes with no resize listener.
      projects: { flexGrow: input.projectsShare, flexShrink: 1, flexBasis: 0 },
      chats: { flexGrow: 1 - input.projectsShare, flexShrink: 1, flexBasis: 0 },
    };
  }
  // Not splittable: at most one box has a list to show, and it takes the rest.
  // With both collapsed neither grows — two headers and empty space below, which
  // is what a member who folded both asked for.
  if (input.chatsOpen) return { projects: NONE, chats: FILL };
  if (input.projectsOpen) return { projects: FILL, chats: NONE };
  return { projects: NONE, chats: NONE };
}
