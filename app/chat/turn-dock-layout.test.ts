import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source, not a render: chat-shell pulls in the whole panel tree, and these assertions are
// about WHERE one element sits in it. The precedent is mobile-keyboard-viewport.test.ts,
// which reads the same file for the same reason.
const src = readFileSync(new URL("./chat-shell.tsx", import.meta.url), "utf8");

describe("the dock outlives what it reports on", () => {
  // ChatView is keyed on `${t}|${s}|${r}` and unmounts on a workspace switch. A dock
  // mounted inside it would vanish at the exact moment its whole purpose is to persist —
  // and the turns themselves would keep running, invisibly, which is the bug this feature
  // exists to fix.
  it("mounts TurnDock in the chat column, after the ChatView wrapper", () => {
    const main = src.slice(src.indexOf("<main"), src.indexOf("</main>"));
    expect(main).toContain("<TurnDock");
    expect(main.indexOf("<ChatView")).toBeLessThan(main.indexOf("<TurnDock"));
  });

  // Document order IS the collision fix. The bar is the last child of the column, so it
  // cannot cover the composer that precedes it, and no z-index has to win a race with
  // RestartBanner.
  it("puts the dock last, below the composer that lives inside ChatView", () => {
    const main = src.slice(src.indexOf("<main"), src.indexOf("</main>"));
    const afterDock = main.slice(main.indexOf("<TurnDock"));
    expect(afterDock).not.toContain("<ChatView");
    expect(afterDock).not.toContain("<RestartBanner");
  });

  it("hands the dock the current conversation, so it can exclude it", () => {
    expect(src).toMatch(/<TurnDock[^/]*currentSid=\{sessionId\}/s);
  });

  // One matchMedia listener for the shell, passed down. A second one in the dock would be a
  // second breakpoint to keep in step with this one.
  it("passes the shell's own desktop flag rather than letting the dock measure again", () => {
    expect(src).toMatch(/<TurnDock[^/]*desktop=\{desktop\}/s);
  });
});

// The expanded list opens upward into the band where the composer floats. Document order does
// NOT settle that: the composer carries an explicit z-index and, while the dock carried none,
// `auto` lost and the list rendered behind the message box -- unreachable on a phone, where the
// list is the only way into a conversation.
//
// Asserted ACROSS both files rather than as "the dock contains z-30", so raising the composer's
// layer later fails here too instead of silently re-burying the list.
describe("the expanded list paints above the composer", () => {
  const dockSrc = readFileSync(new URL("./turn-dock.tsx", import.meta.url), "utf8");
  const viewSrc = readFileSync(new URL("./chat-view.tsx", import.meta.url), "utf8");

  const layerOf = (src: string, marker: string) => {
    const line = src.split("\n").find((l) => l.includes(marker));
    const z = line && /\bz-(\d+)\b/.exec(line);
    return z ? Number(z[1]) : null;
  };

  it("puts the dock container on a higher layer than the floating composer", () => {
    const composer = layerOf(viewSrc, "The composer floats") ?? layerOf(viewSrc, "absolute inset-x-0 bottom-0");
    const dock = layerOf(dockSrc, 'role="region"') ?? layerOf(dockSrc, "shrink-0 bg-surface");
    expect(composer).not.toBeNull();
    expect(dock).not.toBeNull();
    expect(dock as number).toBeGreaterThan(composer as number);
  });

  it("anchors the panel above the bar, not below it", () => {
    expect(dockSrc).toContain("bottom-full");
    expect(dockSrc).not.toContain("top-full");
  });
});

// The mobile summary is the only control on that breakpoint's bar: if it is hard to hit, the
// background conversations are unreachable. 44px is the size `h-11` already marks out in this
// codebase; the box inherited `py-2 text-xs` from the desktop chips and came out around 32px.
describe("the mobile control is a real touch target", () => {
  const dockSrc = readFileSync(new URL("./turn-dock.tsx", import.meta.url), "utf8");

  it("gives the collapsed box at least 44px of height", () => {
    const box = dockSrc.slice(dockSrc.indexOf('layout === "collapsed" ? ('));
    const className = box.slice(box.indexOf("className="), box.indexOf("style={{ borderTopColor: summaryLane }}"));
    expect(className).toContain("min-h-11");
    expect(className).not.toContain("text-xs");
  });
});

describe("the dock is restored after a reload", () => {
  it("kicks off the restore once the workspace list resolves", () => {
    expect(src).toContain("restoreDockedTurns");
    // From the hook onward: the first mention of restoreDockedTurns is its import, which
    // sits above this.
    const afterHook = src.slice(src.indexOf("useWorkspaceGroups();"));
    const effect = afterHook.slice(0, afterHook.indexOf("restoreDockedTurns"));
    expect(effect).toContain("if (!groups) return;");
  });
});
