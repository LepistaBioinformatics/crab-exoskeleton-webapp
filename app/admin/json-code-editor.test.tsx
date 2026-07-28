import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import JsonCodeEditor from "./json-code-editor";
import { foldRanges, FOLD_PLACEHOLDER } from "./json-folds";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.instanceConfig;

// The editor has no portal and no effects that matter to the first paint, so it
// renders in this suite's `environment: "node"`. What that covers is the painted
// layer, the gutter, and the metric agreement between the two text layers — which
// is exactly what breaks silently if it breaks at all.
const doc = `{
  "version": 3,
  "agents": {
    "defaults": {
      "model_name": "main"
    }
  },
  "flag": true,
  "nothing": null
}`;

function render(folded: Set<number> = new Set()) {
  return renderToStaticMarkup(
    <JsonCodeEditor
      text={doc}
      folded={folded}
      onChange={() => {}}
      onFoldedChange={() => {}}
      ariaLabel="Raw JSON"
    />,
  );
}

describe("JsonCodeEditor", () => {
  it("colours keys, strings, numbers and keywords differently", () => {
    const html = render();
    for (const cls of [
      "text-syntax-name",
      "text-syntax-string",
      "text-syntax-number",
      "text-syntax-keyword",
      "text-syntax-punct",
    ]) {
      expect(html).toContain(cls);
    }
  });

  // The overlay only works while both layers resolve to identical metrics, and
  // wrapping is the one that silently desynchronises the gutter: a wrapped line is
  // two rows of text and one row of line number.
  it("gives both text layers the same metrics and never wraps", () => {
    const html = render();
    const layers = html.match(/font-mono text-xs leading-5 whitespace-pre/g) ?? [];
    expect(layers.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('wrap="off"');
    expect(html).not.toContain("whitespace-pre-wrap");
  });

  it("keeps the textarea as the real editor: transparent text, visible caret", () => {
    const html = render();
    expect(html).toContain("text-transparent");
    expect(html).toContain("caret-fg");
    // The painted layer must not intercept the pointer, or selecting text with the
    // mouse would hit the paint instead of the textarea.
    expect(html).toContain("pointer-events-none");
  });

  it("does not announce the document twice to a screen reader", () => {
    // The painted layer duplicates the textarea's value verbatim.
    expect(render()).toContain('aria-hidden="true"');
  });

  it("numbers every line", () => {
    const html = render();
    const lines = doc.split("\n").length;
    for (const n of [1, 2, lines]) {
      expect(html).toContain(`>${n}</span>`);
    }
  });

  it("offers a fold arrow only on a line that opens a multi-line bracket", () => {
    const html = render();
    const arrows = html.match(/aria-expanded="true"/g) ?? [];
    // Root, "agents", "defaults" — and not the single-line entries.
    expect(arrows.length).toBe(foldRanges(doc).length);
    expect(arrows.length).toBe(3);
  });

  it("shows the placeholder and a reopen arrow for a collapsed range", () => {
    const open = doc.indexOf('{\n    "defaults"');
    const html = render(new Set([open]));
    expect(html).toContain(FOLD_PLACEHOLDER.trim());
    // The interior is gone from the painted layer and from the textarea's value.
    expect(html).not.toContain("model_name");
    expect(html).toContain('aria-expanded="false"');
  });

  it("labels a fold arrow with the line it acts on", () => {
    // "Collapse line 3" — the row is what an admin is pointing at, and the arrows
    // are otherwise indistinguishable to a screen reader.
    expect(render()).toContain(`${t.collapse} ${t.lineLabel} 1`);
  });

  it("marks invalid text instead of colouring it as a value", () => {
    const html = renderToStaticMarkup(
      <JsonCodeEditor
        text='{"a": oops}'
        folded={new Set()}
        onChange={() => {}}
        onFoldedChange={() => {}}
        ariaLabel="Raw JSON"
      />,
    );
    expect(html).toContain("decoration-wavy");
  });
});
