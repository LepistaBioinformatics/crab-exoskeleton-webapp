import { describe, it, expect } from "vitest";
import {
  foldRanges,
  foldedView,
  applyViewEdit,
  lineStarts,
  FOLD_PLACEHOLDER,
} from "./json-folds";

const doc = `{
  "version": 3,
  "agents": {
    "defaults": {
      "model_name": "main",
      "max_tokens": 32768
    }
  },
  "list": [
    1,
    2
  ],
  "inline": { "a": 1 }
}`;

const openOf = (needle: string) => doc.indexOf(needle);

describe("foldRanges", () => {
  it("finds every multi-line bracket pair, nested included", () => {
    const opens = foldRanges(doc).map((r) => r.open);
    expect(opens).toContain(0); // the document itself
    expect(opens).toContain(openOf('{\n    "defaults"'));
    expect(opens).toContain(openOf("[\n    1"));
  });

  it("excludes a pair that opens and closes on one line", () => {
    // Collapsing `{ "a": 1 }` would hide nothing, so the arrow would do nothing.
    const inline = doc.indexOf('{ "a": 1 }');
    expect(foldRanges(doc).map((r) => r.open)).not.toContain(inline);
  });

  it("reports the kind and the direct-child count for the gutter", () => {
    const root = foldRanges(doc).find((r) => r.open === 0);
    expect(root?.kind).toBe("object");
    // version, agents, list, inline
    expect(root?.count).toBe(4);
    const list = foldRanges(doc).find((r) => r.open === openOf("[\n    1"));
    expect(list?.kind).toBe("array");
    expect(list?.count).toBe(2);
  });

  it("counts an empty container as zero children, not one", () => {
    const ranges = foldRanges('{\n  "a": {\n  }\n}');
    expect(ranges.find((r) => r.openLine === 1)?.count).toBe(0);
  });

  it("ignores brackets inside strings", () => {
    const text = '{\n  "a": "not { a brace"\n}';
    expect(foldRanges(text).map((r) => r.open)).toEqual([0]);
  });

  it("tolerates unbalanced input rather than throwing", () => {
    expect(() => foldRanges('{\n  "a": [\n')).not.toThrow();
    expect(() => foldRanges("}}}")).not.toThrow();
  });

  it("returns ranges in document order", () => {
    const opens = foldRanges(doc).map((r) => r.open);
    expect([...opens].sort((a, b) => a - b)).toEqual(opens);
  });
});

describe("foldedView", () => {
  it("is the document itself when nothing is folded", () => {
    const view = foldedView(doc, new Set());
    expect(view.text).toBe(doc);
    expect(view.folded).toEqual([]);
  });

  it("replaces a range's interior with the placeholder, keeping both brackets", () => {
    const open = openOf("[\n    1");
    const view = foldedView(doc, new Set([open]));
    expect(view.text).toContain(`[${FOLD_PLACEHOLDER}]`);
    expect(view.text).not.toContain("    1,\n    2");
    // Everything outside the fold is untouched.
    expect(view.text).toContain('"version": 3');
  });

  it("keeps the segment map consistent: visible runs map 1:1, the placeholder does not", () => {
    const view = foldedView(doc, new Set([openOf("[\n    1")]));
    let viewAt = 0;
    for (const seg of view.segments) {
      expect(seg.viewStart).toBe(viewAt);
      viewAt = seg.viewEnd;
      if (!seg.hidden) {
        expect(seg.viewEnd - seg.viewStart).toBe(seg.canonicalEnd - seg.canonicalStart);
        expect(view.text.slice(seg.viewStart, seg.viewEnd)).toBe(
          doc.slice(seg.canonicalStart, seg.canonicalEnd),
        );
      }
    }
    expect(viewAt).toBe(view.text.length);
  });

  it("skips a range nested inside one already collapsed", () => {
    // Folding the root hides everything; emitting a second placeholder for an
    // inner range would produce overlapping segments.
    const view = foldedView(doc, new Set([0, openOf("[\n    1")]));
    expect(view.folded.map((r) => r.open)).toEqual([0]);
    expect(view.text).toBe(`{${FOLD_PLACEHOLDER}}`);
  });

  it("ignores an id that no longer names a foldable range", () => {
    const view = foldedView(doc, new Set([9999, openOf('{ "a": 1 }')]));
    expect(view.text).toBe(doc);
  });
});

describe("applyViewEdit", () => {
  it("maps an edit outside any fold straight through", () => {
    const folded = new Set([openOf("[\n    1")]);
    const view = foldedView(doc, folded);
    const next = view.text.replace('"version": 3', '"version": 4');
    const res = applyViewEdit(doc, folded, view.text, next);
    expect(res.text).toBe(doc.replace('"version": 3', '"version": 4'));
    // The fold survives, and its id still names the same bracket.
    expect(res.folded.has(openOf("[\n    1"))).toBe(true);
  });

  it("shifts a fold's id when the edit before it changes the document's length", () => {
    const open = openOf("[\n    1");
    const folded = new Set([open]);
    const view = foldedView(doc, folded);
    // Insert text ahead of the fold.
    const next = view.text.replace('"version": 3', '"version": 30000');
    const res = applyViewEdit(doc, folded, view.text, next);
    const id = [...res.folded][0];
    expect(res.text[id]).toBe("[");
    expect(id).toBe(open + 4);
  });

  it("replaces the whole hidden range when the edit overlaps the placeholder", () => {
    const open = openOf("[\n    1");
    const folded = new Set([open]);
    const view = foldedView(doc, folded);
    const at = view.text.indexOf(FOLD_PLACEHOLDER);
    // Select the placeholder and type over it, as one would across a collapsed
    // region in any editor.
    const next =
      view.text.slice(0, at) + "9" + view.text.slice(at + FOLD_PLACEHOLDER.length);
    const res = applyViewEdit(doc, folded, view.text, next);
    expect(res.text).toContain("[9]");
    expect(res.text).not.toContain("    1,\n    2");
    // And the fold is dropped: it no longer describes anything.
    expect(res.folded.size).toBe(0);
  });

  it("handles a pure insertion at the very end of the view", () => {
    const res = applyViewEdit(doc, new Set(), doc, doc + "\n");
    expect(res.text).toBe(doc + "\n");
  });

  it("handles deleting everything", () => {
    const folded = new Set([0]);
    const view = foldedView(doc, folded);
    const res = applyViewEdit(doc, folded, view.text, "");
    expect(res.text).toBe("");
    expect(res.folded.size).toBe(0);
  });

  it("recovers the right span for an edit inside a repeated run", () => {
    // The naive prefix+suffix scan overlaps here and would report a negative span.
    const text = "aaaa";
    const res = applyViewEdit(text, new Set(), text, "aaa");
    expect(res.text).toBe("aaa");
  });

  it("round-trips: fold, edit through the view, unfold, and nothing else moved", () => {
    const folded = new Set([openOf('{\n    "defaults"')]);
    const view = foldedView(doc, folded);
    const next = view.text.replace('"inline": { "a": 1 }', '"inline": { "a": 2 }');
    const res = applyViewEdit(doc, folded, view.text, next);
    expect(res.text).toBe(doc.replace('"a": 1', '"a": 2'));
    // Unfolding shows the untouched interior.
    expect(foldedView(res.text, new Set()).text).toContain('"max_tokens": 32768');
  });
});

describe("lineStarts", () => {
  it("gives the offset each line begins at, including a trailing newline's line", () => {
    expect(lineStarts("a\nbb\n")).toEqual([0, 2, 5]);
    expect(lineStarts("")).toEqual([0]);
  });
});
