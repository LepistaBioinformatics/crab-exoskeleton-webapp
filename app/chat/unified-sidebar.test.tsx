import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// WorkspaceNav calls useRouter to send an unauthenticated caller to /signin. There is
// no app router in this environment, and mounting one would be scaffolding for a
// first-paint assertion — the redirect itself lives in an effect that never fires
// here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import UnifiedSidebar, { track } from "./unified-sidebar";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

// The suite runs `environment: "node"`, so effects never fire and no fetch resolves:
// what these assert is the FIRST PAINT — which panel the track is translated to, and
// that both panels are in the markup either way. The derivation itself is covered
// exhaustively by sidebar-panel-state.test.ts, which needs no React at all.
function render(over: Partial<Parameters<typeof UnifiedSidebar>[0]> = {}) {
  return renderToStaticMarkup(
    <UnifiedSidebar
      email="member@example.com"
      resolved
      workspace={workspace}
      project={null}
      forceWorkspaces={false}
      browsing={false}
      setBrowsing={() => {}}
      {...over}
    />,
  );
}

// The track is the one element whose class list decides which panel is showing, so
// assertions read it directly rather than searching the whole document — where any
// future utility containing `translate-x-0` in another slot would make an absence
// check quietly meaningless.
function trackClasses(html: string): string {
  const track = /class="([^"]*w-\[200%\][^"]*)"/.exec(html);
  expect(track, "no track element in the markup").not.toBeNull();
  return track![1];
}

describe("UnifiedSidebar", () => {
  // The point of the redesign: one question at a time. Both panels are MOUNTED —
  // animating to an unmounted panel is how a slide lands on a blank column — but the
  // track only ever shows one.
  it("mounts both panels and slides the track to the chats one", () => {
    const html = render();
    expect(trackClasses(html)).toContain("-translate-x-1/2");
    // The workspaces panel is present behind the slide, not conditionally rendered.
    expect(html).toContain(t.shell.workspaces);
    // ...and so is the chats panel's own header, in the other direction.
    expect(html).toContain(t.nav.backToWorkspaces);
  });

  it("rests on the workspaces panel before a workspace is chosen", () => {
    expect(trackClasses(render({ workspace: null }))).toContain("translate-x-0");
  });

  // The canvas already lanes every conversation; switching agent is the only
  // navigation it needs. It PINS the tree rather than hiding a group.
  it("pins the workspaces panel in the canvas view", () => {
    expect(trackClasses(render({ forceWorkspaces: true }))).toContain("translate-x-0");
  });

  // The off-screen panel is MOUNTED, so without `inert` its controls stay tabbable and
  // a keyboard member walks into a list they cannot see. React 19 emits the attribute;
  // this is the assertion that catches it silently going away.
  it("takes the off-screen panel out of the tab order", () => {
    // The ATTRIBUTE, not the substring: `toContain("inert")` would pass on a class name
    // and would not notice React silently dropping the prop on an upgrade. Exactly one
    // slot carries it — the parked one.
    for (const html of [render({ workspace: null }), render()]) {
      expect(html.match(/inert=""/g)).toHaveLength(1);
    }
  });

  // The header of the chats panel is the way back, and its visible text is the agent's
  // name — so the accessible label is the only thing that says where it goes.
  it("labels the way back out of the chats panel", () => {
    expect(render()).toContain(t.nav.backToWorkspaces);
  });

  it("says the same thing in both locales", () => {
    expect(chatCopy.pt.nav.backToWorkspaces).toBeTruthy();
    expect(chatCopy.pt.nav.backToWorkspaces).not.toBe(chatCopy.en.nav.backToWorkspaces);
  });

  // A slide is decoration; landing on the right panel is not. Under reduced motion the
  // transform must apply instantly rather than not at all.
  // The track's transition is ARMED a frame after the fragment resolves, and the suite
  // runs `environment: "node"` where that effect never fires — so the armed markup is
  // unreachable through render(). The variant is asserted directly instead, the same
  // way resizable-pane.test.ts asserts its own.
  describe("the track's transition", () => {
    // The bug: the sidebar mounts before the URL fragment is read, so it starts on the
    // workspaces panel and jumps to chats the moment the hash resolves. With the
    // transition on from the first paint, that jump ANIMATED — every page load replayed
    // the full workspaces→chats slide for a member who had navigated nowhere.
    it("is off before the panel is known, so the first position cannot animate", () => {
      const first = track({ panel: "chats", animate: false });
      expect(first).not.toContain("transition-transform");
      expect(first).toContain("-translate-x-1/2");
    });

    it("is on once armed, so a panel change a member asked for still slides", () => {
      expect(track({ panel: "chats", animate: true })).toContain("transition-transform");
    });

    it("lands instantly under reduced motion", () => {
      expect(track({ panel: "chats", animate: true })).toContain(
        "motion-reduce:transition-none",
      );
    });
  });

  it("keeps the account footer, which is on every /chat and /admin view", () => {
    expect(render()).toContain("member@example.com");
  });

  it("offers the desktop collapse control only when the shell passes one", () => {
    expect(render()).not.toContain(t.nav.collapseWorkspaces);
    expect(render({ onCollapse: () => {} })).toContain(t.nav.collapseWorkspaces);
  });
});
