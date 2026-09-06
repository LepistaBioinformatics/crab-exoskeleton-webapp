// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// right-rail-discoverability FR-3.1/FR-3.2. Secrets used to be a fixed overlay drawer
// behind its own header icon — the second door that is part of why members could not
// find anything. It is now the fifth section of the same sidebar, reached the same way
// as the other four.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const listSecrets = vi.fn();
const listWorkspaceMedia = vi.fn();

vi.mock("@/lib/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/secrets")>();
  return { ...actual, listSecrets: (...args: unknown[]) => listSecrets(...args) };
});

vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, listWorkspaceMedia: (...args: unknown[]) => listWorkspaceMedia(...args) };
});

const listUserModels = vi.fn();
vi.mock("@/lib/userModels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/userModels")>();
  return { ...actual, listUserModels: (...args: unknown[]) => listUserModels(...args) };
});

const UploadsSidebar = (await import("./uploads-sidebar")).default;
const { chatCopy } = await import("@/lib/i18n/chat");
import type { Workspace } from "./fragment";

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
  listSecrets.mockReset();
  listWorkspaceMedia.mockReset();
  listUserModels.mockReset();
});

async function mount(section: "secrets" | null) {
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
        section={section}
      />,
    );
  });
  return host;
}

describe("secrets as a section", () => {
  it("renders inside the sidebar when the section is opened", async () => {
    listSecrets.mockResolvedValue({ dotenv: ["OPENAI_API_KEY"], json: [], file: [], native: [] });
    listWorkspaceMedia.mockResolvedValue([]);
    listUserModels.mockResolvedValue({ models: [], selected: null, organisation: null });

    const host = await mount("secrets");

    // The pane's own copy, not the drawer's chrome: the fixed panel and its backdrop
    // are gone.
    expect(host.textContent).toContain(t.secrets.savedForYou);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(listSecrets).toHaveBeenCalledTimes(1);
  });

  it("is listed by the sidebar's own menu, like every other section", async () => {
    listWorkspaceMedia.mockResolvedValue([]);
    const host = await mount(null);
    expect(host.textContent).toContain(t.secrets.title);
    // And it does not load anything until it is opened.
    expect(listSecrets).not.toHaveBeenCalled();
  });
});

// Reported in use: the models group was the only one that opened by itself, and it
// opened FIRST — so the pane a member came to for a key opened on a form about
// models, with the keys pushed below the fold. Nothing decides for the member which
// question they came with, so nothing opens, and the group that is not about secrets
// goes last.
describe("the secrets pane opens quiet", () => {
  it("starts with every group closed", async () => {
    listSecrets.mockResolvedValue({ dotenv: [], json: [], file: [], native: [] });
    listWorkspaceMedia.mockResolvedValue([]);
    listUserModels.mockResolvedValue({ models: [], selected: null, organisation: null });

    const host = await mount("secrets");

    expect(host.querySelectorAll("details[open]")).toHaveLength(0);
  });

  it("puts the models group after the secret sinks", async () => {
    listSecrets.mockResolvedValue({ dotenv: [], json: [], file: [], native: [] });
    listWorkspaceMedia.mockResolvedValue([]);
    listUserModels.mockResolvedValue({ models: [], selected: null, organisation: null });

    const host = await mount("secrets");
    const text = host.textContent ?? "";

    expect(text.indexOf(t.ownModels.heading)).toBeGreaterThan(text.indexOf(t.secrets.formats.dotenv.title));
  });
});
