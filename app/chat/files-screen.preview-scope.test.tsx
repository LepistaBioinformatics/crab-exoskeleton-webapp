// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import FilesScreen from "./files-screen";
import { requestPreview, takePendingPreview } from "./media-preview-bus";
import { chatCopy } from "@/lib/i18n/chat";
import type { Workspace } from "./fragment";

const t = chatCopy.en;

// A preview needs a file the screen believes exists and an extension it can render.
const FILE = { path: "public/report.md", name: "public/report.md", size: 12 };

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  // The screen lists files and reads a preview body; neither is what these assert, so
  // both answer empty rather than being driven.
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ files: [], folders: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

async function mount(workspace: Workspace, request = true) {
  // Published BEFORE the screen exists, which is the real sequence for the FIRST chip:
  // the pane is shut, clicking a chip opens it, and this component mounts into a request
  // that has already been made. The bus parks it; the screen collects it on arrival.
  if (request) requestPreview(FILE);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FilesScreen workspace={workspace} />);
  });
  return host;
}

async function rerender(workspace: Workspace) {
  await act(async () => {
    root!.render(<FilesScreen workspace={workspace} />);
  });
}

// The preview names the file in its own row; the tree shows the files toolbar. One is
// on screen at a time, so either is a usable signal for which of the two the screen is
// showing.
const showingPreview = () => host!.innerHTML.includes("report.md");
const showingTree = () => host!.innerHTML.includes(t.uploads.newFolder);

const ws = (over: Partial<Workspace>): Workspace =>
  ({ t: "acme", s: "growth", r: "alpha", ...over }) as Workspace;

describe("a preview does not survive a workspace change", () => {
  it("opens on the document it was asked for", async () => {
    await mount(ws({}));
    expect(showingPreview(), "the screen did not open the requested file").toBe(true);
  });

  // THE DEFECT. A preview holds a path, and a path belongs to one workspace
  // directory. Left open across a switch it pointed at a file the new workspace does
  // not have: the pane showed an error and stayed on it, so the way back to the file
  // list was a control the member had to find while looking at a failure.
  for (const [name, next] of [
    ["a different agent", ws({ r: "beta" as Workspace["r"] })],
    ["a different subscription", ws({ s: "research" })],
    ["a different tenant", ws({ t: "other" })],
    // Entering a project selects WHICH directory is listed, so it invalidates a path
    // exactly as switching agents does -- the file listing already treats it that way.
    ["entering a project", ws({ p: "seedtrial" })],
  ] as const) {
    it(`closes on ${name}, landing on the file tree`, async () => {
      await mount(ws({}));
      expect(showingPreview()).toBe(true);

      await rerender(next);

      expect(showingPreview(), "the preview stayed open on a path from the old workspace").toBe(
        false,
      );
      expect(showingTree(), "the screen did not land on the file tree").toBe(true);
    });
  }

  // Leaving a project is the same change in the other direction.
  it("closes on leaving a project", async () => {
    await mount(ws({ p: "seedtrial" }));
    expect(showingPreview()).toBe(true);
    await rerender(ws({}));
    expect(showingPreview()).toBe(false);
    expect(showingTree()).toBe(true);
  });

  // The regression bar: a re-render that does NOT change workspace must not close a
  // document the member is reading.
  it("stays open when nothing about the workspace changed", async () => {
    await mount(ws({}));
    await rerender(ws({}));
    expect(showingPreview(), "an unrelated re-render closed the preview").toBe(true);
  });
});

// THE SECOND CHIP, and the case the pane brought back.
//
// While this screen filled the centre, a chip click always navigated away from the
// transcript the chip was in, so a MOUNT always collected the request. The pane sits
// beside the transcript — which is the whole point of it — so the second chip a member
// clicks writes the `rs` that is already set: no `hashchange`, no remount, and a
// mount-only drain would never run again. The document would stop opening from the
// second click on, and only then.
describe("a chip clicked while the pane is already open", () => {
  it("opens the document without a remount", async () => {
    await mount(ws({}), false);
    expect(showingTree(), "the screen did not start on the file tree").toBe(true);

    await act(async () => {
      requestPreview(FILE);
    });

    expect(showingPreview(), "a request published to the mounted screen was ignored").toBe(
      true,
    );
  });

  // `requestPreview` parks before it fans out, so a delivered request has a copy left
  // behind. Taken here too: left standing it would re-open this document the next time
  // the pane is opened on something else entirely.
  it("consumes the parked copy, so the next open does not re-show it", async () => {
    await mount(ws({}), false);
    await act(async () => {
      requestPreview(FILE);
    });
    expect(showingPreview()).toBe(true);

    expect(takePendingPreview()).toBeNull();
  });
});
