import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Button } from "./button";

// THE `link` VARIANT, and the restructuring it forced.
//
// The state layer and `font-semibold` used to live in the base, which was right while
// every variant was a button-shaped button. `link` is not one, and turning them off from
// the base would have been two utilities of the same property on one element — resolved
// by the order Tailwind EMITS them, not by the order they appear in the class string.
// That is the hazard `resizable-pane.test.ts` records after it shipped a hover preview
// that never appeared, and it is invisible to tsc and to every behavioural test.
//
// So these assert ABSENCE, which is the half that cannot be seen by looking at a button
// that happens to render.

function classOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node).match(/class="([^"]*)"/)?.[1] ?? "";
}

describe("Button", () => {
  describe("the link variant", () => {
    const cls = classOf(<Button variant="link" size="link">Upload</Button>);

    it("carries no state layer, rather than one turned off", () => {
      expect(cls).not.toContain("after:bg-current");
      expect(cls).not.toContain("after:opacity");
    });

    it("is not set in the weight a filled button is", () => {
      expect(cls).not.toContain("font-semibold");
      expect(cls).toContain("font-medium");
    });

    it("draws no border and no fill", () => {
      expect(cls).not.toMatch(/\bborder\b/);
      expect(cls).toContain("bg-transparent");
    });

    // The idiom this is a name for: the sidebar's destination rows and the tasks panel's
    // back control are both `text-fg-muted` going to `text-fg`. The underline arrives on
    // hover, which is the one thing Bootstrap's `btn-link` gets right.
    it("reads quiet and answers the pointer", () => {
      expect(cls).toContain("text-fg-muted");
      expect(cls).toContain("hover:text-fg");
      expect(cls).toContain("hover:underline");
      expect(cls).not.toMatch(/(^|\s)underline(\s|$)/);
    });

    // Lighter type is not a smaller target. 32px is what `sm` gives and what a thumb
    // needs; only the border and the weight went.
    it("keeps a full-size hit target", () => {
      expect(cls).toContain("h-8");
    });
  });

  describe("the button-shaped variants keep what they had", () => {
    for (const variant of ["filled", "outlined", "text", "tonal"] as const) {
      it(`${variant} keeps its state layer and its weight`, () => {
        const cls = classOf(<Button variant={variant}>Save</Button>);
        expect(cls).toContain("after:bg-current");
        expect(cls).toContain("hover:after:opacity-10");
        expect(cls).toContain("font-semibold");
      });
    }
  });

  it("still defaults to a filled button", () => {
    const cls = classOf(<Button>Save</Button>);
    expect(cls).toContain("bg-accent");
    expect(cls).toContain("h-10");
  });
});
