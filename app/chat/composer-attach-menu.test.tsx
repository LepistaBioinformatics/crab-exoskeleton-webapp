// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import Composer from "./composer";
import type { Workspace } from "./fragment";
import { chatCopy } from "@/lib/i18n/chat";
import { MEDIA_CATEGORIES, acceptFor } from "@/lib/media";

// unrestricted-upload-types, FR-3/FR-4. The `accept` attribute is what the OS
// dialog filters on, so it is the whole mechanism by which a member's file was
// invisible in their own folder — and none of that is observable from a test of
// the category list. It has to be read off the rendered input.
//
// Same idiom (and the same reason) as composer-stop.test.tsx: a control that is
// written but never rendered leaves every other test green.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const t = chatCopy.en;

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
});

const baseProps = {
  onSend: () => true,
  workspace: { t: "acme", s: "growth", r: "alpha" } as Workspace,
  sending: false,
  loadingHistory: false,
  sessionId: "s1",
  attachments: [],
  uploading: false,
  attachError: null,
  onPickFiles: () => {},
  onRemoveAttachment: () => {},
  replyTo: null,
  onCancelReply: () => {},
  chatRef: null,
  onCancelChatRef: () => {},
  mentionFiles: [],
};

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<Composer {...baseProps} />);
  });
  return host;
}

const fileInput = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input[type="file"]')!;

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Opens the attach menu and returns the entry whose label matches. */
async function menuEntry(host: HTMLElement, label: string): Promise<HTMLButtonElement> {
  const attach = host.querySelector<HTMLButtonElement>(`button[aria-label="${t.composer.attach}"]`)!;
  await click(attach);
  const entry = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!entry) throw new Error(`no menu entry labelled ${label}`);
  return entry as HTMLButtonElement;
}

describe("the attach menu's picker filter", () => {
  it("starts with no filter at all", async () => {
    const host = await mount();
    expect(fileInput(host).hasAttribute("accept")).toBe(false);
  });

  it("filters when a category is chosen", async () => {
    const host = await mount();
    const images = MEDIA_CATEGORIES[0];
    await click(await menuEntry(host, images.label));
    expect(fileInput(host).getAttribute("accept")).toBe(acceptFor(images.exts));
  });

  // The whole bug report, in one assertion: a member whose format none of the
  // categories names has to reach a dialog carrying no filter. A stale `accept`
  // left over from a previous choice would hide their file just as effectively as
  // the allowlist did.
  it("clears the filter for 'Any file', even after a category was picked", async () => {
    const host = await mount();
    await click(await menuEntry(host, MEDIA_CATEGORIES[0].label));
    expect(fileInput(host).hasAttribute("accept")).toBe(true);

    await click(await menuEntry(host, t.composer.anyFile));
    expect(fileInput(host).hasAttribute("accept")).toBe(false);
  });
});
