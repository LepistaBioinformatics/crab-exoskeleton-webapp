// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useEffect, useState } from "react";

import MangroveContent, { isCut, renderKind } from "./mangrove-content";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

type Props = Omit<Parameters<typeof MangroveContent>[0], "open" | "onClose">;

/**
 * Stands in for the card, which is what owns `open` now: it opens the sheet and the
 * sheet is what closes it. A harness that only passed `open` down would leave Escape
 * with nothing to flip, and the exit these tests are about would never start.
 */
function Harness({ open, ...props }: Props & { open: boolean }) {
  const [shown, setShown] = useState(open);
  useEffect(() => setShown(open), [open]);
  return <MangroveContent {...props} open={shown} onClose={() => setShown(false)} />;
}

async function render(props: Props, open = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness {...props} open={open} />);
  });
  return host.innerHTML;
}

async function reopen(props: Props, open: boolean) {
  await act(async () => {
    root!.render(<Harness {...props} open={open} />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

const short = "A short note.";
const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");

describe("choosing a renderer", () => {
  it("treats unlabelled prose as markdown", () => {
    expect(renderKind(undefined, "# Title\n\ntext")).toBe("markdown");
    expect(renderKind("text/markdown", "text")).toBe("markdown");
  });

  // A JSON body run through a markdown renderer loses its indentation and comes
  // out as one grey paragraph -- which reads as damaged content, not as data.
  it("treats structured data as code even when it is labelled as prose", () => {
    expect(renderKind("text/plain", '{"a": 1}')).toBe("code");
    expect(renderKind(undefined, "[1, 2, 3]")).toBe("code");
    expect(renderKind("application/json", "{}")).toBe("code");
    expect(renderKind("application/yaml", "a: 1")).toBe("code");
  });
});

describe("cutting long content", () => {
  // What the CARD asks before making itself clickable. A card that opens a sheet
  // onto exactly what is already on screen is an affordance that lies.
  it("says whether there is anything a sheet would add", () => {
    expect(isCut(short)).toBe(false);
    expect(isCut(long)).toBe(true);
    // Exactly at the cut is not cut: eight lines are all shown.
    expect(isCut(Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n"))).toBe(false);
    expect(isCut(Array.from({ length: 9 }, (_, i) => `line ${i}`).join("\n"))).toBe(true);
  });

  it("shows a short body whole", async () => {
    const html = await render({ content: short, title: "soil-ph" });
    expect(html).toContain("A short note.");
  });

  // The "show more" button is gone -- the whole card is the target now. What has to
  // survive that is the CUT: a list where one item is four screens tall stops being
  // a list, whatever opens it.
  it("cuts a long body in the card, and offers no button of its own", async () => {
    const html = await render({ content: long, title: "soil-ph" });
    expect(html).toContain("line 0");
    expect(html).not.toContain("line 39");
    expect(host!.querySelector("button")).toBeNull();
  });

  it("puts the whole body in the sheet, and names what is being read", async () => {
    const props = { content: long, title: "soil-ph", subtitle: "alice · soil-ph" };
    await render(props);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await reopen(props, true);

    // The sheet portals to <body>, so it is not inside `host`.
    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
    expect(sheet!.textContent).toContain("line 39");
    expect(sheet!.textContent).toContain("soil-ph");
  });

  // THE SHEET LEAVES ON ITS OWN ANIMATION, not on the keypress. Between Escape
  // and `animationend` it is still mounted and playing the exit -- which is the
  // whole point of animating it, and the reason this asserts both halves.
  const LONG = { content: long, title: "soil-ph" };

  async function openSheet() {
    await reopen(LONG, true);
    return document.querySelector('[role="dialog"]') as HTMLElement;
  }

  it("plays the exit before it leaves the tree", async () => {
    await render(LONG);
    const sheet = await openSheet();
    expect(sheet).toBeTruthy();
    expect(sheet.className).toContain("sheet-rise");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    // Still there, now on its way out.
    const leaving = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(leaving).toBeTruthy();
    expect(leaving.className).toContain("sheet-fall");

    await act(async () => {
      leaving.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // Anything inside that animates -- a spinner, a highlighted code block --
  // bubbles its own animationend through the sheet. One of those must not drop
  // it mid-slide.
  it("ignores an animation that finished inside it", async () => {
    await render(LONG);
    await openSheet();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    const leaving = document.querySelector('[role="dialog"]') as HTMLElement;
    const inner = leaving.querySelector("div")!;

    await act(async () => {
      inner.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  // Scroll is locked while the sheet is open, then handed back exactly as it
  // was found -- a sheet that leaves <body> locked breaks the page behind it.
  it("locks and restores page scroll", async () => {
    await render(LONG);
    const before = document.body.style.overflow;

    await openSheet();
    expect(document.body.style.overflow).toBe("hidden");

    // The lock is held for as long as the sheet is on screen, INCLUDING while it
    // leaves -- releasing it at the keypress would let the page jump behind a
    // sheet that is still sliding away.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(document.body.style.overflow).toBe(before);
  });
});
