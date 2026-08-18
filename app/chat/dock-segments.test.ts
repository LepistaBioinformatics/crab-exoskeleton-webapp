import { describe, expect, it } from "vitest";
import {
  DESKTOP_CAP,
  dockLayout,
  summaryState,
  railColor,
  relativeLuminance,
  elapsedReadout,
  hidesForKeyboard,
  orderDocked,
  qualifier,
  splitDock,
} from "./dock-segments";
import { SILENCE_GRACE_MS, type DockedTurn } from "./turn-store";

const entry = (sid: string, over: Partial<DockedTurn> = {}): DockedTurn => ({
  sid,
  state: "working",
  lastEventAt: 0,
  errorDetail: null,
  ctx: null,
  ...over,
});

describe("orderDocked", () => {
  it("puts restored conversations first, oldest by the server's clock", () => {
    const since: Record<string, number> = { late: 2_000, early: 1_000 };
    const got = orderDocked([entry("live"), entry("late"), entry("early")], (sid) => since[sid] ?? null);
    expect(got.map((s) => s.sid)).toEqual(["early", "late", "live"]);
  });

  it("keeps in-session entries in the order they were touched", () => {
    const got = orderDocked([entry("a"), entry("b"), entry("c")], () => null);
    expect(got.map((s) => s.sid)).toEqual(["a", "b", "c"]);
  });

  it("carries the server timestamp onto the segment", () => {
    const [seg] = orderDocked([entry("a")], () => 1_234);
    expect(seg.since).toBe(1_234);
  });
});

describe("DESKTOP_CAP / splitDock", () => {
  it("caps the side-by-side segments at four", () => {
    expect(DESKTOP_CAP).toBe(4);
  });

  it("shows everything when it fits", () => {
    const { visible, hidden } = splitDock([1, 2, 3], 4);
    expect(visible).toEqual([1, 2, 3]);
    expect(hidden).toEqual([]);
  });

  // The oldest survive the cap: they are the ones most at risk of being forgotten, which
  // is the whole reason the dock exists.
  it("keeps the first `cap` and hides the rest", () => {
    const { visible, hidden } = splitDock([1, 2, 3, 4, 5, 6], 4);
    expect(visible).toEqual([1, 2, 3, 4]);
    expect(hidden).toEqual([5, 6]);
  });
});

describe("dockLayout", () => {
  it("divides the desktop bar up to the cap", () => {
    expect(dockLayout(1, true)).toBe("fit");
    expect(dockLayout(4, true)).toBe("fit");
  });

  it("hides desktop extras behind the +N control", () => {
    expect(dockLayout(5, true)).toBe("overflow");
    expect(dockLayout(20, true)).toBe("overflow");
  });

  // Mobile NEVER divides the bar, at any count. Two earlier attempts did -- three segments, then
  // a sideways-scrolling strip -- and both truncated the title, state, qualifier and alias into
  // each other at phone width.
  it("collapses mobile to one box at every count", () => {
    for (const n of [1, 2, 3, 4, 9]) {
      expect(dockLayout(n, false), `${n} segments`).toBe("collapsed");
    }
  });
});

describe("summaryState", () => {
  const seg = (state: string) => ({ state }) as { state: Parameters<typeof summaryState>[0][0]["state"] };

  it("says nothing about an empty list", () => {
    expect(summaryState([])).toBeNull();
  });

  // `failed` is the only state asking the member for something, so it outranks the rest.
  it("reports a failure over anything else", () => {
    expect(summaryState([seg("working"), seg("ready"), seg("failed")])).toBe("failed");
  });

  // `ready` is the news the feature exists to deliver. A collapsed box that cannot show it has
  // lost the notification for every mobile member.
  it("reports a landed reply over work still running", () => {
    expect(summaryState([seg("working"), seg("unsent"), seg("ready")])).toBe("ready");
  });

  it("prefers reconnecting to working, and working last of all", () => {
    expect(summaryState([seg("working"), seg("reconnecting")])).toBe("reconnecting");
    expect(summaryState([seg("working"), seg("unsent")])).toBe("unsent");
    expect(summaryState([seg("working")])).toBe("working");
  });
});

