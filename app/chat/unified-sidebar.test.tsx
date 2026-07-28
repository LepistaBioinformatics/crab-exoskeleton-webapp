import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// WorkspaceNav calls useRouter to send an unauthenticated caller to /signin. There is
// no app router in this environment, and mounting one would be scaffolding for a
// first-paint assertion — the redirect itself lives in an effect that never fires
// here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import UnifiedSidebar from "./unified-sidebar";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

// The suite runs `environment: "node"`, so effects never fire and no fetch resolves:
// what these assert is the FIRST PAINT — which groups exist and what the pane says
// before any data arrives. The conditional rules (which group renders, the empty
// state) are all decided at that point; the tree's own shape is covered by
// sidebar-tree.test.ts, which needs no DOM at all.
function render(over: Partial<Parameters<typeof UnifiedSidebar>[0]> = {}) {
  return renderToStaticMarkup(
    <UnifiedSidebar
      email="member@example.com"
      workspace={workspace}
      hideConversations={false}
      {...over}
    />,
  );
}

describe("UnifiedSidebar", () => {
  // The headers are uppercased by CSS, so the DOM carries the copy as written — and
  // it IS copy now: both titles used to be the literals "WORKSPACES" and
  // "CONVERSATIONS" hardcoded in JSX, untranslated.
  it("renders one pane holding both groups", () => {
    const html = render();
    expect(html).toContain(t.shell.workspaces);
    expect(html).toContain(t.shell.conversations);
  });

  it("keeps the account footer, which is on every /chat and /admin view", () => {
    const html = render();
    expect(html).toContain("member@example.com");
  });

  // The canvas already lanes every conversation. Listing them beside it is the same
  // information twice, competing for height with the tree.
  it("renders no Conversations group in the canvas view", () => {
    const html = render({ hideConversations: true });
    expect(html).toContain(t.shell.workspaces);
    expect(html).not.toContain(t.shell.conversations);
  });

  // Present with an empty state, not absent: a group that appears once a workspace is
  // picked makes the pane's shape depend on selection, and the first-run member is
  // exactly who needs telling what to do next.
  it("keeps the Conversations group with an empty state before a workspace is picked", () => {
    const html = render({ workspace: null });
    expect(html).toContain(t.shell.conversations);
    expect(html).toContain(t.nav.pickWorkspaceForConversations);
  });

  it("says the same thing in both locales", () => {
    expect(chatCopy.pt.nav.pickWorkspaceForConversations).toBeTruthy();
    expect(chatCopy.pt.nav.pickWorkspaceForConversations).not.toBe(
      chatCopy.en.nav.pickWorkspaceForConversations,
    );
  });

  // Workspaces is capped so it cannot push Conversations off screen; Conversations
  // takes the remainder. Both headers stay visible either way.
  // The cap is asserted as vh rather than %, because that is the part that is
  // load-bearing: a percentage max-height against a flex-sized parent is indefinite
  // and simply ignored, so the tree would push the Conversations header off screen.
  // This asserts the class is the right ONE — that it constrains anything is layout,
  // which a markup test cannot see.
  it("caps the workspaces group in vh and gives the remainder to conversations", () => {
    const html = render();
    expect(html).toContain("max-h-[40vh]");
    expect(html).not.toContain("max-h-[40%]");
    expect(html).toContain("flex-1");
  });

  // A group header's toggle sits in a row beside that group's actions. With `w-full`
  // it took the whole row and pushed the actions past the pane's right edge, where
  // they rendered outside the sidebar altogether — which is how the conversations
  // list/tree switch ended up on the outside.
  it("never gives a group header's toggle w-full, which pushes its actions out", () => {
    expect(render()).not.toContain("flex w-full shrink-0 items-center gap-2 px-3");
  });

  it("offers the desktop collapse control only when the shell passes one", () => {
    expect(render()).not.toContain(t.nav.collapseWorkspaces);
    expect(render({ onCollapse: () => {} })).toContain(t.nav.collapseWorkspaces);
  });
});
