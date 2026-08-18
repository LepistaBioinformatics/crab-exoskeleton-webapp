// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { chatCopy } from "@/lib/i18n/chat";

vi.mock("@/lib/chatSession", () => ({
  listConversations: vi.fn(() => Promise.resolve([])),
  notifyConversationsUpdated: vi.fn(),
  syncSessionRefs: vi.fn(() => Promise.resolve()),
  touchConversation: vi.fn(() => Promise.resolve()),
}));

import { listConversations } from "@/lib/chatSession";
import TurnDock, { __resetDockLabels, __seedDockRecord } from "./turn-dock";
import { __reset, __seed, __seedContext, getTurn } from "./turn-store";
import { readFragmentForTest } from "./fragment";
import { __resetRestore } from "./turn-restore";
import { laneColorFor } from "./conversation-bursts";
import { railColor } from "./dock-segments";

// jsdom normalizes an inline colour to `rgb(...)`, so an hsl() expectation has to be
// converted rather than compared as written.
function toRgb(color: string): string {
  const probe = document.createElement("div");
  probe.style.color = color;
  return probe.style.color;
}

const en = chatCopy.en.dock;
const ws = { t: "T", s: "S", r: "alpha" as const };
const ctx = { workspace: ws, onUnauthorized: () => {} };

// The repo's jsdom convention, established by message-content-remount.test.tsx: opt this
// one file into a DOM and tell React it may batch inside act().
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  __reset();
  __resetRestore();
  __resetDockLabels();
  vi.mocked(listConversations).mockReset();
  vi.mocked(listConversations).mockResolvedValue([]);
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __reset();
  __resetRestore();
  __resetDockLabels();
});

function render(props: Partial<Parameters<typeof TurnDock>[0]> = {}) {
  act(() => {
    root.render(
      <TurnDock currentSid={undefined} currentWorkspace={ws} desktop {...props} />,
    );
  });
}

const record = (id: string) => ({
  id,
  role: ws.r,
  tenantId: ws.t,
  subsAccId: ws.s,
  title: `title-${id}`,
  updatedAt: 0,
  alias: null as string | null,
  tags: [],
  sessionKey: null,
  sessionFile: null,
  project: null as string | null,
});

function seedDocked(sid: string, state: Parameters<typeof __seed>[1], label = `chat ${sid}`) {
  __seedContext(sid, ctx);
  __seed(sid, state);
  __seedDockRecord({ ...record(sid), title: label });
}

