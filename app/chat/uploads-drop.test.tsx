// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// paste-and-drop-upload, FR-11 to FR-15. The behaviour under test is the SECOND
// drop path: files from outside the browser, as opposed to a row of this tree
// being moved. They share the highlight and nothing else, and the external one was
// inert before because every handler was gated on an internal drag being in
// progress.
//
// The load-bearing case is a drop onto a FOLDER. An upload cannot express a
// subfolder — the proxy reduces the name to a base name — so landing there is
// upload-then-move, and the order of those two calls is the whole feature.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const uploadMedia = vi.fn();
const moveMedia = vi.fn();
const listWorkspaceMedia = vi.fn();

vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return {
    ...actual,
    uploadMedia: (...args: unknown[]) => uploadMedia(...args),
    moveMedia: (...args: unknown[]) => moveMedia(...args),
    listWorkspaceMedia: (...args: unknown[]) => listWorkspaceMedia(...args),
  };
});

const UploadsSidebar = (await import("./uploads-sidebar")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
const { errorCopy } = await import("@/lib/i18n/errors");
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const err = errorCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

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
  uploadMedia.mockReset();
  moveMedia.mockReset();
  listWorkspaceMedia.mockReset();
});

const LISTING = [
  { path: "uploads/reports", name: "reports", isDir: true },
  { path: "uploads/attachments", name: "attachments", isDir: true },
  { path: "uploads/notes.md", name: "notes.md", size: 12 },
];

async function mount(): Promise<HTMLElement> {
  listWorkspaceMedia.mockResolvedValue(LISTING);
  uploadMedia.mockImplementation(async (_ws: unknown, file: File) => ({
    path: `uploads/${file.name}`,
    name: file.name,
    size: file.size,
  }));
  moveMedia.mockResolvedValue({});

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        initialSection="files"
      />,
    );
  });
  return host;
}

const FILE = new File(["x"], "q1.pdf", { type: "application/pdf" });
const DIR = new File([], "old-reports", { type: "" });

function transfer(files: File[], types = ["Files"]) {
  return { types, files, items: [], dropEffect: "" };
}

/** A drag event of any type, optionally naming where the pointer went next. */
async function dragEvent(
  el: Element,
  type: string,
  dt: unknown,
  relatedTarget: EventTarget | null = null,
) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget });
  Object.defineProperty(e, "dataTransfer", { value: dt });
  await act(async () => {
    el.dispatchEvent(e);
  });
}

async function drop(el: Element, dt: unknown) {
  const e = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: dt });
  await act(async () => {
    el.dispatchEvent(e);
  });
  // Let the upload/move promises settle.
  await act(async () => {});
}

/** The row whose visible label is `name` — folders render their path. */
function folderRow(host: HTMLElement, name: string): Element {
  const label = [...host.querySelectorAll("span")].find((s) => s.textContent === name);
  if (!label) throw new Error(`no row labelled ${name}`);
  const row = label.closest("[draggable]");
  if (!row) throw new Error(`row ${name} has no drop target`);
  return row;
}

const rootZone = (host: HTMLElement) => host.querySelector(".min-h-8")!;

