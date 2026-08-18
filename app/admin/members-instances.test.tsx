// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// jsdom, because an instance row only exists once the workspace feed has resolved, and
// the suite's default `environment: "node"` never fires an effect. The static test in
// members-panel.test.tsx covers what IS synchronous (the tenant-selected branch); this
// covers what is not.
vi.mock("@/lib/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin")>("@/lib/admin");
  return {
    ...actual,
    // One member, workspaces under TWO agents. `role` is the agent key on this feed.
    listSubscriptionUsers: async () => [
      { accId: "u1", role: "beta", email: "person@example.com" },
      { accId: "u1", role: "alpha", email: "person@example.com" },
    ],
    listUserFiles: async () => [],
  };
});
vi.mock("@/lib/invitations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/invitations")>("@/lib/invitations");
  return {
    ...actual,
    // Guested on TWO agents. The panel sits inside one of them, and only that one may show.
    listGuests: async () => ({
      guests: [
        {
          email: "person@example.com",
          guestRole: { record: { id: "r-a", name: "alpha", slug: "alpha", permission: "write" } },
        },
        {
          email: "person@example.com",
          guestRole: { record: { id: "r-b", name: "beta", slug: "beta", permission: "write" } },
        },
      ],
      // Mycelium paginates this; the panel warns when the page did not hold everything.
      truncated: false,
    }),
    listGuestRoles: async () => [],
  };
});

import MembersPanel from "./members-panel";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.members;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountAndExpand() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MembersPanel
        scope={{ kind: "subscription", tenantId: "t1", subsAccId: "s1" }}
        agent="alpha"
        tenantLabel="Acme"
        scopeLabel="Growth"
        onPickSubscription={() => {}}
      />,
    );
  });
  // Only an expanded row shows its instances.
  const toggle = Array.from(host!.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("person@example.com"),
  );
  await act(async () => {
    toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return host!;
}

describe("MembersPanel — instance rows", () => {
  // Listing the other agents' workspaces puts a second agent back on a surface this
  // feature just removed one from. It is worth it -- a broken config.json may be why its
  // member cannot reach anything, and forcing a whole context change to repair one file
  // would be a worse screen -- but no row may be mistakable for "the agent I chose".
  it("marks which row is the context's agent and which is not", async () => {
    const el = await mountAndExpand();
    expect(el.textContent).toContain(t.instanceInContext);
    expect(el.textContent).toContain(t.instanceOtherAgent);
  });

  // The feed happens to list beta first. The context's agent is what the admin came for,
  // and a list that buries it invites clicking the nearest row instead.
  it("puts the context's agent first, whatever order the feed returned", async () => {
    const el = await mountAndExpand();
    // The roster's own <li> wraps these, so it also contains the button's text; the
    // member's address is what tells the outer row from the inner ones.
    const rows = Array.from(el.querySelectorAll("li"))
      .map((li) => li.textContent ?? "")
      .filter((text) => text.includes(t.editConfig) && !text.includes("person@example.com"));
    expect(rows[0]).toContain("alpha");
    expect(rows[0]).toContain(t.instanceInContext);
    expect(rows[1]).toContain("beta");
    expect(rows[1]).toContain(t.instanceOtherAgent);
  });

  // A guest role's name IS the agent key, so this person carries a grant per agent. The
  // panel is inside `alpha`, and reporting on `beta` here is exactly the confusion the
  // whole admin screen was rebuilt around.
  it("badges only the selected agent's grant", async () => {
    const el = await mountAndExpand();
    expect(el.textContent).toContain("alpha (write)");
    expect(el.textContent).not.toContain("beta (write)");
  });

  // Nothing destructive on a collapsed row: it sat one mis-tap from a person's access,
  // beside a chevron whose whole job is to be tapped.
  it("offers no revoke until the row is opened", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => {
      r.render(
        <MembersPanel
          scope={{ kind: "subscription", tenantId: "t1", subsAccId: "s1" }}
          agent="alpha"
          tenantLabel="Acme"
          scopeLabel="Growth"
          onPickSubscription={() => {}}
        />,
      );
    });
    expect(host.textContent).not.toContain(adminCopy.en.roster.revoke);
    await act(async () => r.unmount());
    host.remove();
  });

  it("offers it inside the box, under an access heading", async () => {
    const el = await mountAndExpand();
    expect(el.textContent).toContain(adminCopy.en.roster.accessHeading);
    expect(el.textContent).toContain(adminCopy.en.roster.revoke);
  });

  // It shipped gated on "more than five rows" while the subscriptions this runs against
  // hold three and four people, so the control was never drawn. This is the assertion that
  // would have caught it: the fixture has one member, which is the real scale.
  it("offers the filter whenever anyone is on the roster", async () => {
    const el = await mountAndExpand();
    const filter = el.querySelector<HTMLInputElement>('input[type="search"]');
    expect(filter).not.toBeNull();
    expect(filter!.getAttribute("aria-label")).toBe(adminCopy.en.roster.filterPlaceholder);
  });
});