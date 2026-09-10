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
    // The lifecycle control fetches per row. Stubbed so these tests assert the
    // instance LIST rather than the network noise of a control that happens to
    // live on it.
    readInstanceMode: async () => ({
      effective: "continuous",
      override: "",
      agentDefault: "continuous",
      scaleToZeroAllowed: true,
      fires: true,
    }),
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

// The instance rows, told from the roster's own <li> by the member's address: the outer
// row wraps these and therefore contains the button's text too.
function instanceRows(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll("li"))
    .map((li) => li.textContent ?? "")
    .filter((text) => text.includes(t.editConfig) && !text.includes("person@example.com"));
}

describe("MembersPanel — instance rows", () => {
  // Reported in use: "na aba de membros eu consigo editar configurações de agentes
  // diferente, porém o agente já é selecionado antes de chegar nessa aba".
  //
  // This reverses backoffice-admin-shell FR-6.5/FR-6.5.1, which had every agent's
  // instance listed and merely MARKED as in- or out-of-context so a broken config.json
  // could be repaired without changing context. Marking a row is not the same as it
  // being safe to act on, and the agent is chosen before this tab is ever reached.
  //
  // The feed here returns beta first and the panel sits inside alpha, so a filter that
  // is really a sort would still pass the first assertion. Both are made.
  it("lists the context's agent and no other", async () => {
    const el = await mountAndExpand();
    const rows = instanceRows(el);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("alpha");
  });

  it("does not offer an edit control for another agent's instance", async () => {
    const el = await mountAndExpand();
    expect(instanceRows(el).join("")).not.toContain("beta");
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