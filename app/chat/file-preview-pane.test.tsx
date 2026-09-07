// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// file-preview-in-pane. Reading a file used to mean a modal over the conversation,
// opened from an eye icon that appeared on hover. Now the NAME is the link, and the
// document opens in the panel — so the chat is still there, and still usable, with a
// document open beside it.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const listWorkspaceMedia = vi.fn();
const fetchMediaBlob = vi.fn();
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return {
    ...actual,
    listWorkspaceMedia: (...a: unknown[]) => listWorkspaceMedia(...a),
    fetchMediaBlob: (...a: unknown[]) => fetchMediaBlob(...a),
  };
});

// jsdom's Blob has no `text()`, so the real thing cannot stand in for one here. The
// preview reads a few members off what `fetchMediaBlob` resolves — `size` and
// `text()` — and this is those two.
const blobOf = (body: string) => ({
  size: body.length,
  text: async () => body,
  // `arrayBuffer`, because the text path reads BYTES now: the plain-text fallback opens
  // an unrecognised extension on trust, so the file is sniffed for NUL before it is
  // decoded (preview-plain-text-fallback FR-1).
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

const UploadsSidebar = (await import("./uploads-sidebar")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";

const t = chatCopy.en;
const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;

const LISTING = [
  { path: "public/report.md", name: "report.md", size: 42 },
  { path: "public/run.py", name: "run.py", size: 30 },
];

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
  listWorkspaceMedia.mockReset();
  fetchMediaBlob.mockReset();
});

async function openFiles() {
  listWorkspaceMedia.mockResolvedValue(LISTING);
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
        section="files"
      />,
    );
  });
  return host;
}

function byLabel(host: HTMLElement, label: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element labelled ${label}`);
  return el;
}

describe("opening a document from the files tree", () => {
  // Reported in use: with the name as the control, a member needs to see WHICH names
  // are controls. The readable one is the ordinary foreground; the one that only
  // downloads is dimmed, which is the same signal this interface already uses for
  // "present, but not the thing you act on".
  it("dims the name of a file it cannot show", async () => {
    listWorkspaceMedia.mockResolvedValue([
      ...LISTING,
      { path: "public/bundle.zip", name: "bundle.zip", size: 9 },
    ]);
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
          section="files"
        />,
      );
    });

    const readable = host.querySelector(`[aria-label="${t.preview.action} report.md"]`);
    const plain = [...host.querySelectorAll("span")].find((n) => n.textContent === "bundle.zip");
    expect(readable!.className).toContain("text-fg");
    expect(readable!.className).not.toContain("text-fg-muted");
    expect(plain!.className).toContain("text-fg-muted");
  });

  it("makes the NAME the link, with no eye icon to find first", async () => {
    const host = await openFiles();
    // The eye was a hover-revealed icon at the right edge of the row; the name is
    // what a member reads and points at.
    expect(host.querySelector(`[title="${t.preview.action}"]`)).toBeNull();
    expect(byLabel(host, `${t.preview.action} report.md`).tagName).toBe("BUTTON");
  });

  it("renders the document in the panel, in place of the tree", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("# Q2\n\nrevenue up"));
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} report.md`).click());

    expect(host.textContent).toContain("revenue up");
    // The tree is gone while the document is open: one detail slot, one destination.
    expect(host.textContent).not.toContain("run.py");
    // And no modal was opened over the conversation.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("goes back to the tree before it goes back to the menu", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("# Q2"));
    const host = await openFiles();
    await act(async () => byLabel(host, `${t.preview.action} report.md`).click());

    const back = host.querySelector<HTMLButtonElement>("button");
    // The header's back control is the first button in the panel.
    await act(async () => back!.click());

    expect(host.textContent).toContain("run.py"); // the tree is back
  });

  it("previews a script as code, which used to be download-only", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("import os\nprint(os.getcwd())"));
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} run.py`).click());

    expect(host.textContent).toContain("print(os.getcwd())");
  });

  // preview-line-numbers FR-1. A file is not a fenced block in a message: the line number
  // is how a member says WHERE something is, to a colleague or back to the agent.
  it("numbers the lines of a script", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("import os\nprint(os.getcwd())\n"));
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} run.py`).click());

    // The trailing newline TERMINATES the second line rather than opening a third, so it
    // must not be counted — that is the off-by-one this asserts.
    expect(host.querySelector("pre[aria-hidden]")?.textContent).toBe("1\n2");
  });

  it("counts CRLF lines once, not twice", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("a = 1\r\nb = 2\r\nc = 3\r\n"));
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} run.py`).click());

    expect(host.querySelector("pre[aria-hidden]")?.textContent).toBe("1\n2\n3");
    // And the stray carriage returns do not survive into the body.
    expect(host.textContent).not.toContain("\r");
  });

  // Prose, not structure: a .md has no lines worth pointing at, and numbering it would be
  // noise. Only the `code` kind is numbered.
  it("does not number a markdown document", async () => {
    fetchMediaBlob.mockResolvedValue(blobOf("# Q2\n\nrevenue up"));
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} report.md`).click());

    expect(host.querySelector("pre[aria-hidden]")).toBeNull();
  });

  // preview-plain-text-fallback FR-2. The name said text; the bytes disagreed. That is an
  // answer about the file, so it is a notice rather than a red alert.
  it("says so when a file the name called text turns out to be binary", async () => {
    fetchMediaBlob.mockResolvedValue({
      size: 8,
      text: async () => "",
      arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a, 0x00]).buffer,
    });
    const host = await openFiles();

    await act(async () => byLabel(host, `${t.preview.action} run.py`).click());

    expect(host.textContent).toContain(t.preview.binary);
    // And it is not left spinning, which is what a missing loading guard would do.
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
});