describe("elapsedReadout", () => {
  const now = 1_000_000;

  it("says nothing about an unsent message", () => {
    expect(elapsedReadout({ state: "unsent", since: 900_000, lastEventAt: 900_000 }, now)).toBeNull();
  });

  // A restored chip has no other clock: lastEventAt is 0 because a resumed turn goes
  // through neither runTurn nor consumeStream, and recoveringSince is stamped at resume.
  it("reports the total duration for a restored conversation", () => {
    expect(elapsedReadout({ state: "working", since: 400_000, lastEventAt: 0 }, now)).toEqual({
      key: "runningFor",
      ms: 600_000,
    });
  });

  it("prefers the server's total over a local event, so a restored chip cannot regress", () => {
    const got = elapsedReadout({ state: "working", since: 400_000, lastEventAt: 999_000 }, now);
    expect(got?.key).toBe("runningFor");
  });

  it("reports quiet time in-session, once past the grace window", () => {
    expect(elapsedReadout({ state: "working", since: null, lastEventAt: now - SILENCE_GRACE_MS }, now)).toEqual({
      key: "quietFor",
      ms: SILENCE_GRACE_MS,
    });
  });

  it("stays silent while the turn is still brief", () => {
    expect(
      elapsedReadout({ state: "working", since: null, lastEventAt: now - (SILENCE_GRACE_MS - 1) }, now),
    ).toBeNull();
  });

  it("stays silent when no event has ever landed", () => {
    expect(elapsedReadout({ state: "working", since: null, lastEventAt: 0 }, now)).toBeNull();
  });
});

describe("qualifier", () => {
  const current = { t: "T", s: "S", r: "alpha" as const };
  const ctx = (r: string, project: string | null = null) => ({
    workspace: { t: "T", s: "S", r: r as "alpha", p: project },
    project,
    onUnauthorized: () => {},
  });

  it("says nothing when the conversation is in the workspace on screen", () => {
    expect(qualifier({ ctx: ctx("alpha") }, current)).toBeNull();
  });

  it("names the agent when the conversation lives under a different one", () => {
    expect(qualifier({ ctx: ctx("beta") }, current)).toEqual({ key: "inAgent", value: "beta" });
  });

  // The project is the more specific answer: naming the parent agent for a conversation
  // that lives in one of its projects points at the wrong workspace directory.
  it("names the project rather than the agent", () => {
    expect(qualifier({ ctx: ctx("alpha", "proj-x") }, current)).toEqual({
      key: "inProject",
      value: "proj-x",
    });
  });

  it("says nothing when the member is already inside that project", () => {
    expect(qualifier({ ctx: ctx("alpha", "proj-x") }, { ...current, p: "proj-x" })).toBeNull();
  });

  // The case a "does the segment have a project" check misses. A project is a picoclaw
  // agent of its own with its own workspace directory, so a conversation at the AGENT ROOT
  // seen from inside one of that agent's projects is not "here" -- and left unqualified it
  // reads as if it were.
  it("names the agent for a root conversation seen from inside a project", () => {
    expect(qualifier({ ctx: ctx("alpha") }, { ...current, p: "proj-x" })).toEqual({
      key: "inAgent",
      value: "alpha",
    });
  });

  it("names the other project when the member is inside a different one", () => {
    expect(qualifier({ ctx: ctx("alpha", "proj-x") }, { ...current, p: "proj-y" })).toEqual({
      key: "inProject",
      value: "proj-x",
    });
  });

  it("says nothing when the conversation never ran here", () => {
    expect(qualifier({ ctx: null }, current)).toBeNull();
  });
});

