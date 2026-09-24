// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  close,
  nextAfterClose,
  openPreview,
  pin,
  readTabs,
  retitle,
  sameTab,
  tabKey,
  writeTabs,
  readActiveTab,
  writeActiveTab,
  resumeTab,
  type Tab,
  type TabRef,
} from "./conversation-tabs";

// WHAT THE MEMBER HAS OPEN, which is not what is running.
//
// The dock enumerates `turn-store`: an active turn and a finished one nobody has
// acknowledged. An entry leaves it the moment it is acknowledged — precisely when a
// member stops being able to find their way back, which is the complaint this answers.

const ref = (over: Partial<TabRef> = {}): TabRef => ({
  t: "acme",
  s: "growth",
  r: "alpha",
  p: null,
  sid: "c1",
  ...over,
});

const tab = (over: Partial<Tab> = {}): Tab => ({ ...ref(), preview: false, title: "One", ...over });

describe("what identifies a tab", () => {
  // THE WHOLE TUPLE. The request names the case: coming back to a conversation "from
  // another project". Keyed on `sid` alone, activating a tab would land the member on
  // the right conversation in the WRONG project — and every path the screen then
  // resolves (files, memory, the graph) addresses a workspace directory by `p`.
  it("separates the same conversation under different projects", () => {
    expect(sameTab(ref({ p: null }), ref({ p: "legal" }))).toBe(false);
    expect(tabKey(ref({ p: "legal" }))).not.toBe(tabKey(ref({ p: null })));
  });

  it("separates the same conversation under different workspaces", () => {
    expect(sameTab(ref(), ref({ r: "beta" }))).toBe(false);
    expect(sameTab(ref(), ref({ s: "other" }))).toBe(false);
  });

  it("treats the same location as the same tab", () => {
    expect(sameTab(ref(), ref())).toBe(true);
  });

  // The key is joined on NUL, which cannot occur in a uuid or an agent name, so two
  // different tuples cannot collide by concatenation.
  it("does not collide when a field's text runs into the next", () => {
    expect(tabKey(ref({ r: "a", p: "b" }))).not.toBe(tabKey(ref({ r: "ab", p: "" })));
  });
});

describe("a single click", () => {
  it("opens a preview", () => {
    const tabs = openPreview([], ref(), "One");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].preview).toBe(true);
  });

  // THE WHOLE POINT OF A PREVIEW. Nine glances down a history list leave one tab.
  it("replaces the previous preview rather than adding to it", () => {
    let tabs = openPreview([], ref({ sid: "a" }), "A");
    tabs = openPreview(tabs, ref({ sid: "b" }), "B");
    tabs = openPreview(tabs, ref({ sid: "c" }), "C");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].sid).toBe("c");
  });

  it("keeps pinned tabs while replacing the preview", () => {
    let tabs = pin([], ref({ sid: "kept" }), "Kept");
    tabs = openPreview(tabs, ref({ sid: "a" }), "A");
    tabs = openPreview(tabs, ref({ sid: "b" }), "B");
    expect(tabs.map((x) => x.sid)).toEqual(["kept", "b"]);
  });

  // IN THE PREVIEW'S OWN SLOT. A preview that jumped to the end of the strip on every
  // click would make the one moving thing on screen the thing being looked at.
  it("opens where the previous preview was, not at the end", () => {
    const tabs = openPreview(
      [tab({ sid: "a" }), tab({ sid: "prev", preview: true }), tab({ sid: "b" })],
      ref({ sid: "new" }),
      "New",
    );
    expect(tabs.map((x) => x.sid)).toEqual(["a", "new", "b"]);
  });

  // Clicking one already open must not demote it: that would throw away the member's
  // own decision to keep it.
  it("does not turn an open pinned tab back into a preview", () => {
    const tabs = openPreview([tab({ sid: "c1" })], ref({ sid: "c1" }), "One");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].preview).toBe(false);
  });
});

