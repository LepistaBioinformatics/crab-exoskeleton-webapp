// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Files, Folders } from "lucide-react";
import ResizablePane, { type RailPanel } from "./resizable-pane";

// FR-4.3, and it is a VERIFICATION rather than a change: with the destinations gone
// from the collapsed sidebar, the rail's icons are the only way left to change section
// while it is collapsed. That load-bearing claim had no test, so the rows could have
// been hidden on the strength of an affordance that did not work.
//
// jsdom because the claim is about a CLICK. A first-paint assertion would only say the
// buttons exist, which is the half that was never in doubt.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(groups: RailPanel[][]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ResizablePane
        ariaLabel="Destinations"
        open={false}
        collapsed
        width={280}
        minWidth={240}
        onExpand={() => {}}
        onResize={() => {}}
        groups={groups}
        peeking={false}
        onPeekChange={() => {}}
      >
        <div>sidebar</div>
      </ResizablePane>,
    );
  });
  return host!;
}

function clickByLabel(el: HTMLElement, label: string) {
  const button = Array.from(el.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label,
  );
  expect(button, `no rail button labelled ${label}`).toBeTruthy();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the collapsed rail", () => {
  it("changes section when an icon is pressed", () => {
    const onProjects = vi.fn();
    const onFiles = vi.fn();
    const el = mount([
      [
        { key: "projects", Icon: Folders, label: "Projects", active: false, onSelect: onProjects },
        { key: "files", Icon: Files, label: "Files", active: false, onSelect: onFiles },
      ],
    ]);

    clickByLabel(el, "Files");
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onProjects).not.toHaveBeenCalled();

    clickByLabel(el, "Projects");
    expect(onProjects).toHaveBeenCalledOnce();
  });

  // Never `disabled`, and never merely decorative: an icon that looks like a way in and
  // swallows its own click is worse than no icon. An entry with nothing behind it is
  // left out of the list upstream instead.
  it("says which section the pane would open on", () => {
    const el = mount([
      [{ key: "files", Icon: Files, label: "Files", active: true, onSelect: () => {} }],
    ]);
    const button = Array.from(el.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Files",
    )!;
    expect(button.getAttribute("aria-current")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});
