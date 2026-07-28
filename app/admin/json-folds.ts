import { tokenize } from "./json-tokens";

// Code folding for the raw JSON editor, and the piece a library would otherwise
// have supplied. React-free, so all of it is testable in this suite.
//
// The invariant everything here protects: the CANONICAL document is always the
// full text. Folding derives a *view* of it plus a segment map; the textarea shows
// the view, and an edit made in view coordinates is translated back into the
// canonical text. So a fold can be open or closed anywhere while the admin types
// anywhere else, and what a save sends never depends on what is collapsed.
//
// A fold is identified by the OFFSET OF ITS OPENING BRACKET, and nothing else is
// stored. Everything derived — where it closes, how many children it has, whether
// it is still foldable at all — is recomputed from the text, so an id that an edit
// invalidated simply stops matching and the fold disappears. There is no stale
// state to reconcile.

export const FOLD_PLACEHOLDER = " … ";

export interface FoldRange {
  /** Offset of the opening `{` or `[`. Also the fold's identity. */
  open: number;
  /** Offset of the matching closing bracket. */
  close: number;
  openLine: number;
  closeLine: number;
  kind: "object" | "array";
  /** Direct children, for the gutter's title. */
  count: number;
}

// foldRanges returns every bracket pair that spans more than one line. A pair that
// opens and closes on the same line is deliberately excluded: collapsing it would
// hide nothing and the arrow would do nothing visible.
export function foldRanges(text: string): FoldRange[] {
  const lineOf = lineIndex(text);
  const stack: { open: number; kind: "object" | "array"; commas: number; content: boolean }[] = [];
  const out: FoldRange[] = [];

  for (const token of tokenize(text)) {
    if (token.kind === "punct") {
      const ch = text[token.start];
      if (ch === "{" || ch === "[") {
        stack.push({ open: token.start, kind: ch === "{" ? "object" : "array", commas: 0, content: false });
        continue;
      }
      if (ch === "}" || ch === "]") {
        const frame = stack.pop();
        if (!frame) continue; // unbalanced input; the tokenizer tolerates it, so do we
        const openLine = lineOf(frame.open);
        const closeLine = lineOf(token.start);
        if (closeLine > openLine) {
          out.push({
            open: frame.open,
            close: token.start,
            openLine,
            closeLine,
            kind: frame.kind,
            count: frame.content ? frame.commas + 1 : 0,
          });
        }
        markContent(stack);
        continue;
      }
      if (ch === "," && stack.length > 0) {
        stack[stack.length - 1].commas++;
        continue;
      }
      if (ch === ":") continue;
    }
    if (token.kind !== "plain") markContent(stack);
  }

  return out.sort((a, b) => a.open - b.open);
}

function markContent(stack: { content: boolean }[]): void {
  if (stack.length > 0) stack[stack.length - 1].content = true;
}

/**
 * One run of the view. A visible run maps 1:1 onto canonical text. A `hidden` run
 * is the placeholder: its view length and canonical length differ, and that is the
 * only place the two coordinate systems come apart.
 */
export interface Segment {
  viewStart: number;
  viewEnd: number;
  canonicalStart: number;
  canonicalEnd: number;
  hidden: boolean;
}

export interface FoldedView {
  text: string;
  segments: Segment[];
  /** The ranges actually folded, in document order — what the gutter renders. */
  folded: FoldRange[];
}

// foldedView builds the text the textarea shows.
//
// Only ids that still name a real, still-multi-line range are honoured, and a
// range nested inside one that is already collapsed is skipped — its text is
// already hidden, and emitting a second placeholder for it would produce
// overlapping segments.
export function foldedView(text: string, folded: ReadonlySet<number>): FoldedView {
  const ranges = foldRanges(text).filter((r) => folded.has(r.open));
  const segments: Segment[] = [];
  const applied: FoldRange[] = [];
  let view = "";
  let cursor = 0;

  for (const range of ranges) {
    if (range.open < cursor) continue; // inside an already-collapsed range
    // Everything up to and including the opening bracket stays visible.
    const visibleEnd = range.open + 1;
    if (visibleEnd > cursor) {
      segments.push({
        viewStart: view.length,
        viewEnd: view.length + (visibleEnd - cursor),
        canonicalStart: cursor,
        canonicalEnd: visibleEnd,
        hidden: false,
      });
      view += text.slice(cursor, visibleEnd);
    }
    segments.push({
      viewStart: view.length,
      viewEnd: view.length + FOLD_PLACEHOLDER.length,
      canonicalStart: visibleEnd,
      canonicalEnd: range.close,
      hidden: true,
    });
    view += FOLD_PLACEHOLDER;
    applied.push(range);
    cursor = range.close;
  }

  if (cursor < text.length) {
    segments.push({
      viewStart: view.length,
      viewEnd: view.length + (text.length - cursor),
      canonicalStart: cursor,
      canonicalEnd: text.length,
      hidden: false,
    });
    view += text.slice(cursor);
  }

  return { text: view, segments, folded: applied };
}

