// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import MangroveContent, { renderKind } from "./mangrove-content";
import { chatCopy } from "@/lib/i18n/chat";

const en = chatCopy.en;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(props: Parameters<typeof MangroveContent>[0]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MangroveContent {...props} />);
  });
  return host.innerHTML;
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
  it("shows a short body whole, with no way in", async () => {
    const html = await render({ content: short, title: "soil-ph" });
    expect(html).toContain("A short note.");
    // Nothing to expand, so nothing offering to.
    expect(html).not.toContain(en.mangrove.showMore);
  });

  it("cuts a long body and offers to open it", async () => {
    const html = await render({ content: long, title: "soil-ph" });
    expect(html).toContain("line 0");
    expect(html).toContain(en.mangrove.showMore);
    // The tail is not in the card. A list where one item is four screens tall
    // stops being a list.
    expect(html).not.toContain("line 39");
  });

  it("puts the whole body in the sheet, and names what is being read", async () => {
    await render({ content: long, title: "soil-ph", subtitle: "alice · soil-ph" });

    const button = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(en.mangrove.showMore),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });

    // The sheet portals to <body>, so it is not inside `host`.
    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
    expect(sheet!.textContent).toContain("line 39");
    expect(sheet!.textContent).toContain("soil-ph");
  });

  it("closes on Escape", async () => {
    await render({ content: long, title: "soil-ph" });
    const button = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(en.mangrove.showMore),
    );
    await act(async () => {
      button!.click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // Scroll is locked while the sheet is open, then handed back exactly as it
  // was found -- a sheet that leaves <body> locked breaks the page behind it.
  it("locks and restores page scroll", async () => {
    await render({ content: long, title: "soil-ph" });
    const before = document.body.style.overflow;

    const button = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(en.mangrove.showMore),
    );
    await act(async () => {
      button!.click();
    });
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.body.style.overflow).toBe(before);
  });
});
