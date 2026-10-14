// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import MarkdownField from "./markdown-field";

// The editor's one promise: markdown in, rendered while it is edited. The round trip
// back out is milkdown's (remark's) and is not re-tested here.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount(value: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MarkdownField value={value} onChange={vi.fn()} ariaLabel="Body" />);
  });
  // The editor is created asynchronously after mount.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  return host;
}

describe("MarkdownField", () => {
  it("renders headings and emphasis instead of showing the markup", async () => {
    const el = await mount("## Soil\n\npH is **6.4**");
    expect(el.querySelector(".ProseMirror h2")?.textContent).toBe("Soil");
    expect(el.querySelector(".ProseMirror strong")?.textContent).toBe("6.4");
    expect(el.textContent).not.toContain("**");
  });

  it("labels the editable surface itself", async () => {
    const el = await mount("");
    const surface = el.querySelector(".ProseMirror")!;
    expect(surface.getAttribute("aria-label")).toBe("Body");
    expect(surface.getAttribute("role")).toBe("textbox");
  });
});
