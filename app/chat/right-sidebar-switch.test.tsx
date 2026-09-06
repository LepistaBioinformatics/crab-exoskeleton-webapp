// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// right-rail-discoverability, defect found in use: with the sidebar already open,
// clicking another icon in the rail changed `rs` and nothing moved. The panel read the
// section ONCE, at mount (`useState(initialSection)`), which was invisible while the
// only way to switch was the panel's own menu — the rail is the first control outside
// it that can.
//
// And the width: the panel opened at 280px, which is a column for a file list and not
// enough for the thing a member actually opens it to read.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const listWorkspaceMedia = vi.fn();
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, listWorkspaceMedia: (...args: unknown[]) => listWorkspaceMedia(...args) };
});
// Panes with fetches of their own; not what this file is about.
vi.mock("./memory-editor", () => ({ default: () => null }));
vi.mock("./scheduled-tasks-panel", () => ({ default: () => null }));

const UploadsSidebar = (await import("./uploads-sidebar")).default;
const { defaultPanelWidth, MIN_WIDTH } = await import("./uploads-sidebar");
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";
import type { Section } from "./workspace-sections";

const t = chatCopy.en;
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
  listWorkspaceMedia.mockReset();
  localStorage.clear();
});

async function render(section: Section | null) {
  if (!mounted) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mounted = { host, root: createRoot(host) };
  }
  await act(async () => {
    mounted!.root.render(
      <UploadsSidebar
        workspace={workspace}
        refreshSignal={0}
        onClose={() => {}}
        section={section}
      />,
    );
  });
  return mounted.host;
}

describe("switching sections from outside the panel", () => {
  it("follows the section it is given, not the one it mounted with", async () => {
    listWorkspaceMedia.mockResolvedValue([]);

    const host = await render("files");
    expect(host.textContent).toContain(t.uploads.files);

    // The files pane brings its own refresh control into the panel header.
    expect(host.querySelector(`[aria-label="${t.uploads.refreshAria}"]`)).not.toBeNull();

    await render("memory");
    // The header names the open section, and the files pane's control is gone with
    // it. Asserting on the whole panel's text would prove nothing: BOTH panes stay
    // mounted through the slide, so the menu behind still lists every section by name.
    expect(host.textContent).toContain(t.memory.title);
    expect(host.querySelector(`[aria-label="${t.uploads.refreshAria}"]`)).toBeNull();
  });

  it("goes back to the menu when the section is cleared", async () => {
    listWorkspaceMedia.mockResolvedValue([]);
    const host = await render("tasks");
    await render(null);
    // The menu lists every section, so the workspace heading is back.
    expect(host.textContent).toContain(t.uploads.workspace);
  });
});

// A third of the viewport, because what members open the panel FOR — a document, the
// graph, a memory note — is unreadable in a 280px column. Bounded on both sides: never
// below the minimum a file tree needs, never wider than the viewport allows.
describe("the panel's default width", () => {
  it("is a third of the viewport", () => {
    expect(defaultPanelWidth(1500)).toBe(500);
  });

  it("never goes below the minimum, however narrow the window", () => {
    expect(defaultPanelWidth(600)).toBe(MIN_WIDTH);
  });

  it("never exceeds what the viewport can show", () => {
    // maxWidth() is the viewport minus the handle's reach; a third can only hit it
    // on a window narrow enough that the minimum already applies, so the clamp is
    // asserted through the minimum rather than invented.
    expect(defaultPanelWidth(300)).toBeLessThanOrEqual(300);
  });
});
