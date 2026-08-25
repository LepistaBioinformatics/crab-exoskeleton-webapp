// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import Composer from "./composer";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

// paste-and-drop-upload, FR-1/FR-2/FR-3. Two failures this covers that no test of
// the naming helper can:
//
//   - text paste. It is the most common thing that happens to a textarea, and a
//     handler that calls preventDefault unconditionally silently breaks it.
//   - the rename actually reaching uploadMedia. `File.name` is read-only, so a
//     mutation instead of a copy would no-op here and only show up on the server,
//     as one screenshot overwriting another.

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
  onRemoveAttachment: () => {},
  replyTo: null,
  onCancelReply: () => {},
  chatRef: null,
  onCancelChatRef: () => {},
  mentionFiles: [],
};

async function mount(
  onPickFiles: (files: FileList | File[]) => void,
  props: Partial<React.ComponentProps<typeof Composer>> = {},
): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<Composer {...baseProps} onPickFiles={onPickFiles} {...props} />);
  });
  return host;
}

/**
 * jsdom has no constructible ClipboardEvent carrying files, so the payload is
 * defined onto a plain event. React reads `clipboardData` off the native event to
 * build its synthetic one, which is exactly the property being defined.
 */
async function paste(box: HTMLTextAreaElement, files: File[]): Promise<Event> {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { files } });
  await act(async () => {
    box.dispatchEvent(e);
  });
  return e;
}

describe("pasting into the chat box", () => {
  it("uploads a pasted screenshot under a unique name", async () => {
    const picked: Array<FileList | File[]> = [];
    const host = await mount((f) => picked.push(f));
    const box = host.querySelector("textarea")!;

    const event = await paste(box, [new File(["png"], "image.png", { type: "image/png" })]);

    expect(event.defaultPrevented).toBe(true);
    expect(picked).toHaveLength(1);
    const [file] = Array.from(picked[0]);
    expect(file.name).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
    expect(file.name).not.toBe("image.png");
  });

  it("leaves a text paste completely alone", async () => {
    const picked: Array<FileList | File[]> = [];
    const host = await mount((f) => picked.push(f));
    const box = host.querySelector("textarea")!;

    const event = await paste(box, []);

    // Not merely "nothing uploaded": the event must reach the browser's own
    // handler, or the pasted text never lands in the box.
    expect(event.defaultPrevented).toBe(false);
    expect(picked).toHaveLength(0);
  });

  it("renames every file in a multi-file paste", async () => {
    const picked: Array<FileList | File[]> = [];
    const host = await mount((f) => picked.push(f));
    const box = host.querySelector("textarea")!;

    await paste(box, [
      new File(["a"], "image.png", { type: "image/png" }),
      new File(["b"], "reads.fastq", { type: "" }),
    ]);

    const names = Array.from(picked[0]).map((f) => f.name);
    expect(names[0]).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
    expect(names[1]).toMatch(/^pasted-\d{8}-\d{6}\.fastq$/);
  });
});

// chat-attachment-previews FR-10. The row above the input is where someone notices
// they pasted the WRONG screenshot, while there is still time to remove it — which
// only works if the attachment renders as the picture and the remove control survives
// the move to the card's corner. It is also the assertion that fails if `workspace`
// ever stops being threaded into the composer.
describe("the attachment row", () => {
  it("previews an attached image and keeps its remove control", async () => {
    const host = await mount(() => {}, {
      attachments: [{ path: "uploads/photo.png", name: "photo.png", size: 2048 }],
    });

    const preview = host.querySelector("img");
    expect(preview, "an attachment rendered as a name instead of a picture").not.toBeNull();
    expect(preview!.getAttribute("src")).toContain("/api/media/download");

    const remove = host.querySelector(
      `button[aria-label="${chatCopy.en.composer.removeAttachment} photo.png"]`,
    );
    expect(remove, "the remove control did not survive the move to the corner").not.toBeNull();
  });

  // Fixed-width tiles mean enough attachments are wider than the chat column. The row
  // answers sideways: wrapping would grow DOWNWARD and push the input up the screen
  // exactly when someone has a lot to send.
  it("scrolls sideways instead of wrapping", async () => {
    const host = await mount(() => {}, {
      attachments: [
        { path: "uploads/a.png", name: "a.png", size: 1 },
        { path: "uploads/b.png", name: "b.png", size: 1 },
      ],
    });

    const row = host.querySelector("img")!.closest("div")!;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className, "the row still wraps into new lines").not.toContain("flex-wrap");
    // Each tile keeps its width in a scrolling row.
    expect(host.querySelectorAll("img")).toHaveLength(2);
  });
});
