// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import MessageContent from "./message-content";

// Does a plain re-render of MessageContent — the kind any parent state change causes — preserve
// the DOM, or replace it?
//
// It matters because replacing it throws away everything the browser keeps ON the node rather
// than in React state: a table's horizontal scroll position, a code block's scroll, focus. All
// three of these failed before the fix, which is how the root cause was confirmed rather than
// argued: clicking a message calls setOpenActions in chat-view, and the inline `components` map
// gave React a new element TYPE per render, so it remounted the whole markdown subtree.
//
// This is the repo's FIRST jsdom test — the suite is `environment: "node"`, where effects never
// fire and there is no DOM. The `@vitest-environment jsdom` docblock above opts this one file in,
// which is the only way to assert node identity at all. jsdom is already a devDependency; nothing
// was added for it. Two stubs are needed (see below) because jsdom implements neither.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // MarkdownTable measures with a ResizeObserver, which jsdom does not implement.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const TABLE_MD = ["| a | b |", "| - | - |", "| 1 | 2 |"].join("\n");
// Deliberately NO language on the fence. With one, CodeBlock's effect dynamically imports a
// highlight.js grammar, and a promise resolving after the jsdom environment is torn down throws
// "window is not defined" — an intermittent failure in a test that is not about highlighting.
// The `pre` wrapper (which carries `overflow-x-auto`, so it holds scroll too) renders either way.
const CODE_MD = ["```", "const x = 1;", "```"].join("\n");

async function mount(content: string): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MessageContent content={content} />);
  });
  return { host, root };
}

describe("MessageContent — re-render must not replace the DOM", () => {
  it("keeps the same <table> node when re-rendered with identical props", async () => {
    const { host, root } = await mount(TABLE_MD);
    const before = host.querySelector("table");
    expect(before, "sanity: a table rendered at all").not.toBeNull();

    // Exactly what a parent state change does — same props, new render.
    await act(async () => {
      root.render(<MessageContent content={TABLE_MD} />);
    });
    const after = host.querySelector("table");

    expect(
      after,
      "a replaced node loses the horizontal scroll the reader had set on it",
    ).toBe(before);
  });

  it("preserves a table's horizontal scroll across a re-render", async () => {
    // The reported symptom, stated directly. jsdom has no layout, so scrollLeft is only
    // writable as a plain property — which is enough to prove node identity is what carries it.
    const { host, root } = await mount(TABLE_MD);
    const wrap = host.querySelector<HTMLElement>("div.overflow-x-auto")!;
    wrap.scrollLeft = 120;

    await act(async () => {
      root.render(<MessageContent content={TABLE_MD} />);
    });

    const after = host.querySelector<HTMLElement>("div.overflow-x-auto")!;
    expect(after.scrollLeft, "scrolled left, clicked, and it snapped back").toBe(120);
  });

  // Guards the MECHANISM, not a behaviour — deliberately, because it is one word to delete and
  // its absence is invisible: with the component identities now stable, dropping the memo costs
  // no correctness, only a full markdown re-parse of every message in the transcript on every
  // click. That is the over-rendering half of the bug, and nothing else here would catch it.
  it("is memoised, so an unrelated parent render does not re-parse the markdown", () => {
    expect(
      (MessageContent as unknown as { $$typeof?: symbol }).$$typeof,
      "MessageContent must stay wrapped in memo()",
    ).toBe(Symbol.for("react.memo"));
  });

  it("keeps the same <pre> node for a code block across a re-render", async () => {
    const { host, root } = await mount(CODE_MD);
    const before = host.querySelector("pre");
    await act(async () => {
      root.render(<MessageContent content={CODE_MD} />);
    });
    expect(host.querySelector("pre")).toBe(before);
  });
});