describe("dropping files from outside into the files pane", () => {
  it("uploads onto the root zone, with no move", async () => {
    const host = await mount();

    await drop(rootZone(host), transfer([FILE]));

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(uploadMedia.mock.calls[0][1]).toBe(FILE);
    expect(moveMedia).not.toHaveBeenCalled();
  });

  // The order is the requirement: the file has to EXIST before it can be moved, and
  // an upload has no way to name a destination folder.
  it("uploads then moves when the target is a folder", async () => {
    const host = await mount();

    await drop(folderRow(host, "reports"), transfer([FILE]));

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(moveMedia).toHaveBeenCalledTimes(1);
    expect(moveMedia.mock.calls[0].slice(1)).toEqual(["q1.pdf", "reports/q1.pdf"]);
    expect(uploadMedia.mock.invocationCallOrder[0]).toBeLessThan(
      moveMedia.mock.invocationCallOrder[0],
    );
  });

  // The proxy answers 403 for the system folder. The row has to swallow the drop
  // and say so — letting it fall through would file the drop at the ROOT, which is
  // not what the member aimed at and not something they would be told about.
  it("refuses the agent-deliveries folder out loud", async () => {
    const host = await mount();

    // Shown under its translated label; the path on disk stays `attachments`.
    await drop(folderRow(host, t.uploads.attachmentsFolder), transfer([FILE]));

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(host.textContent).toContain(err.media_reserved);
  });

  it("refuses a dropped folder and says why", async () => {
    const host = await mount();

    await drop(rootZone(host), transfer([DIR, FILE]));

    expect(uploadMedia).toHaveBeenCalledTimes(1); // the real file still goes
    expect(host.textContent).toContain(err.media_directory);
  });

  // A failed move leaves the file at the root rather than losing it, and the pane's
  // own alert carries the reason.
  it("keeps the file when the move fails", async () => {
    const host = await mount();
    // What the BFF actually produces: `moveMedia` throws the CODE the route
    // returned (`mediaError`), never the proxy's prose — a sentence here would
    // fall through `errorText` to "something went wrong", which is the failure
    // this whole mapping exists to prevent.
    moveMedia.mockRejectedValue(new Error("forbidden"));

    await drop(folderRow(host, "reports"), transfer([FILE]));

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(err.forbidden);
  });

  // The internal drag is a MOVE and must be untouched by any of the above.
  it("still moves a row dragged inside the tree", async () => {
    const host = await mount();
    const row = folderRow(host, "notes.md");

    await act(async () => {
      const start = new Event("dragstart", { bubbles: true, cancelable: true });
      Object.defineProperty(start, "dataTransfer", {
        value: { setData: () => {}, effectAllowed: "" },
      });
      row.dispatchEvent(start);
    });
    await drop(folderRow(host, "reports"), transfer([], ["text/plain"]));

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(moveMedia).toHaveBeenCalledTimes(1);
    expect(moveMedia.mock.calls[0].slice(1)).toEqual(["notes.md", "reports/notes.md"]);
  });

  // The reported bug: dragging a file over a folder made the drop box strobe between
  // shown and hidden, fast enough to read as the pane freezing.
  //
  // `dragleave` fires for every CHILD the pointer crosses and bubbles to the row, so
  // moving INSIDE a row cleared the highlight that the next `dragover` restored.
  it("keeps a folder highlighted while the pointer crosses its own children", async () => {
    const host = await mount();
    const row = folderRow(host, "reports");
    const inside = row.querySelector("button")!;

    await dragEvent(row, "dragover", transfer([FILE]));
    expect(row.className).toContain("bg-accent/15");

    // The pointer moved from one child of the row to another — it never left the row.
    await dragEvent(inside, "dragleave", transfer([FILE]), row.querySelector("span"));
    expect(
      row.className,
      "the highlight dropped while the pointer was still over the folder",
    ).toContain("bg-accent/15");
  });

  it("drops the highlight when the pointer really leaves", async () => {
    const host = await mount();
    const row = folderRow(host, "reports");

    await dragEvent(row, "dragover", transfer([FILE]));
    await dragEvent(row, "dragleave", transfer([FILE]), rootZone(host));
    expect(row.className).not.toContain("bg-accent/15");
  });

  // The other half of the same bug, and the half this feature introduced: a hint that
  // takes part in the LAYOUT pushes the rows down as it appears, sliding the row out
  // from under the pointer — which hides the hint, which slides the rows back.
  //
  // jsdom has no layout, so what is asserted is the property that makes the loop
  // impossible: the hint is out of the flow and cannot receive pointer events.
  it("keeps the root hint out of the layout and out of the pointer's way", async () => {
    const host = await mount();
    const zone = rootZone(host);

    await dragEvent(zone, "dragover", transfer([FILE]));
    const hint = [...host.querySelectorAll("p")].find(
      (p) => p.textContent === t.uploads.dropToUpload,
    );

    expect(hint, "the root drop hint never rendered").toBeTruthy();
    expect(hint!.className).toContain("absolute");
    expect(hint!.className).toContain("pointer-events-none");
  });

  // The pane offers two different actions on the same targets, so it has to say
  // which one is on offer — this hint is the only thing distinguishing "this file
  // is about to be uploaded" from "this row is about to be moved".
  it("names the action while an external drag is over the root", async () => {
    const host = await mount();
    const zone = rootZone(host);

    const over = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: transfer([FILE]) });
    await act(async () => {
      zone.dispatchEvent(over);
    });

    expect(host.textContent).toContain(t.uploads.dropToUpload);
  });
});

// The upload toolbar's own picker takes the same path, and it is the surface the
// member named — a files pane whose Upload button refuses what the pane lists.
describe("the pane's upload control", () => {
  it("opens the picker with no filter", async () => {
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.hasAttribute("accept")).toBe(false);
  });
});

it("uses the label the copy defines for the pane", async () => {
  const host = await mount();
  expect(host.textContent).toContain(t.uploads.upload);
});
