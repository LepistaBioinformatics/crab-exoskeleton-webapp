// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SectionMenu from "./section-menu";
import { chatCopy } from "@/lib/i18n/chat";

// right-rail-discoverability FR-4. On a phone the rail is not the answer — it would
// eat a tenth of the width, and there is no hover to read an icon with. The header
// control the member already has becomes an expander, and the entries carry LABELS,
// which is the half of DEC-2 that touch cannot do without.

const t = chatCopy.en;

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

async function mount(onSelect = vi.fn(), open: string | null = null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { host, root };
  await act(async () => {
    root.render(<SectionMenu open={open} onSelect={onSelect} />);
  });
  return { host, onSelect };
}

function trigger(host: HTMLElement): HTMLButtonElement {
  const el = host.querySelector("button");
  if (!el) throw new Error("no trigger");
  return el as HTMLButtonElement;
}

function entry(label: string): HTMLButtonElement {
  const el = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!el) throw new Error(`no entry labelled ${label}`);
  return el as HTMLButtonElement;
}

describe("the mobile section menu", () => {
  it("shows nothing until it is asked", async () => {
    const { host } = await mount();
    expect(document.body.textContent).not.toContain(t.memory.title);
    expect(trigger(host)).toBeTruthy();
  });

  it("lists every section WITH its label", async () => {
    const { host } = await mount();
    await act(async () => trigger(host).click());
    for (const label of [
      t.memory.title,
      t.memoryGraph.title,
      t.scheduledTasks.title,
      t.uploads.files,
      t.secrets.title,
    ]) {
      expect(entry(label)).toBeTruthy();
    }
  });

  it("opens the chosen section and closes itself", async () => {
    const { host, onSelect } = await mount();
    await act(async () => trigger(host).click());
    await act(async () => entry(t.uploads.files).click());
    expect(onSelect).toHaveBeenCalledWith("files");
    expect(document.body.textContent).not.toContain(t.memoryGraph.title);
  });

  it("closes the open section when its entry is chosen again", async () => {
    const { host, onSelect } = await mount(vi.fn(), "files");
    await act(async () => trigger(host).click());
    await act(async () => entry(t.uploads.files).click());
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("closes on Escape without choosing anything", async () => {
    const { host, onSelect } = await mount();
    await act(async () => trigger(host).click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.body.textContent).not.toContain(t.memory.title);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
