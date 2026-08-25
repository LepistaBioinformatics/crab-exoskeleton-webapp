// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useFileDrop, type DroppedFiles } from "./use-file-drop";

// paste-and-drop-upload, FR-6 to FR-9 and FR-15. Three of these are invisible to
// any test of the pure helpers:
//
//   - the depth counter. dragenter/dragleave fire per CHILD, so a boolean flickers
//     the overlay across the message list while the pointer is still inside.
//   - the window guard. Without it a file dropped anywhere else navigates the tab
//     to that file and the member's draft is gone — the reason the gesture was
//     destructive rather than merely absent.
//   - the internal-drag gate. The files sidebar's own rows put `text/plain` on the
//     transfer, and lighting up for one promises an upload that never comes.

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

function Zone({ onDropped, disabled }: { onDropped: (d: DroppedFiles) => void; disabled?: boolean }) {
  const drop = useFileDrop(onDropped, disabled);
  return (
    <div data-testid="zone" {...drop.dropProps}>
      {drop.over && <span data-testid="overlay" />}
      <span data-testid="child" />
    </div>
  );
}

async function mount(onDropped: (d: DroppedFiles) => void, disabled = false): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<Zone onDropped={onDropped} disabled={disabled} />);
  });
  return host;
}

const FILE = new File(["x"], "q1.pdf", { type: "application/pdf" });
const DIR = new File([], "reports", { type: "" });

function transfer(files: File[], types = ["Files"]) {
  return { types, files, items: [], dropEffect: "" };
}

async function fire(el: Element, type: string, dt: unknown): Promise<Event> {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: dt });
  await act(async () => {
    el.dispatchEvent(e);
  });
  return e;
}

const overlay = (host: HTMLElement) => host.querySelector('[data-testid="overlay"]');

describe("the chat drop zone", () => {
  it("shows the overlay while files are held over it", async () => {
    const host = await mount(() => {});
    const zone = host.querySelector('[data-testid="zone"]')!;

    await fire(zone, "dragenter", transfer([FILE]));
    expect(overlay(host)).not.toBeNull();
  });

  // The flicker case: entering a child fires dragenter on the child and dragleave
  // on the parent, in that order. A boolean would blink the overlay off.
  it("stays visible while the pointer crosses children", async () => {
    const host = await mount(() => {});
    const zone = host.querySelector('[data-testid="zone"]')!;
    const child = host.querySelector('[data-testid="child"]')!;

    await fire(zone, "dragenter", transfer([FILE]));
    await fire(child, "dragenter", transfer([FILE]));
    await fire(zone, "dragleave", transfer([FILE]));
    expect(overlay(host)).not.toBeNull();

    await fire(zone, "dragleave", transfer([FILE]));
    expect(overlay(host)).toBeNull();
  });

  it("ignores the sidebar's own row drag", async () => {
    const dropped: DroppedFiles[] = [];
    const host = await mount((d) => dropped.push(d));
    const zone = host.querySelector('[data-testid="zone"]')!;

    await fire(zone, "dragenter", transfer([], ["text/plain"]));
    expect(overlay(host)).toBeNull();

    // The event IS prevented — but by the window guard it bubbles into, not by the
    // zone. That is the intended division: the zone declines to handle it, and the
    // guard still keeps the browser from navigating away from the conversation.
    await fire(zone, "drop", transfer([], ["text/plain"]));
    expect(dropped).toHaveLength(0);
  });

  it("hands the dropped files over and hides the overlay", async () => {
    const dropped: DroppedFiles[] = [];
    const host = await mount((d) => dropped.push(d));
    const zone = host.querySelector('[data-testid="zone"]')!;

    await fire(zone, "dragenter", transfer([FILE]));
    await fire(zone, "drop", transfer([FILE]));

    expect(dropped).toEqual([{ files: [FILE], directories: [] }]);
    expect(overlay(host)).toBeNull();
  });

  // A dropped folder is a zero-byte entry with no type. Uploading it would create a
  // nonsense file wearing the folder's name.
  it("separates folders from files instead of uploading them", async () => {
    const dropped: DroppedFiles[] = [];
    const host = await mount((d) => dropped.push(d));
    const zone = host.querySelector('[data-testid="zone"]')!;

    await fire(zone, "drop", transfer([DIR, FILE]));

    expect(dropped).toEqual([{ files: [FILE], directories: ["reports"] }]);
  });

  it("is inert while disabled", async () => {
    const dropped: DroppedFiles[] = [];
    const host = await mount((d) => dropped.push(d), true);
    const zone = host.querySelector('[data-testid="zone"]')!;

    await fire(zone, "dragenter", transfer([FILE]));
    expect(overlay(host)).toBeNull();
    await fire(zone, "drop", transfer([FILE]));
    expect(dropped).toHaveLength(0);
  });

  // The draft-saving guard: a drop that misses every zone must be swallowed, or the
  // browser navigates to the file and the conversation is gone.
  it("prevents the browser from navigating to a file dropped elsewhere", async () => {
    await mount(() => {});

    const e = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", { value: transfer([FILE]) });
    await act(async () => {
      document.body.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
  });

  it("removes the guard once no zone is mounted", async () => {
    await mount(() => {});
    const { host, root } = mounted!;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;

    const e = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", { value: transfer([FILE]) });
    await act(async () => {
      document.body.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(false);
  });
});
