import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// The conversation list sends an unauthenticated caller to /signin. There is no app
// router in this environment, and mounting one would be scaffolding for a first-paint
// assertion — the redirect lives in an effect that never fires here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import UnifiedSidebar from "./unified-sidebar";
import { DESTINATION_ROWS } from "./sidebar-destinations";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace: Workspace = { t: "acme", s: "growth", r: "alpha" };

// The suite runs `environment: "node"`, so effects never fire and no fetch resolves:
// what these assert is the FIRST PAINT. Which row is marked, and what the column holds
// before any data arrives. The derivation is covered without React at all by
// destination.test.ts, and the rows themselves by sidebar-destinations.test.tsx.
function render(over: Partial<Parameters<typeof UnifiedSidebar>[0]> = {}) {
  return renderToStaticMarkup(
    <UnifiedSidebar
      email="member@example.com"
      workspace={workspace}
      project={null}
      projectsOpen={false}
      openSection={null}
      onProjects={() => {}}
      onSection={() => {}}
      onNewChat={() => {}}
      {...over}
    />,
  );
}

describe("UnifiedSidebar", () => {
  // THE TRACK IS GONE. It held two panels at twice the pane's width and translated
  // between them; the first of its two questions — which agent — is answered on the
  // agent grid now. This is the assertion that says so, because a track reintroduced by
  // accident would still render something plausible.
  it("is one column, with no sliding track", () => {
    expect(render()).not.toContain("w-[200%]");
  });

  it("offers every row and the new-chat action", () => {
    const html = render();
    expect(html).toContain(t.history.newChat);
    expect(html.split("<li>").length - 1).toBeGreaterThanOrEqual(
      DESTINATION_ROWS.length,
    );
  });

  // The two kinds of current, threaded through the column the shell actually renders.
  // `page` is where the member IS; `true` is what is open beside them, and both holding
  // at once is the coexistence the pane was restored for.
  it("marks the projects row as the page and an open section only as current", () => {
    expect(render({ projectsOpen: true })).toContain('aria-current="page"');
    expect(render({ openSection: "files" })).toContain('aria-current="true"');
    expect(render({ openSection: "files" })).not.toContain('aria-current="page"');
    expect(render()).not.toContain("aria-current");
  });

  // With no agent chosen the centre pane IS the agent grid, so the sidebar has nothing
  // to offer: every row between the header and the footer is scoped to a workspace, and
  // a list of places you cannot reach is worse than no list.
  it("shows no destinations and no new-chat action before an agent is chosen", () => {
    const html = render({ workspace: null });
    expect(html).not.toContain(t.history.newChat);
    expect(html).not.toContain(t.projects.title);
  });

  it("keeps the account footer, which is on every /chat and /admin view", () => {
    expect(render()).toContain("member@example.com");
  });

  it("offers the desktop collapse control only when the shell passes one", () => {
    expect(render()).not.toContain(t.nav.collapseSidebar);
    expect(render({ onCollapse: () => {} })).toContain(t.nav.collapseSidebar);
  });

  it("says the destination group's name in both locales", () => {
    expect(chatCopy.pt.shell.destinations).toBeTruthy();
    expect(chatCopy.pt.shell.destinations).not.toBe(chatCopy.en.shell.destinations);
  });
});
