import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ONE GROUND UNDER THE WHOLE SHELL.
//
// The sidebar and the pane beside the conversation were each a tonal step above it —
// `--surface` against `--bg` — which is how their boundaries were drawn once the violet
// hairline came out of every header. The owner asked for the three to sit on one colour
// instead. That is a change to what draws each region's edge, not only to a fill, so what
// is pinned here is the PAIR: the shared ground, and the edge each region grew to replace
// the tone it gave up.
//
// Source-based, like `pane-weight.test.ts` beside it and for the same reason: a fill and a
// border are invisible to tsc and to every behavioural test, and this is a claim about
// which of them each surface carries.

const ROOT = join(__dirname, "..", "..");
const src = (path: string) => readFileSync(join(ROOT, path), "utf8");

// The class strings only. Every one of these files explains in prose what it used to
// carry, and prose naming `bg-surface` would pass for the thing itself.
const code = (path: string) =>
  src(path)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");

describe("the shell's ground", () => {
  it("is a hair off white rather than white", () => {
    expect(src("app/globals.css")).toContain("--bg: #fcfcfb");
  });

  // The one thing in light mode still at pure white. It was `--elevated` with every other
  // raised surface, which read as a well pressed into a white page; with the page a step
  // down the relationship inverts, and the field a member writes in is what should be
  // brightest. Dark keeps `--elevated` — a white field there is a lamp.
  it("leaves the composer's field brighter than the page it sits on", () => {
    const css = src("app/globals.css");
    expect(css).toContain("--composer-bg: #ffffff");
    expect(css).toContain("--composer-bg: var(--elevated)");
    expect(code("app/chat/composer.tsx")).toContain("bg-composer-bg");
  });

  it("puts the sidebar on it, at both of the widths that render one", () => {
    const pane = code("app/chat/resizable-pane.tsx");
    expect(pane, "the column itself").toContain("bg-bg");
    // The preview is an OVERLAY at the conversation's own fill, so the tone that said
    // "this is in front" is gone and a shadow over the same ground is a smudge. Its other
    // three sides are the viewport's; the right edge is the only one to draw.
    expect(pane, "and its hover preview, which is the same column overlaid").toContain(
      "md:bg-bg",
    );
    for (const cls of ["md:border-r", "md:border-rule"]) {
      expect(pane, `the preview needs ${cls} once the tone stops drawing its edge`).toContain(
        cls,
      );
    }
    expect(pane).not.toContain("bg-surface");
    expect(code("app/chat/unified-sidebar.tsx")).not.toContain("bg-surface");
  });

  // THE PANE'S OWN GROUND, which is the claim -- not "the file mentions no fill".
  //
  // It was written as `not.toContain("bg-surface")` over the whole file, which held
  // while the only fill in there was the pane's. The heading grew a switcher, and a
  // menu floating OVER the pane is the one thing that does need a step above it: at
  // `bg-bg` it would be a list with no edge, painted on the pane it is covering. Every
  // other popover in this app is `bg-surface`, so that is the convention and not a
  // exception argued for here.
  //
  // So the rule is asserted where it lives: the <aside>'s own class list.
  it("puts the pane beside the conversation on it too", () => {
    const src = code("app/chat/workspace-pane.tsx");
    const aside = /className=\{`\$\{phase\}([^`]*)`\}/.exec(src);
    expect(aside, "the pane's className moved; this test reads it by shape").not.toBeNull();
    expect(aside![1]).not.toContain("bg-surface");
    expect(aside![1], "the pane stopped sitting on the shell's ground").toContain("bg-bg");
  });

  // THE HALF THAT IS NOT OPTIONAL. Level with the conversation, the tone draws nothing —
  // so a pane with no border and no air would have no edge at all. It is a card now.
  it("gives that pane the edge the tone used to draw", () => {
    const pane = code("app/chat/workspace-pane.tsx");
    for (const cls of ["md:rounded-2xl", "md:border", "md:border-rule", "md:my-2", "md:mr-2"]) {
      expect(pane, `${cls} is part of one card, not a separate choice`).toContain(cls);
    }
  });

  // Below `md` the same element is a full-height overlay drawer, and a drawer inset from
  // the edges of the screen is a dialog that forgot to dim what is behind it.
  it("keeps the card off the mobile drawer", () => {
    const pane = code("app/chat/workspace-pane.tsx");
    for (const cls of ["rounded-2xl", "my-2", "mr-2"]) {
      // None of these characters are regex-special, so the class goes in verbatim; the
      // guard that matters is the boundary, which is what keeps `md:rounded-2xl` from
      // matching `rounded-2xl`.
      expect(pane).not.toMatch(new RegExp(`(^|\\s)${cls}(\\s|\`|")`));
    }
  });
});

// The rail is what a member reads while the column is collapsed — which is exactly when
// they cannot open it to check. It listing the same things in a different order from the
// open column is a disagreement only visible to someone who does both.
describe("the collapsed rail's order", () => {
  it("matches the open sidebar's, top to bottom", () => {
    const shell = code("app/chat/chat-shell.tsx");
    const groups = /const railGroups = \[([^\]]+)\]/.exec(shell)?.[1] ?? "";
    // SPREAD, because the destinations are now several groups rather than one: the
    // hairline between screens and tools is what a rail has instead of the two labels
    // the open column carries. Their order within the spread is
    // `railDestinationGroups`', which reads DESTINATION_GROUPS — the same structure the
    // open column renders — so this only has to pin where the block sits.
    expect(groups.replace(/\s+/g, " ").trim()).toBe(
      "railActions, ...railDestinations, railConversations",
    );

    const sidebar = code("app/chat/unified-sidebar.tsx");
    const newChat = sidebar.indexOf("t.history.newChat");
    const destinations = sidebar.indexOf("<SidebarDestinations");
    const history = sidebar.indexOf("<HistorySidebar");
    expect(newChat).toBeGreaterThan(-1);
    expect(newChat).toBeLessThan(destinations);
    expect(destinations).toBeLessThan(history);
  });
});