describe("keeping one", () => {
  it("pins the preview in place", () => {
    let tabs = openPreview([], ref(), "One");
    tabs = pin(tabs, ref(), "One");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].preview).toBe(false);
  });

  // IDEMPOTENT, and load-bearing rather than tidy: the composer pins on every send, so
  // a second message must not open a second tab.
  it("is idempotent, however many messages are sent", () => {
    let tabs = pin([], ref(), "One");
    tabs = pin(tabs, ref(), "One");
    tabs = pin(tabs, ref(), "One");
    expect(tabs).toHaveLength(1);
  });

  // A conversation has no `sid` until its first turn exists, so its first appearance
  // in the strip is the moment it is pinned.
  it("pins a conversation that was never previewed", () => {
    const tabs = pin([tab({ sid: "other" })], ref({ sid: "fresh" }), "Fresh");
    expect(tabs.map((x) => x.sid)).toEqual(["other", "fresh"]);
    expect(tabs[1].preview).toBe(false);
  });

  it("leaves a preview beside it alone", () => {
    let tabs = openPreview([], ref({ sid: "p" }), "P");
    tabs = pin(tabs, ref({ sid: "new" }), "New");
    expect(tabs.filter((x) => x.preview)).toHaveLength(1);
  });
});

describe("closing", () => {
  const three = [tab({ sid: "a" }), tab({ sid: "b" }), tab({ sid: "c" })];

  it("removes only the one named", () => {
    expect(close(three, ref({ sid: "b" })).map((x) => x.sid)).toEqual(["a", "c"]);
  });

  // NOTHING MOVES when the closed tab is not the active one. A strip that navigated
  // on every close would take a member out of what they were reading.
  it("does not navigate when the closed tab is not active", () => {
    expect(nextAfterClose(three, ref({ sid: "b" }), ref({ sid: "a" }))).toBeNull();
  });

  it("activates the neighbour to the right, as an editor does", () => {
    expect(nextAfterClose(three, ref({ sid: "b" }), ref({ sid: "b" }))?.sid).toBe("c");
  });

  it("falls back to the left at the end of the strip", () => {
    expect(nextAfterClose(three, ref({ sid: "c" }), ref({ sid: "c" }))?.sid).toBe("b");
  });

  // The member closed a tab; they did not ask to go anywhere. The shell stays put.
  it("goes nowhere when the last one closes", () => {
    const one = [tab({ sid: "a" })];
    expect(nextAfterClose(one, ref({ sid: "a" }), ref({ sid: "a" }))).toBeNull();
  });
});

describe("titles", () => {
  it("renames in place without reordering", () => {
    const tabs = retitle([tab({ sid: "a" }), tab({ sid: "b" })], ref({ sid: "b" }), "Renamed");
    expect(tabs.map((x) => x.title)).toEqual(["One", "Renamed"]);
  });

  it("is a no-op for a tab that is not open", () => {
    const tabs = [tab({ sid: "a" })];
    expect(retitle(tabs, ref({ sid: "zz" }), "X")).toEqual(tabs);
  });
});