describe("TurnDock", () => {
  it("renders nothing when no conversation is docked", () => {
    render();
    expect(container.innerHTML).toBe("");
  });

  it("renders one segment per docked conversation", () => {
    seedDocked("conv-a", { running: true });
    seedDocked("conv-b", { running: false, error: "turn_lost" });
    render();
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.textContent).toContain("chat conv-a");
    expect(container.textContent).toContain(en.working);
    expect(container.textContent).toContain(en.failed);
  });

  // DEC-5: the open conversation renders its own bands. Docking it too would put the same
  // state on screen twice and make the bar's meaning negotiable.
  it("excludes the conversation on screen", () => {
    seedDocked("conv-a", { running: true });
    seedDocked("conv-b", { running: true });
    render({ currentSid: "conv-a" });
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).toContain("chat conv-b");
    expect(container.textContent).not.toContain("chat conv-a");
  });

  it("caps the desktop segments and offers the rest behind an overflow control", () => {
    for (const sid of ["a", "b", "c", "d", "e", "f"]) seedDocked(sid, { running: true });
    render();
    // Four segments plus the overflow button.
    expect(container.querySelectorAll("button")).toHaveLength(5);
    expect(container.textContent).toContain(en.overflow.replace("{n}", "2"));
  });

  // SUPERSEDED TWICE, both times by the maintainer, and both times for the same reported
  // symptom: at phone width a segmented bar truncated four competing strings into each other.
  // First mobile capped at 3 with a `+N`; then it scrolled sideways; now it is ONE box that
  // expands upward into a list. Each attempt divided the bar; only this one stops doing that.
  describe("mobile", () => {
    it("shows one box instead of segments, at every count", () => {
      for (const sid of ["a", "b", "c", "d"]) seedDocked(sid, { running: true });
      render({ desktop: false });
      const buttons = container.querySelectorAll("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toContain(en.summaryOther.replace("{n}", "4"));
    });

    // Not a special case at 3 or fewer -- one conversation collapses too. Predictable beats
    // clever: the bar does not change shape as work accumulates.
    it("collapses a single conversation as well", () => {
      seedDocked("a", { running: true });
      render({ desktop: false });
      expect(container.querySelectorAll("button")).toHaveLength(1);
      expect(container.textContent).toContain(en.summaryOne);
    });

    it("expands upward into a full row per conversation", () => {
      for (const sid of ["a", "b", "c"]) seedDocked(sid, { running: true });
      render({ desktop: false });

      act(() => {
        container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // The summary box plus one row per conversation.
      expect(container.querySelectorAll("button")).toHaveLength(4);
      // Upward: the panel is anchored above the bar, which is pinned to the bottom of the view.
      const panel = container.querySelector(".absolute") as HTMLElement;
      expect(panel.className).toContain("bottom-full");
      expect(container.textContent).toContain("chat a");
      expect(container.textContent).toContain("chat c");
    });

    // The collapsed box is the ONLY thing a mobile member sees, so if it cannot report a landed
    // reply the feature has lost its notification on that breakpoint entirely.
    it("reports the most newsworthy state, not the first one", () => {
      seedDocked("a", { running: true });
      seedDocked("b", { running: false, revealed: "the answer" });
      render({ desktop: false });
      const icon = container.querySelector("svg");
      expect(icon?.getAttribute("class")).toContain("text-fg");
      // `ready` outranks `working`, so nothing should be spinning.
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    it("carries the rail colour of the conversation it is reporting on", () => {
      seedDocked("a", { running: true });
      render({ desktop: false });
      const box = container.querySelector("button") as HTMLElement;
      expect(box.style.borderTopColor).toBe(toRgb(railColor(laneColorFor(undefined, "a"))));
    });
  });

  describe("desktop past the cap", () => {
    it("keeps the +N control", () => {
      for (const sid of ["a", "b", "c", "d", "e", "f"]) seedDocked(sid, { running: true });
      render({ desktop: true });
      expect(container.textContent).toContain(en.overflow.replace("{n}", "2"));
    });

    it("divides the bar with flex-1 up to the cap", () => {
      for (const sid of ["a", "b", "c"]) seedDocked(sid, { running: true });
      render({ desktop: true });
      expect((container.querySelector("button") as HTMLElement).className).toContain("flex-1");
    });
  });

  // parkFlush leaves the burst unsent until the member comes back and types, so the chip must
  // not borrow the language of work in progress.
  it("shows an unsent burst without a spinner", () => {
    seedDocked("conv-a", { running: false, pending: ["hello"] });
    render();
    expect(container.textContent).toContain(en.unsent);
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("puts the harness's own failure sentence in the title, untranslated", () => {
    seedDocked("conv-a", { running: false, error: "harness", errorDetail: "update image_model" });
    render();
    expect(container.querySelector("button")?.getAttribute("title")).toBe("update image_model");
  });

  it("names the agent when the conversation lives in another workspace", () => {
    __seedContext("conv-a", { workspace: { t: "T", s: "S", r: "beta" }, onUnauthorized: () => {} });
    __seed("conv-a", { running: true });
    __seedDockRecord({ ...record("conv-a"), title: "chat conv-a" });
    render();
    expect(container.textContent).toContain(en.inAgent.replace("{agent}", "beta"));
  });

  // One hash write: workspace, project and sid together. Two writes leave a frame on the right
  // workspace with no project, and every per-project fetch addresses the agent root.
  it("navigates to the conversation, with its project, in one write", () => {
    __seedContext("conv-a", { workspace: ws, project: "proj-x", onUnauthorized: () => {} });
    __seed("conv-a", { running: true });
    __seedDockRecord({ ...record("conv-a"), title: "chat conv-a" });
    render();

    act(() => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const f = readFragmentForTest();
    expect(f.sid).toBe("conv-a");
    expect(f.p).toBe("proj-x");
    expect(f.r).toBe("alpha");
  });

  // clearCompleted DELIBERATELY preserves error/errorDetail: for a harness failure that banner is
  // the only surviving trace, because picoclaw does not persist errors. So the chip has to retire
  // without the error going with it.
  it("retires a failed chip on click without clearing the error", () => {
    seedDocked("conv-a", { running: false, error: "harness", errorDetail: "nope" });
    render();
    act(() => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.innerHTML).toBe("");
    expect(getTurn("conv-a").error).toBe("harness");
    expect(getTurn("conv-a").errorDetail).toBe("nope");
  });

  it("hides on mobile while a text field has focus", () => {
    seedDocked("conv-a", { running: true });
    const input = document.createElement("textarea");
    document.body.appendChild(input);

    render({ desktop: false });
    expect(container.innerHTML).not.toBe("");

    act(() => {
      input.focus();
      document.dispatchEvent(new Event("focusin"));
    });
    expect(container.innerHTML).toBe("");
    input.remove();
  });

  it("stays put on desktop while a text field has focus", () => {
    seedDocked("conv-a", { running: true });
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    render({ desktop: true });
    act(() => {
      input.focus();
      document.dispatchEvent(new Event("focusin"));
    });
    expect(container.innerHTML).not.toBe("");
    input.remove();
  });

  // Every other test in this file seeds records directly, so none of them exercise the fetch.
  // These do -- and the second is the case a workspace-keyed "already fetched" cache got wrong:
  // a conversation created AFTER its workspace's list loaded is the ordinary in-session case (a
  // chat docks the moment you send in it and leave), and a permanent mark meant it could never
  // be named.
  describe("resolving names", () => {
    it("fetches the conversation list and labels the chip", async () => {
      vi.mocked(listConversations).mockResolvedValue([
        { ...record("conv-a"), alias: null, title: "Deploy notes" },
      ]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });

      render();
      await act(async () => {});
      expect(container.textContent).toContain("Deploy notes");
    });

    // SUPERSEDED REQUIREMENT, changed by the maintainer: the chip used to show `alias ?? title`,
    // which discarded whichever one it did not pick. It now follows the conversations' own
    // hierarchy from history-sidebar.tsx -- title primary, alias under it in smaller muted type.
    it("shows the title and the alias, with the alias as the secondary line", async () => {
      vi.mocked(listConversations).mockResolvedValue([
        { ...record("conv-a"), alias: "sprint 12", title: "Deploy notes" },
      ]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });

      render();
      await act(async () => {});
      expect(container.textContent).toContain("Deploy notes");
      expect(container.textContent).toContain("sprint 12");

      const aliasEl = [...container.querySelectorAll("span")].find(
        (el) => el.textContent === "sprint 12",
      ) as HTMLElement;
      expect(aliasEl.className).toContain("text-fg-muted");
      const titleEl = [...container.querySelectorAll("span")].find(
        (el) => el.textContent === "Deploy notes",
      ) as HTMLElement;
      expect(titleEl.className).toContain("font-medium");
      expect(titleEl.className).not.toContain("text-fg-muted");
    });

    // The alias is the name the MEMBER chose, and aria-label replaces the button's content for a
    // screen reader -- so the label has to carry it, not the derived title.
    it("names the chip by its alias for assistive tech", async () => {
      vi.mocked(listConversations).mockResolvedValue([
        { ...record("conv-a"), alias: "sprint 12", title: "Deploy notes" },
      ]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });

      render();
      await act(async () => {});
      expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
        chatCopy.en.dock.open.replace("{chat}", "sprint 12"),
      );
    });

    it("shows no alias line when the conversation has no alias", async () => {
      vi.mocked(listConversations).mockResolvedValue([
        { ...record("conv-a"), alias: null, title: "Deploy notes" },
      ]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });

      render();
      await act(async () => {});
      expect(container.querySelector(".text-\\[11px\\]")).toBeNull();
    });

    it("refetches for a conversation created after the workspace list loaded", async () => {
      vi.mocked(listConversations).mockResolvedValue([{ ...record("conv-a"), title: "First" }]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });
      render();
      await act(async () => {});
      expect(container.textContent).toContain("First");

      vi.mocked(listConversations).mockResolvedValue([
        { ...record("conv-a"), title: "First" },
        { ...record("conv-b"), title: "Second" },
      ]);
      __seedContext("conv-b", ctx);
      act(() => {
        __seed("conv-b", { running: true });
      });
      await act(async () => {});
      expect(container.textContent).toContain("Second");
    });

    // A session id the workspace does not return must not re-trigger its fetch on every render.
    it("stops asking for a name the workspace does not have", async () => {
      vi.mocked(listConversations).mockResolvedValue([]);
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });

      render();
      await act(async () => {});
      const calls = vi.mocked(listConversations).mock.calls.length;
      render();
      await act(async () => {});
      expect(vi.mocked(listConversations).mock.calls.length).toBe(calls);
      expect(container.textContent).toContain(en.working);
    });
  });

  // Identity colour comes from the tree's own laneColorFor, so a chip and its dot in the spine
  // are the same colour.
  describe("lane colours", () => {
    it("gives each segment a rail in its own colour", () => {
      seedDocked("conv-a", { running: true });
      seedDocked("conv-b", { running: true });
      render();

      const rails = [...container.querySelectorAll("button")].map(
        (b) => (b as HTMLElement).style.borderTopColor,
      );
      expect(rails).toHaveLength(2);
      expect(rails[0]).not.toBe(rails[1]);
      // The FIRST segment carries a rail too. The rail is an identity marker, not a divider, so
      // the old `last:border-r-0` reflex inverts here: a leading chip with no colour would be
      // the one chip you cannot identify by hue.
      for (const rail of rails) expect(rail).not.toBe("");
    });

    // Not an exact match, and deliberately: railColor re-lightens laneColorFor's output because
    // a fixed 55% lightness is invisible for half the hue wheel on this surface. The HUE is what
    // identity rides on, so that is what must not drift.
    it("keeps laneColorFor's hue, so the dock and the tree cannot drift", () => {
      seedDocked("conv-a", { running: true });
      render();
      const rail = (container.querySelector("button") as HTMLElement).style.borderTopColor;
      expect(rail).toBe(toRgb(railColor(laneColorFor(undefined, "conv-a"))));
      expect(rail).not.toBe(toRgb(laneColorFor(undefined, "conv-a")));
    });

    it("prefers the conversation's tag colour", () => {
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });
      __seedDockRecord({
        ...record("conv-a"),
        title: "chat conv-a",
        tags: [{ name: "urgent", value: null, metadata: { color: "#ff0000" } }],
      });
      render();
      const rail = (container.querySelector("button") as HTMLElement).style.borderTopColor;
      expect(rail).toBe(toRgb(railColor("#ff0000")));
      expect(railColor("#ff0000")).toContain("hsl(0.0 100%");
    });

    it("colours a chip whose record has not arrived yet", async () => {
      __seedContext("conv-a", ctx);
      __seed("conv-a", { running: true });
      render();
      const button = container.querySelector("button") as HTMLElement;
      expect(button.style.borderTopColor).toBe(toRgb(railColor(laneColorFor(undefined, "conv-a"))));
      expect(container.textContent).toContain(en.working);
      await act(async () => {});
    });

    // The two axes stay separate: the rail says WHICH conversation, the state tone says what it
    // is doing. Collapsing them would make a failed chip unfindable by colour.
    it("keeps the state tone alongside the identity colour", () => {
      seedDocked("conv-a", { running: false, error: "turn_lost" });
      render();
      const button = container.querySelector("button") as HTMLElement;
      expect(button.innerHTML).toContain("text-blocked");
      expect(button.style.borderTopColor).not.toBe("");
    });

    // The readability fix. The lane colour is an unbounded set of hashed hues, some of them
    // pale; painting the conversation's name in it made the text hard to read on the bar.
    it("never paints the conversation name in the lane colour", () => {
      seedDocked("conv-a", { running: true }, "Deploy notes");
      render();
      const named = [...container.querySelectorAll("span")].find(
        (el) => el.textContent === "Deploy notes",
      ) as HTMLElement;
      expect(named).toBeTruthy();
      expect(named.style.color).toBe("");
    });

    it("keeps the state tone off the name", () => {
      seedDocked("conv-a", { running: false, error: "turn_lost" }, "Deploy notes");
      render();
      const named = [...container.querySelectorAll("span")].find(
        (el) => el.textContent === "Deploy notes",
      ) as HTMLElement;
      expect(named.className).not.toContain("text-blocked");
    });
  });

  // Tags come from the conversations' own TagCluster, not a second implementation, so the
  // collapsed icon, the count and the popover chips cannot drift from the sidebar's.
  describe("tags", () => {
    const tagged = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `tag${i}`,
        value: null,
        metadata: i === 0 ? { color: "#ff0000" } : {},
      }));

    it("shows the tag cluster when the conversation carries tags", () => {
      seedDocked("conv-a", { running: true });
      __seedDockRecord({ ...record("conv-a"), title: "chat", tags: tagged(2) });
      render();
      const cluster = container.querySelector('[aria-label]:not(button):not([role])');
      expect(cluster).toBeTruthy();
      // TagCluster shows the count once there is more than one.
      expect(container.textContent).toContain("2");
    });

    it("shows nothing when the conversation has no tags", () => {
      seedDocked("conv-a", { running: true });
      render();
      expect(container.innerHTML).not.toContain("group/tags");
    });

    // The bar is pinned to the bottom of the viewport, so the default downward popover would
    // open off-screen entirely. This is the one caller that needs it inverted.
    it("opens the tag popover upward", () => {
      seedDocked("conv-a", { running: true });
      __seedDockRecord({ ...record("conv-a"), title: "chat", tags: tagged(1) });
      render();
      expect(container.innerHTML).toContain("bottom-full");
      expect(container.innerHTML).not.toContain("top-full");
    });
  });

  // The bar itself: the accent tint is the palette's "interactive" colour, it fought every
  // hue the rails put on top of it, and it was not a surface meant to be read against.
  it("stands on a neutral surface, not an accent fill", () => {
    seedDocked("conv-a", { running: true });
    render();
    const bar = container.querySelector('[role="region"]') as HTMLElement;
    expect(bar.className).toContain("bg-surface");
    expect(bar.className).not.toContain("accent");
    // No border of its own: the rails form the bar's top edge, and a hairline above them
    // would dilute the one signal the bar exists to carry.
    expect(bar.className).not.toContain("border-t");
  });

  it("renders both locales through the dict", () => {
    seedDocked("conv-a", { running: false, revealed: "done" });
    render();
    expect(container.textContent).toContain(chatCopy.en.dock.ready);
    expect(chatCopy.pt.dock.ready).not.toBe(chatCopy.en.dock.ready);
  });
});
