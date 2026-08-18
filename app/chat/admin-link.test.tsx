// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import AdminLink from "./admin-link";
import { chatCopy } from "@/lib/i18n/chat";

const label = chatCopy.en.adminLink.label;

// jsdom, because the link only exists after two probes have resolved, and the suite's
// default `environment: "node"` never fires an effect.
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

// Each probe answers independently: the point of the component is that either authority
// on its own is enough, so the fixture has to be able to grant one and refuse the other.
function answer({ scopes, canEdit }: { scopes?: unknown; canEdit?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/admin/scopes") {
        if (scopes === undefined) return { ok: false, json: async () => null };
        return { ok: true, json: async () => ({ scopes }) };
      }
      if (url === "/api/branding/can-edit") {
        if (canEdit === undefined) return { ok: false, json: async () => null };
        return { ok: true, json: async () => ({ canEdit }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root!.render(<AdminLink />);
  });
  return host!;
}

describe("AdminLink", () => {
  it("shows for a caller who manages a scope", async () => {
    answer({ scopes: [{ kind: "tenant", tenantId: "t1" }], canEdit: false });
    expect((await render()).textContent).toContain(label);
  });

  // THE REPORTED BUG. Branding is instance-wide and needs no scope, so a staff caller
  // can administer it while managing no tenant -- and this is the only entry to /admin,
  // so hiding the link left them with no way in at all.
  it("shows for a caller who can only edit branding", async () => {
    answer({ scopes: [], canEdit: true });
    expect((await render()).textContent).toContain(label);
  });

  it("stays hidden for a caller with neither authority", async () => {
    answer({ scopes: [], canEdit: false });
    expect((await render()).textContent).not.toContain(label);
  });

  // Fails closed, and independently: one probe failing must not suppress the other's
  // answer, and must not offer a screen the caller may not be able to use.
  it("still shows when the scopes probe fails but branding answers", async () => {
    answer({ canEdit: true });
    expect((await render()).textContent).toContain(label);
  });

  it("still shows when the branding probe fails but scopes answer", async () => {
    answer({ scopes: [{ kind: "tenant", tenantId: "t1" }] });
    expect((await render()).textContent).toContain(label);
  });

  it("stays hidden when both probes fail", async () => {
    answer({});
    expect((await render()).textContent).not.toContain(label);
  });
});
