// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { htmlScriptsEnabled, setHtmlScripts } from "./html-scripts";
import HtmlScriptNotice from "./html-script-notice";
import { chatCopy } from "@/lib/i18n/chat";

// Scripts in an HTML preview: off by default, on only for this browser session, and
// never without the member having read what they are agreeing to.
//
// The assertions that matter here are ABSENCES — `allow-same-origin` never appearing,
// `localStorage` never being written, a throwing storage leaving scripts off. A preview
// that renders is not evidence of any of them.

const t = chatCopy.en;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  document.querySelectorAll("[role=dialog]").forEach((n) => n.remove());
});

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<HtmlScriptNotice />);
  });
  return host!;
}

function click(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button, `no button labelled ${label}`).toBeTruthy();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the session's answer", () => {
  it("is no until it is explicitly yes", () => {
    expect(htmlScriptsEnabled()).toBe(false);
    window.sessionStorage.setItem("crab-html-scripts", "maybe");
    expect(htmlScriptsEnabled()).toBe(false);
  });

  // FR-2.1. `localStorage` would outlive the decision: a member who agreed once, to read
  // one report, would find every HTML file executing months later with nothing on screen
  // saying why.
  it("is written to sessionStorage and never to localStorage", () => {
    setHtmlScripts(true);
    expect(window.sessionStorage.getItem("crab-html-scripts")).toBe("on");
    expect(window.localStorage.length).toBe(0);
  });

  it("is removed rather than set to a falsy string when turned off", () => {
    setHtmlScripts(true);
    setHtmlScripts(false);
    expect(window.sessionStorage.getItem("crab-html-scripts")).toBeNull();
  });

  // FR-2.2. A private window, or blocked site data, throws on access. The preview has to
  // go on rendering — with scripts OFF, because the safe answer is the one a member gets
  // when the question cannot be put at all.
  it("answers no when storage throws, rather than failing", () => {
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(htmlScriptsEnabled()).toBe(false);
  });

  it("does not throw when a write is refused", () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setHtmlScripts(true)).not.toThrow();
  });
});

describe("HtmlScriptNotice", () => {
  it("says scripts are off, and offers to run them", () => {
    const el = mount();
    expect(el.textContent).toContain(t.preview.scriptsOff);
    expect(el.textContent).toContain(t.preview.scriptsEnable);
  });

  // FR-3.1. The switch does not flip on a click.
  it("asks before turning them on, and leaves them off if the member declines", () => {
    mount();
    click(t.preview.scriptsEnable);
    expect(htmlScriptsEnabled()).toBe(false);

    const dialog = document.body.textContent ?? "";
    expect(dialog).toContain(t.preview.scriptsTitle);
    expect(dialog).toContain(t.preview.scriptsRisk);
    expect(dialog).toContain(t.preview.scriptsSafe);
    // DEC-1's cost: session-wide, so the yes covers documents not yet opened.
    expect(dialog).toContain(t.preview.scriptsScope);
  });

  it("turns them on once the member confirms in the dialog", () => {
    mount();
    click(t.preview.scriptsEnable);
    // The dialog's confirm carries the same label; it is the one inside [role=dialog].
    const confirm = Array.from(
      document.querySelectorAll("[role=dialog] button"),
    ).find((b) => b.textContent?.trim() === t.preview.scriptsEnable)!;
    expect(confirm).toBeTruthy();
    act(() => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(htmlScriptsEnabled()).toBe(true);
  });

  // FR-3.3. The member who said yes did it once, possibly three documents ago.
  it("keeps saying so while they are on, with the way off beside it", () => {
    setHtmlScripts(true);
    const el = mount();
    expect(el.textContent).toContain(t.preview.scriptsOn);
    expect(el.textContent).toContain(t.preview.scriptsDisable);
  });

  it("turns them off again without asking", () => {
    setHtmlScripts(true);
    mount();
    click(t.preview.scriptsDisable);
    expect(htmlScriptsEnabled()).toBe(false);
  });
});

// THE ONE COMBINATION THAT IS REFUSED OUTRIGHT. `allow-scripts` beside
// `allow-same-origin` undoes the sandbox entirely — the frame can reach into this origin
// and remove its own `sandbox` attribute — so it must not appear in any reachable state,
// nor be introduced later by someone adding a third value.
describe("the frame's sandbox", () => {
  const source = readFileSync(join(__dirname, "file-preview.tsx"), "utf8");
  // CODE, not prose: the comment above the frame names the forbidden token in the course
  // of explaining why it is forbidden, and asserting the name away would delete the
  // explanation.
  const code = source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("never carries allow-same-origin, in any branch", () => {
    expect(code).not.toContain("allow-same-origin");
  });

  it("offers exactly two values, and the default is the restrictive one", () => {
    expect(source).toContain('sandbox={scripts ? "allow-scripts" : ""}');
  });

  // A frame keeps the sandbox it was created with: changing the attribute on a live
  // frame leaves the already-parsed page as restricted as it was, and the member would
  // read a notice saying scripts are on over a page where they are not.
  it("remounts the frame when the setting changes", () => {
    expect(source).toContain('key={scripts ? "scripts" : "no-scripts"}');
  });
});
