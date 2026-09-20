// Cutting a long line down to something a narrow panel can hold.
//
// BY CHARACTERS, NOT BY CSS LINES, and that is a deliberate trade. `line-clamp`
// is the prettier tool, but knowing whether to OFFER a "show more" then means
// measuring the rendered box -- and a toggle that reveals nothing, because the
// text happened to fit, is worse than a slightly early cut. Counting is exact by
// construction: the toggle exists exactly when something is hidden.
//
// The panel this serves is a sidebar, so the budget is small on purpose.

/** Characters shown before a long line is cut. */
export const CLAMP_LIMIT = 140;

export interface Clamped {
  /** What to render while collapsed. */
  head: string;
  /** Whether anything is hidden -- i.e. whether to offer the toggle at all. */
  truncated: boolean;
}

/**
 * Cuts at the last word boundary before the limit, so the collapsed line does
 * not end mid-word.
 *
 * A text with no space in range is cut at the limit regardless: one long
 * unbroken token is exactly the case that would otherwise overflow the panel,
 * which is what this exists to prevent.
 */
export function clampText(text: string, limit: number = CLAMP_LIMIT): Clamped {
  const clean = text.trim();
  if (clean.length <= limit) return { head: clean, truncated: false };

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  // Only honour a word boundary that leaves most of the budget used; cutting a
  // 140-character allowance down to 12 because the first space was early reads
  // as a bug, not as tidiness.
  const head = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { head: head.trimEnd(), truncated: true };
}
