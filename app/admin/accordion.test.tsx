import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Accordion } from "./accordion";

describe("Accordion", () => {
  // The summary is the whole point: a collapsed section that shows only its title
  // makes the admin open every one to find out where they are, which is worse
  // than the flat page it replaced.
  it("renders the title and the current-state summary in the header", () => {
    const html = renderToStaticMarkup(
      <Accordion title="Model inventory" summary="3 in service · 1 retired">
        <p>rows</p>
      </Accordion>,
    );
    expect(html).toContain("Model inventory");
    expect(html).toContain("3 in service · 1 retired");
  });

  it("is closed unless the caller opens it", () => {
    const closed = renderToStaticMarkup(
      <Accordion title="t" summary="s">
        <p>body</p>
      </Accordion>,
    );
    expect(closed).not.toMatch(/<details[^>]*\sopen/);

    const open = renderToStaticMarkup(
      <Accordion title="t" summary="s" defaultOpen>
        <p>body</p>
      </Accordion>,
    );
    expect(open).toMatch(/<details[^>]*\sopen/);
  });

  // The body renders either way — <details> hides it in the browser, so a closed
  // section is still searchable and still reachable by assistive tech.
  it("renders its children and the hint", () => {
    const html = renderToStaticMarkup(
      <Accordion title="t" summary="s" hint="what this section is for">
        <p>body</p>
      </Accordion>,
    );
    expect(html).toContain("body");
    expect(html).toContain("what this section is for");
  });

  it("uses <details>/<summary> so keyboard and screen-reader behaviour is native", () => {
    const html = renderToStaticMarkup(
      <Accordion title="t" summary="s">
        <p>body</p>
      </Accordion>,
    );
    expect(html.startsWith("<details")).toBe(true);
    expect(html).toContain("<summary");
  });
});
