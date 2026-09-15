// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Files, Folders, MessagesSquare } from "lucide-react";
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

function mount(groups: RailPanel[][], onPeekChange: (peeking: boolean) => void = () => {}) {
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
        onPeekChange={onPeekChange}
      >
        <div data-testid="panel">sidebar</div>
      </ResizablePane>,
    );
  });
  return host!;
}

function button(el: HTMLElement, label: string) {
  const found = Array.from(el.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label,
  );
  expect(found, `no rail button labelled ${label}`).toBeTruthy();
  return found!;
}

function hover(el: HTMLElement, label: string) {
  act(() => {
    button(el, label).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
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

// FR-2. The preview used to open from a hover anywhere on the `<aside>`: reaching for
// Files meant dismissing a conversation list that had appeared over the screen on the way
// past it. It has an entry of its own now, and that entry is the only door.
describe("what opens the collapsed pane's preview", () => {
  const entries: RailPanel[] = [
    {
      key: "conversations",
      Icon: MessagesSquare,
      label: "Conversations",
      active: false,
      peek: true,
      onSelect: () => {},
    },
    {
      key: "files",
      Icon: Files,
      label: "Files",
      blurb: "Uploads and files in this workspace.",
      active: false,
      onSelect: () => {},
    },
  ];

  it("opens it from the conversations entry and from nothing else", () => {
    const onPeekChange = vi.fn();
    const el = mount([entries], onPeekChange);

    hover(el, "Conversations");
    expect(onPeekChange).toHaveBeenLastCalledWith(true);

    hover(el, "Files");
    expect(
      onPeekChange,
      "hovering another entry must take the preview off the tooltip it is about to show",
    ).toHaveBeenLastCalledWith(false);
  });

  it("closes it from the expand control, which stands above the entries", () => {
    const onPeekChange = vi.fn();
    const el = mount([entries], onPeekChange);
    hover(el, "Expand Destinations");
    expect(onPeekChange).toHaveBeenLastCalledWith(false);
  });

  // THE CLAIM THE WHOLE INTERACTION RESTS ON. The preview is painted outside the aside
  // but is a DOM DESCENDANT of it, and `mouseleave` follows the tree rather than the
  // geometry — so travelling from the entry into the panel fires no leave and the panel
  // stays up long enough to click a conversation in it. Moving the handler onto the entry
  // would close it under the pointer.
  it("stays open when the pointer travels into the panel", () => {
    const onPeekChange = vi.fn();
    const el = mount([entries], onPeekChange);

    hover(el, "Conversations");
    onPeekChange.mockClear();

    const panel = el.querySelector("[data-testid=panel]")!;
    act(() => {
      button(el, "Conversations").dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: panel }),
      );
    });
    expect(onPeekChange).not.toHaveBeenCalled();
  });
});

// FR-3. `title` is the browser's: about a second late, unstyleable, and one line — on a
// glyph-only rail that one line has to be the name AND the explanation.
describe("the rail's tooltip", () => {
  const files: RailPanel = {
    key: "files",
    Icon: Files,
    label: "Files",
    blurb: "Uploads and files in this workspace.",
    active: false,
    onSelect: () => {},
  };
  const conversations: RailPanel = {
    key: "conversations",
    Icon: MessagesSquare,
    label: "Conversations",
    active: false,
    peek: true,
    onSelect: () => {},
  };

  it("replaces title rather than joining it", () => {
    const el = mount([[conversations, files]]);
    for (const b of Array.from(el.querySelectorAll("button"))) {
      expect(b.hasAttribute("title"), "title and a tooltip is the same thing twice").toBe(
        false,
      );
    }
  });

  it("says the name and what the entry opens, the second in smaller type", () => {
    const el = mount([[files]]);
    hover(el, "Files");
    expect(el.textContent).toContain("Files");
    expect(el.textContent).toContain("Uploads and files in this workspace.");
    expect(el.innerHTML).toContain("text-xs");
  });

  it("goes away when the pointer leaves the entry", () => {
    const el = mount([[files]]);
    hover(el, "Files");
    act(() => {
      button(el, "Files").dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(el.textContent).not.toContain("Uploads and files in this workspace.");
  });

  // The preview opens at exactly the coordinates the tooltip would, so on hover the two
  // would land on top of each other. Focus is the other half: the preview is a pointer
  // affordance, and a member arriving by Tab would otherwise have a glyph and nothing.
  it("stays out of the preview's way on hover, and appears on focus instead", () => {
    const el = mount([[conversations]]);
    hover(el, "Conversations");
    expect(el.textContent).not.toContain("Conversations");

    act(() => button(el, "Conversations").focus());
    expect(el.textContent).toContain("Conversations");
  });
});
