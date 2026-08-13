// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import Composer from "./composer";
import { chatCopy } from "@/lib/i18n/chat";

// stop-generation, R3.1/R3.5. Two things no unit test of the store can answer:
// whether the control is actually RENDERED, and whether the text it recovers
// reaches the box.
//
// The first is the failure recorded in uploads-sidebar.tsx — a control written
// but never rendered, with every existing test still green. The second is the
// whole point of the feature: picoclaw's abort deletes the member's message, so
// a Stop that does not put it back destroys what they typed.

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

async function mount(props: Partial<React.ComponentProps<typeof Composer>>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<Composer {...baseProps} sending={false} {...props} />);
  });
  return host;
}

const stopButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${t.composer.stop}"]`);
const sendButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${t.composer.send}"]`);
const textarea = (host: HTMLElement) => host.querySelector("textarea") as HTMLTextAreaElement;

/**
 * Type into the controlled textarea.
 *
 * Assigning `.value` and firing `input` is not enough: React tracks the last
 * value it wrote on the node, sees no change, and drops the event — the box
 * would read empty and the assertions below would pass for the wrong reason.
 * Going through the prototype setter is what updates that tracker.
 */
async function type(box: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Composer stop control", () => {
  it("is absent while no turn is running", async () => {
    const host = await mount({ sending: false, onStop: async () => null });
    expect(stopButton(host)).toBeNull();
  });

  it("appears while a turn runs", async () => {
    const host = await mount({ sending: true, onStop: async () => null });
    expect(stopButton(host)).not.toBeNull();
  });

  // Replacing Send would undo a deliberate decision: a member who thinks of a
  // second message while the agent works queues it instead of waiting the turn
  // out, and taking the button away would leave that to the Enter key alone.
  it("does not take the send button's place", async () => {
    const host = await mount({ sending: true, onStop: async () => null });
    expect(sendButton(host)).not.toBeNull();
  });

  it("stays out when there is no stop handler at all", async () => {
    const host = await mount({ sending: true });
    expect(stopButton(host)).toBeNull();
  });

  it("puts the unanswered message back in the box", async () => {
    const host = await mount({ sending: true, onStop: async () => "the long one" });
    await act(async () => stopButton(host)!.click());
    expect(textarea(host).value).toBe("the long one");
  });

  it("keeps a draft typed while the turn ran, ahead of nothing being lost", async () => {
    const host = await mount({ sending: true, onStop: async () => "the long one" });
    await type(textarea(host), "meanwhile");
    await act(async () => stopButton(host)!.click());
    // Restored first, draft after: the stopped message came first in time.
    expect(textarea(host).value).toBe("the long one\n\nmeanwhile");
  });

  it("leaves the box alone when there was nothing to restore", async () => {
    const host = await mount({ sending: true, onStop: async () => null });
    await type(textarea(host), "meanwhile");
    await act(async () => stopButton(host)!.click());
    expect(textarea(host).value).toBe("meanwhile");
  });

  it("cannot be pressed twice while the stop is in flight", async () => {
    let calls = 0;
    const host = await mount({
      sending: true,
      stopping: true,
      onStop: async () => {
        calls++;
        return null;
      },
    });
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.composer.stopping}"]`,
    );
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);
    await act(async () => button!.click());
    expect(calls).toBe(0);
  });
});
