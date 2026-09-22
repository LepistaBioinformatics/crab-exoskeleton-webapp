// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import FilesScreen from "./files-screen";
import { takePendingShare } from "./mangrove-share-bus";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;

// "Share this file in the mangrove", and the one rule it has to keep: it is ABSENT where
// there is no mangrove, not present and refusing. A deployment that never enabled the
// feature must not grow a control that teaches its members it exists.
//
// The second thing asserted here is the PATH. `deleteMedia` and `downloadMedia` both send
// `path` and not `name`, and the mangrove's `file` field is that same kind of value — the
// leaf is only what the composer shows, and for anything inside a folder the two differ.

const FILE = { path: "reports/q2.pdf", name: "reports/q2.pdf", size: 2048 };
const SHARE_LABEL = `${t.mangrove.shareFile} q2.pdf`;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** The listing always answers; only the mangrove's capabilities differ between cases. */
function stubFetch(mangrove: "on" | "off") {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/mangrove/capabilities")) {
      return mangrove === "on"
        ? new Response(JSON.stringify({ governs: false, tenantLicensed: false }), { status: 200 })
        : // What the BFF answers when the proxy never registered the routes.
          new Response(JSON.stringify({ error: "mangrove_off" }), { status: 404 });
    }
    return new Response(JSON.stringify({ files: [FILE], folders: [] }), { status: 200 });
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  takePendingShare();
  vi.unstubAllGlobals();
});

async function mount(workspace: Workspace = { t: "t1", s: "s1", r: "alpha" }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FilesScreen workspace={workspace} />);
  });
  // The listing and the capabilities resolve on separate microtasks.
  await act(async () => {});
  // The file lives in a folder deliberately -- that is the case where the path and the
  // display name differ -- and folders start closed, so it has to be opened.
  const folder = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "reports",
  )!;
  await act(async () => {
    folder.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return host;
}

describe("sharing a file in the mangrove", () => {
  it("is absent where the mangrove is switched off", async () => {
    stubFetch("off");
    const el = await mount();
    // The row is there -- it is the SHARE control that is not.
    expect(el.querySelector(`[aria-label="${t.attachment.download} q2.pdf"]`)).not.toBeNull();
    expect(el.querySelector(`[aria-label="${SHARE_LABEL}"]`)).toBeNull();
  });

  // A project's files are a project's. Publishing carries the project so the
  // proxy resolves the path against THAT workspace -- without it the same path
  // would name a file in the main workspace, which is a 404 at best and silently
  // the wrong file of the same name at worst.
  it("is present inside a project too", async () => {
    stubFetch("on");
    const el = await mount({ t: "t1", s: "s1", r: "alpha", p: "proj-1" });
    expect(el.querySelector(`[aria-label="${SHARE_LABEL}"]`)).not.toBeNull();
  });

  it("is there where the mangrove is on, and shares the PATH", async () => {
    stubFetch("on");
    const el = await mount();
    const share = el.querySelector(`[aria-label="${SHARE_LABEL}"]`)!;
    expect(share).not.toBeNull();

    await act(async () => {
      share.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(takePendingShare()).toEqual({
      kind: "file",
      path: "reports/q2.pdf",
      name: "q2.pdf",
    });
  });
});