// THE STRIP IS TEXT A MEMBER CAN EDIT, and this shell has paid once for trusting text
// it did not check: `asDestination`'s comment records a hand-edited fragment reaching a
// panel that called `.label()` on `undefined`.
describe("reading the strip back", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips what was written", () => {
    writeTabs([tab({ sid: "a" }), tab({ sid: "b", preview: true })]);
    expect(readTabs().map((x) => x.sid)).toEqual(["a", "b"]);
    expect(readTabs()[1].preview).toBe(true);
  });

  it("answers nothing for an empty store", () => {
    expect(readTabs()).toEqual([]);
  });

  it("discards text that is not JSON, rather than throwing", () => {
    localStorage.setItem("chat-open-tabs", "{not json");
    expect(readTabs()).toEqual([]);
  });

  it("discards a payload that is not a list", () => {
    localStorage.setItem("chat-open-tabs", '{"sid":"a"}');
    expect(readTabs()).toEqual([]);
  });

  // ONE BAD ROW MUST NOT COST THE WHOLE WORKBENCH.
  it("drops the malformed entries and keeps the rest", () => {
    localStorage.setItem(
      "chat-open-tabs",
      JSON.stringify([
        { t: "acme", s: "growth", r: "alpha", sid: "good", preview: false, title: "G" },
        { t: "acme", s: "growth", r: "alpha" },
        null,
        "nonsense",
        { sid: "no-workspace" },
      ]),
    );
    expect(readTabs().map((x) => x.sid)).toEqual(["good"]);
  });

  // A duplicate would give the member two tabs that one close could not clear.
  it("drops a duplicate of the same location", () => {
    const one = tab({ sid: "a" });
    localStorage.setItem("chat-open-tabs", JSON.stringify([one, one]));
    expect(readTabs()).toHaveLength(1);
  });

  // The invariant is the feature's, so it is re-established on the way IN rather than
  // assumed of text from disk.
  it("keeps at most one preview, whatever was stored", () => {
    localStorage.setItem(
      "chat-open-tabs",
      JSON.stringify([
        tab({ sid: "a", preview: true }),
        tab({ sid: "b", preview: true }),
        tab({ sid: "c", preview: true }),
      ]),
    );
    expect(readTabs().filter((x) => x.preview)).toHaveLength(1);
  });

  it("reads a missing project as the agent's own workspace", () => {
    localStorage.setItem(
      "chat-open-tabs",
      JSON.stringify([{ t: "a", s: "b", r: "c", sid: "d", title: "T" }]),
    );
    expect(readTabs()[0].p).toBeNull();
  });
});

// A private window denies storage on both ends. A shell that failed to render because
// it could not read its tab strip would be the smaller feature taking down the larger.
describe("when storage is unavailable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads as empty rather than throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => readTabs()).not.toThrow();
    expect(readTabs()).toEqual([]);
  });

  it("writes without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeTabs([tab()])).not.toThrow();
  });
});

// ENTERING THE WORKSPACE RESUMES WHERE THE MEMBER WAS.
//
// Landing on a fresh composer with nine tabs behind it throws away the context the
// strip exists to keep. What the rule must NOT do is make New chat unreachable, which
// is why the shell fires it once on arrival rather than whenever `sid` is absent --
// `sid` is missing both when a member arrives and when they ask for a new
// conversation, and only the first is a resume.
describe("coming back to the workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("goes to the remembered tab", () => {
    const tabs = [tab({ sid: "a" }), tab({ sid: "b" }), tab({ sid: "c" })];
    writeActiveTab(ref({ sid: "b" }));
    expect(resumeTab(tabs, readActiveTab(tabs))?.sid).toBe("b");
  });

  // The strip is in open order, so the last is the most recently opened -- the best
  // guess available when nothing was remembered.
  it("falls back to the most recently opened", () => {
    const tabs = [tab({ sid: "a" }), tab({ sid: "b" })];
    expect(resumeTab(tabs, readActiveTab(tabs))?.sid).toBe("b");
  });

  // A POINTER AT A CLOSED TAB IS HOW A MEMBER LANDS ON AN EMPTY TRANSCRIPT. The
  // remembered key is resolved against the list rather than trusted.
  it("ignores a pointer at a tab that is no longer open", () => {
    const tabs = [tab({ sid: "a" })];
    writeActiveTab(ref({ sid: "gone" }));
    expect(readActiveTab(tabs)).toBeNull();
    expect(resumeTab(tabs, readActiveTab(tabs))?.sid).toBe("a");
  });

  // The landing screen is the right answer for a member with no tabs, which is every
  // member the first time.
  it("goes nowhere when there are no tabs", () => {
    expect(resumeTab([], null)).toBeNull();
  });

  // The pointer is keyed on the TUPLE, like the tabs: the same conversation under a
  // different project must not resolve.
  it("does not resolve a pointer from another project", () => {
    const tabs = [tab({ sid: "a", p: "legal" })];
    writeActiveTab(ref({ sid: "a", p: null }));
    expect(readActiveTab(tabs)).toBeNull();
  });

  it("survives storage being denied", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readActiveTab([tab()])).toBeNull();
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeActiveTab(ref())).not.toThrow();
    set.mockRestore();
  });
});
