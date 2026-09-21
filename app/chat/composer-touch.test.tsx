// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import Composer from "./composer";
import type { Workspace } from "./fragment";
import { chatCopy } from "@/lib/i18n/chat";

const t = chatCopy.en;

// THE PHONE, which neither of the two behaviours below was written for.
//
// Both are the same mistake from opposite directions: a control that is right
// for a keyboard and a mouse, applied to a device that has neither. The soft
// keyboard is the whole bottom half of the screen, and the return key is the one
// key every other app on the device agrees means "new line".

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { host: HTMLElement; root: Root } | null = null;

afterEach(async () => {
  if (mounted) {
    const { host, root } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
  vi.unstubAllGlobals();
});

/**
 * jsdom implements no `matchMedia` at all, and the composer reads it with `?.`
 * — so an unstubbed test is a FINE pointer, which is the desktop case. A coarse
 * pointer has to be asked for.
 */
function pointer(kind: "coarse" | "fine") {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer: coarse") ? kind === "coarse" : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const baseProps = {
  onSend: () => true,
  workspace: { t: "acme", s: "growth", r: "alpha" } as Workspace,
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
  sending: false,
};

async function mount(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<Composer {...baseProps} {...props} />);
  });
  return host;
}

const textarea = (host: HTMLElement) => host.querySelector("textarea") as HTMLTextAreaElement;

async function type(box: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Presses Enter and reports whether the composer took the key. */
async function pressEnter(box: HTMLTextAreaElement): Promise<boolean> {
  const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => {
    box.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

describe("opening a conversation", () => {
  // The complaint: the keyboard comes up before the member has read a word of
  // the conversation they just opened, over the message they came back for.
  it("does not put the cursor in the field on a touch screen", async () => {
    pointer("coarse");
    const host = await mount();
    expect(document.activeElement).not.toBe(textarea(host));
  });

  // And the reason the focus is there at all: on a desktop the cursor costs
  // nothing and saves a click.
  it("still does on a desktop", async () => {
    pointer("fine");
    const host = await mount();
    expect(document.activeElement).toBe(textarea(host));
  });

  // History still loading means there is nothing to type into yet.
  it("waits for the history either way", async () => {
    pointer("fine");
    const host = await mount({ loadingHistory: true });
    expect(document.activeElement).not.toBe(textarea(host));
  });
});

describe("the return key", () => {
  // THE COMPLAINT. A soft keyboard has no usable Shift+Enter, so "Enter sends"
  // left a phone with no way to write a second paragraph at all.
  it("writes a new line on a touch screen instead of sending", async () => {
    pointer("coarse");
    let sent = 0;
    const host = await mount({
      onSend: () => {
        sent++;
        return true;
      },
    });
    const box = textarea(host);
    await type(box, "first paragraph");

    expect(await pressEnter(box)).toBe(false); // not taken -- the browser inserts \n
    expect(sent).toBe(0);
  });

  it("still sends on a desktop, where Shift+Enter is the way out", async () => {
    pointer("fine");
    let sent = 0;
    const host = await mount({
      onSend: () => {
        sent++;
        return true;
      },
    });
    const box = textarea(host);
    await type(box, "a message");

    expect(await pressEnter(box)).toBe(true);
    expect(sent).toBe(1);
  });

  // The send affordance a phone has always had, and now its only one.
  it("leaves the send button working on a touch screen", async () => {
    pointer("coarse");
    let sent = 0;
    const host = await mount({
      onSend: () => {
        sent++;
        return true;
      },
    });
    await type(textarea(host), "a message");
    const send = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.composer.send}"]`,
    );
    expect(send, "no send button on a touch screen").toBeTruthy();
    await act(async () => send!.click());
    expect(sent).toBe(1);
  });
});
