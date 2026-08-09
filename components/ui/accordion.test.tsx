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

  // The bug this guards: the restart section was forced open by remounting it on
  // a `key` that flipped with the policy's validity. Remounting re-applies the
  // initial state in BOTH directions, so stepping from "at a time I pick" back to
  // "immediately" flipped the key back and slammed the section shut under the
  // admin. A controlled `open` cannot do that — it is whatever the caller says.
  it("obeys the caller when driven, ignoring defaultOpen", () => {
    const forcedOpen = renderToStaticMarkup(
      <Accordion title="t" summary="s" open onOpenChange={() => {}}>
        <p>body</p>
      </Accordion>,
    );
    expect(forcedOpen).toMatch(/<details[^>]*\sopen/);

    const forcedShut = renderToStaticMarkup(
      <Accordion title="t" summary="s" defaultOpen open={false} onOpenChange={() => {}}>
        <p>body</p>
      </Accordion>,
    );
    expect(forcedShut).not.toMatch(/<details[^>]*\sopen/);
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

  // The drawer wears the chat sidebar's grammar, not the admin panel's card. The
  // two must stay one component: a second look-alike header written separately
  // is exactly the drift the sidebar's own comment warns about.
  it("renders the sidebar's flat section instead of a card when asked", () => {
    const card = renderToStaticMarkup(
      <Accordion title="Files" summary="2 saved">
        <p>rows</p>
      </Accordion>,
    );
    const section = renderToStaticMarkup(
      <Accordion title="Files" summary="2 saved" variant="section">
        <p>rows</p>
      </Accordion>,
    );

    expect(card).toContain("rounded-xl");
    expect(section).not.toContain("rounded-xl");
    // The uppercase eyebrow is what makes it read as the sidebar's section.
    expect(section).toContain("uppercase");
    // Both keep the summary — the rule that makes an accordion worth having.
    expect(section).toContain("2 saved");
  });
});
