import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import Breadcrumb from "./breadcrumb";
import type { Crumb } from "./crumbs";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

// The suite runs `environment: "node"`, so what a test can hold onto is the first paint:
// which segments are there, which of them are controls, and what a screen reader is told
// about the last one. The rename and the delete are behind a click and are covered by
// the feature's manual verification instead — mounting jsdom for two handlers would buy
// a test of React's click dispatch, not of this bar.
//
// The shape below is `buildCrumbs`' output, built by hand rather than by calling it: what
// is under test is the painting of a crumb list, and `crumbs.test.ts` already owns the
// question of which list gets built.
const PATH: Crumb[] = [
  { key: "workspace", label: "Acme · alpha", go: () => {} },
  { key: "project", label: "Legal", go: () => {} },
  { key: "leaf", label: "Parecer TBDC" },
];

function render(over: { crumbs?: Crumb[]; sessionId?: string | null } = {}) {
  return renderToStaticMarkup(
    <Breadcrumb
      crumbs={over.crumbs ?? PATH}
      sessionId={over.sessionId === undefined ? "s-1" : over.sessionId}
      onChanged={() => {}}
      onDeleted={() => {}}
    />,
  );
}

describe("Breadcrumb", () => {
  it("names every crumb, in order", () => {
    const html = render();
    const at = PATH.map((crumb) => html.indexOf(crumb.label));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("is one named nav over an ordered list", () => {
    const html = render();
    expect(html).toContain(`<nav aria-label="${en.shell.path}"`);
    expect(html).toContain("<ol");
  });

  // The linked segments are controls and the last one is not. `crumbs.ts` guarantees the
  // last crumb has no `go`, and this is the assertion that the bar honours it: a segment
  // painted as a button for the place you are already standing looks like it goes
  // somewhere and does nothing.
  it("makes a crumb with `go` a button", () => {
    const html = render();
    for (const crumb of PATH.filter((c) => c.go)) {
      const label = html.indexOf(crumb.label);
      const open = html.lastIndexOf("<li", label);
      expect(html.slice(open, label)).toContain("<button");
    }
  });

  it("leaves the last crumb as plain text", () => {
    const html = render();
    const label = html.indexOf("Parecer TBDC");
    // The chevron is a button too and sits after the list, so the slice is the leaf's
    // own <li> — from its tag to its label — not the markup around it.
    const open = html.lastIndexOf("<li", label);
    expect(html.slice(open, label)).not.toContain("<button");
  });

  it("marks the last crumb as the current location", () => {
    const html = render();
    expect(html.split('aria-current="page"').length - 1).toBe(1);
    const marked = html.indexOf('aria-current="page"');
    const label = html.indexOf("Parecer TBDC");
    expect(marked).toBeLessThan(label);
    expect(html.slice(marked, label)).not.toContain("<li");
  });

  // The separator is decoration over a list that already says the segments are a
  // sequence. Read out, it is a third "slash" between the names.
  it("hides the separators from the accessibility tree", () => {
    const html = render();
    expect(html).toContain("/</span>");
    const slash = html.indexOf("/</span>");
    expect(html.lastIndexOf("<span", slash)).toBeGreaterThan(html.indexOf("<ol"));
    expect(html.slice(html.lastIndexOf("<span", slash), slash)).toContain("aria-hidden");
  });

  it("offers the conversation's actions when the leaf names one", () => {
    const html = render();
    expect(html).toContain(`aria-label="${en.shell.crumbActions}"`);
    expect(html).toContain('aria-haspopup="menu"');
  });

  // A destination leaf (Files, Projects…) and a workspace with nothing open are the same
  // case: the menu renames and deletes a conversation, so with no conversation there is
  // nothing for it to act on and a chevron would open an empty promise.
  it("has no chevron when the leaf is not a conversation", () => {
    const html = render({ sessionId: null });
    expect(html).not.toContain(`aria-label="${en.shell.crumbActions}"`);
    expect(html).not.toContain('aria-haspopup="menu"');
  });

  // THE DEFECT THE MEMBER REPORTED, and the reason the guard moved off `sessionId`.
  //
  // `createConversation` mints an id and persists nothing, so a conversation nobody has
  // written in yet is absent from the list, has no title, and produces no leaf. A
  // sessionId therefore exists while the last crumb is the AGENT — and the bar offered
  // to rename and delete it.
  it("offers no actions when the last crumb is the agent, even with a conversation open", () => {
    const html = render({
      crumbs: [{ key: "workspace", label: "Acme · alpha", go: () => {} }],
      sessionId: "s-1",
    });
    expect(html).not.toContain(`aria-label="${en.shell.crumbActions}"`);
    expect(html).not.toContain('aria-haspopup="menu"');
  });

  // The same rule from the other direction: on the projects list the path ends at the
  // project, which is a place and not a conversation.
  it("offers no actions when the last crumb is a project", () => {
    const html = render({
      crumbs: [
        { key: "workspace", label: "Acme · alpha", go: () => {} },
        { key: "projects", label: en.projects.title, go: () => {} },
        { key: "project", label: "Legal" },
      ],
      sessionId: "s-1",
    });
    expect(html).not.toContain(`aria-label="${en.shell.crumbActions}"`);
  });

  // The menu is portalled to <body>, which does not exist in this environment. It stays
  // behind its own open state, and this is what says so: a first paint that reached the
  // portal would throw rather than fail.
  it("paints no menu until the chevron is pressed", () => {
    const html = render();
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain(en.history.rename);
  });

  // No workspace means the agent grid, which names itself.
  it("renders nothing with no crumbs", () => {
    expect(render({ crumbs: [], sessionId: null })).toBe("");
  });

  it("keeps the trailing segments on a phone and elides the rest", () => {
    const html = render();
    expect(html).toContain("…");
    const leading = html.indexOf("Acme · alpha");
    const leadingLi = html.lastIndexOf("<li", leading);
    expect(html.slice(leadingLi, leading)).toContain("hidden md:flex");
    for (const label of ["Legal", "Parecer TBDC"]) {
      const at = html.indexOf(label);
      expect(html.slice(html.lastIndexOf("<li", at), at)).not.toContain("hidden md:flex");
    }
  });

  it("shows nothing elided when every segment fits", () => {
    const short: Crumb[] = [PATH[0], { key: "leaf", label: "Parecer TBDC" }];
    const html = render({ crumbs: short });
    expect(html).not.toContain("…");
    const leading = html.indexOf("Acme · alpha");
    expect(html.slice(html.lastIndexOf("<li", leading), leading)).not.toContain("hidden md:flex");
  });

  it("truncates a long label rather than widening the row", () => {
    const long: Crumb[] = [
      PATH[0],
      { key: "leaf", label: "A conversation title long enough to push a column wider" },
    ];
    const html = render({ crumbs: long });
    const at = html.indexOf("A conversation title");
    expect(html.slice(html.lastIndexOf("<span", at), at)).toContain("truncate");
  });
});
