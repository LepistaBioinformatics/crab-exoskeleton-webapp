// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// The roles feed is the only thing standing between a first paint and the form: the
// component holds a spinner until it lands. Mocked rather than fetched so the form is
// reachable at all -- the suite has no network and, under the default
// `environment: "node"`, no effects either.
vi.mock("@/lib/invitations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/invitations")>("@/lib/invitations");
  return {
    ...actual,
    // A guest role's NAME is the agent key. Two agents are declared on purpose: the
    // point of this feature is that only ONE of them can be reached from here, and a
    // fixture with a single agent could not tell the difference.
    listGuestRoles: async () => [
      { id: "r-alpha-w", name: "alpha", slug: "alpha", permission: "write" },
      { id: "r-alpha-r", name: "alpha", slug: "alpha", permission: "read" },
      { id: "r-beta-w", name: "beta", slug: "beta", permission: "write" },
    ],
    inviteMember: vi.fn(async () => ({ alreadyInvited: false })),
    revokeMember: vi.fn(async () => {}),
  };
});

import InviteMember from "./invite-member";
import { adminCopy } from "@/lib/i18n/admin";

const t = adminCopy.en.invite;

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

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <InviteMember
        scope={{ kind: "subscription", tenantId: "t1", subsAccId: "s1" }}
        agent="alpha"
        tenantLabel="Acme"
        scopeLabel="Growth"
        onInvited={() => {}}
      />,
    );
  });
  return host!;
}

// A controlled input ignores a plain assignment: React's own value setter has to be
// bypassed for the change event to carry the new value.
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("InviteMember", () => {
  // THE WHOLE POINT. This form used to carry its own agent <select>, three fields deep,
  // while the navigation around it named no agent at all -- and a guest role's name IS
  // the agent key, so that buried control was what decided who got access to what.
  it("offers no agent control: the only select is the access level", async () => {
    const el = await mount();
    const selects = el.querySelectorAll("select");
    expect(selects).toHaveLength(1);
    expect(selects[0].getAttribute("aria-label")).toBe(t.accessAria);
  });

  it("never offers an agent the context did not choose", async () => {
    const el = await mount();
    expect(el.innerHTML).not.toContain("beta");
  });

  it("resolves the level against the context's agent", async () => {
    const el = await mount();
    const options = Array.from(el.querySelectorAll("option")).map((o) => o.value);
    // alpha declares both; beta declares only write, and beta is not addressable here.
    expect(options.sort()).toEqual(["read", "write"]);
  });

  // Inviting reaches a person and was the action reported going to the wrong place. It
  // now says, in words, which tenant and which subscription it lands in -- the two
  // values an admin working from chrome they have stopped seeing cannot check.
  it("confirms before sending, naming tenant, subscription, agent and level", async () => {
    const el = await mount();
    await type(el.querySelector<HTMLInputElement>('input[type="email"]')!, "person@example.com");

    const submit = Array.from(el.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === t.submit,
    );
    expect(submit).toBeTruthy();
    await act(async () => {
      submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // The dialog portals to <body>, so it is not inside the panel's own subtree.
    const dialog = document.body.textContent ?? "";
    expect(dialog).toContain(t.confirmTitle);
    expect(dialog).toContain("person@example.com");
    expect(dialog).toContain("alpha");
    expect(dialog).toContain("Acme");
    expect(dialog).toContain("Growth");
  });

  it("does not send until the confirmation is accepted", async () => {
    const { inviteMember } = await import("@/lib/invitations");
    const el = await mount();
    await type(el.querySelector<HTMLInputElement>('input[type="email"]')!, "person@example.com");
    const submit = Array.from(el.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === t.submit,
    );
    await act(async () => {
      submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  // The form used to carry an Invite/Uninvite switch, which asked the admin to retype an
  // address, an agent and a level the roster row below already knows — while that row
  // carried its own revoke. Two ways to remove access, able to disagree about what.
  it("offers no way to remove access: that lives on the member's own row", async () => {
    const el = await mount();
    // The copy key is gone with the control, so the check is on the rendered surface: no
    // action switch, and exactly one button — the one that invites.
    expect(el.querySelectorAll('[role="group"]')).toHaveLength(0);
    const buttons = Array.from(el.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(buttons).toEqual([t.submit]);
  });
});