// sameFolds compares fold sets by CONTENTS.
//
// It exists because comparing them by size is wrong in a way that leaves no trace:
// an edit above a fold shifts its id without changing how many folds there are, and
// a caller that skips the update on equal sizes then applies stale offsets to new
// text. Every fold below the edit silently pops open, and if another foldable
// bracket happens to sit at the old offset, the wrong node collapses instead.
export function sameFolds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

// collapseAll folds everything EXCEPT the document's outermost bracket.
//
// Collapsing that one too would reduce the whole file to `{ … }`, which no one wants
// to look at. Excluding it is what produces the useful overview: on the seeded
// template, 470 lines become 17 — one row per top-level key.
export function collapseAll(text: string): Set<number> {
  const ranges = foldRanges(text);
  const outermost = ranges.length > 0 ? Math.min(...ranges.map((r) => r.open)) : -1;
  return new Set(ranges.filter((r) => r.open !== outermost).map((r) => r.open));
}

export interface ViewEdit {
  text: string;
  folded: Set<number>;
}

// applyViewEdit translates an edit made against the folded view back into the
// canonical document.
//
// It works from the two view strings rather than from a change event, because a
// textarea reports its whole new value and nothing about what changed. Comparing
// the common prefix and suffix recovers the changed span exactly, which is what a
// real editor's changeset would have told us.
export function applyViewEdit(
  canonical: string,
  folded: ReadonlySet<number>,
  oldView: string,
  newView: string,
): ViewEdit {
  const view = foldedView(canonical, folded);
  const { segments } = view;
  const { start, end, replacement } = diffSpan(oldView, newView);

  const canonicalStart = toCanonical(segments, start, "start");
  const canonicalEnd = toCanonical(segments, end, "end");
  const text = canonical.slice(0, canonicalStart) + replacement + canonical.slice(canonicalEnd);

  // An edit overlapping a placeholder replaced the WHOLE hidden range, so that
  // fold no longer describes anything — exactly what a real editor does when you
  // select across a collapsed region and type.
  //
  // Dropping the id matters even though a stale one is already harmless (it stops
  // matching a range and is filtered out). Left in the set, it would lie in wait:
  // collapse a list, type over the placeholder to get `[9]`, then press Enter
  // inside it, and the range becomes multi-line again and springs back COLLAPSED.
  const touched = new Set(
    view.folded
      .filter((r) => canonicalStart <= r.close && canonicalEnd > r.open)
      .map((r) => r.open),
  );

  const delta = replacement.length - (canonicalEnd - canonicalStart);
  const next = new Set<number>();
  for (const open of folded) {
    if (touched.has(open)) continue;
    if (open >= canonicalStart && open < canonicalEnd) continue; // destroyed by the edit
    next.add(open >= canonicalEnd ? open + delta : open);
  }
  return { text, folded: next };
}

// diffSpan recovers the changed range in OLD-view coordinates plus the text that
// replaced it. The suffix scan is bounded so it can never overlap the prefix,
// which would report a negative-length span for an edit inside a repeated run.
function diffSpan(a: string, b: string): { start: number; end: number; replacement: string } {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p++;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { start: p, end: a.length - s, replacement: b.slice(p, b.length - s) };
}

// toCanonical maps a view offset into the canonical document.
//
// At a placeholder the two coordinate systems have no 1:1 answer, so the edge is
// chosen to SWALLOW the hidden range: a change starting inside it starts at the
// hidden text's beginning, and one ending inside it ends at its end. Any other
// choice would splice the admin's text into the middle of content they cannot see.
function toCanonical(segments: Segment[], viewOffset: number, edge: "start" | "end"): number {
  if (segments.length === 0) return viewOffset;
  for (const seg of segments) {
    if (viewOffset >= seg.viewStart && viewOffset < seg.viewEnd) {
      if (seg.hidden) return edge === "start" ? seg.canonicalStart : seg.canonicalEnd;
      return seg.canonicalStart + (viewOffset - seg.viewStart);
    }
  }
  // Past the end of the view: the end of the document.
  return segments[segments.length - 1].canonicalEnd;
}

// lineIndex returns a function from offset to 0-based line, built once per call so
// a document with hundreds of brackets is not rescanned per bracket.
function lineIndex(text: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

// lineStarts is the offset each visible line begins at — what the gutter needs to
// place a fold arrow next to the right row.
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") out.push(i + 1);
  }
  return out;
}