describe("hidesForKeyboard", () => {
  it("never hides on desktop", () => {
    expect(hidesForKeyboard(true, "textarea")).toBe(false);
  });

  it("hides on mobile while a text field has focus", () => {
    expect(hidesForKeyboard(false, "textarea")).toBe(true);
    expect(hidesForKeyboard(false, "input")).toBe(true);
  });

  it("stays put on mobile when nothing is being typed into", () => {
    expect(hidesForKeyboard(false, null)).toBe(false);
    expect(hidesForKeyboard(false, "button")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// railColor
// ---------------------------------------------------------------------------

// A PROPERTY test over the whole hue wheel, and it exists because the bug it guards was
// shipped twice. `laneColorFor` holds lightness at 55% for every hue, so its relative
// luminance swings from 0.06 (hue 240) to 0.66 (hue 60) -- and a hue-60 rail measured
// 1.46:1 against the light surface, which reads as no rail at all. Half the wheel failed.
//
// Asserting one colour would not have caught it: the failure depends on WHICH conversation
// hashed to WHICH hue, so only sweeping the wheel is a real check.
const LIGHT_SURFACE = relativeLuminance(247, 249, 250); // --surface, light  #f7f9fa
const DARK_SURFACE = relativeLuminance(27, 31, 35); // --surface, dark   #1b1f23

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminanceOf(hsl: string): number {
  const m = /^hsl\(([\d.]+) (\d+)% (\d+)%\)$/.exec(hsl);
  if (!m) throw new Error(`not an hsl() this test can read: ${hsl}`);
  const h = Number(m[1]);
  const sat = Number(m[2]) / 100;
  const lig = Number(m[3]) / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return (lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255;
  };
  return relativeLuminance(f(0), f(8), f(4));
}

describe("railColor", () => {
  it("clears 3:1 on the light surface for every hue", () => {
    for (let h = 0; h < 360; h += 5) {
      const lum = luminanceOf(railColor(`hsl(${h} 65% 55%)`));
      expect(contrast(lum, LIGHT_SURFACE), `hue ${h}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("clears 3:1 on the dark surface for every hue", () => {
    for (let h = 0; h < 360; h += 5) {
      const lum = luminanceOf(railColor(`hsl(${h} 65% 55%)`));
      expect(contrast(lum, DARK_SURFACE), `hue ${h}`).toBeGreaterThanOrEqual(3);
    }
  });

  // The reason the whole thing works with ONE value per conversation instead of a per-theme
  // override: the target luminance sits in the band that satisfies both surfaces at once.
  it("holds luminance roughly constant across hues, so rails differ by hue alone", () => {
    const lums = [];
    for (let h = 0; h < 360; h += 15) lums.push(luminanceOf(railColor(`hsl(${h} 65% 55%)`)));
    const spread = Math.max(...lums) - Math.min(...lums);
    expect(spread).toBeLessThan(0.02);
  });

  // Identity has to survive the correction, or a chip stops matching its dot in the tree.
  it("preserves the hue it was given", () => {
    for (const h of [0, 60, 137.5, 240, 359]) {
      expect(railColor(`hsl(${h} 65% 55%)`)).toContain(`hsl(${h.toFixed(1)} 65%`);
    }
  });

  // A tag colour the member picked is subject to the same problem -- pale yellow is pale
  // yellow whoever chose it -- so hex goes through the same normalization.
  it("normalizes a hex tag colour too, keeping its hue", () => {
    const out = railColor("#ffff00"); // pure yellow: 1.07:1 against the light surface
    expect(out).toMatch(/^hsl\(60\.0 100% \d+%\)$/);
    expect(contrast(luminanceOf(out), LIGHT_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it("hands back anything it cannot parse rather than dropping the rail", () => {
    expect(railColor("var(--accent)")).toBe("var(--accent)");
    expect(railColor("#abc")).toBe("#abc");
  });

  it("leaves a grey alone: there is no hue to protect", () => {
    expect(railColor("#808080")).toBe("#808080");
  });
});
