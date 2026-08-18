import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __reset,
  __seed,
  __seedContext,
  acknowledgeTurn,
  clearCompleted,
  dockStateOf,
  dockedTurns,
  getTurn,
} from "./turn-store";

const ctx = { workspace: { t: "T", s: "S", r: "alpha" as const }, onUnauthorized: () => {} };

beforeEach(() => __reset());
afterEach(() => __reset());

// ---------------------------------------------------------------------------
// dockStateOf — the predicate and the label are ONE decision
// ---------------------------------------------------------------------------

describe("dockStateOf", () => {
  // THE test for this task. `turns` is never pruned: clearCompleted blanks the bands and
  // leaves the entry, and nothing deletes. So a dock built on Map membership fills with
  // conversations that finished ten minutes ago. Membership has to be a field test.
  it("does not dock an entry that has been through clearCompleted", () => {
    __seed("conv-a", { running: false, activeUserMessage: "hi", revealed: "there" });
    expect(dockStateOf(getTurn("conv-a"))).toBe("ready");

    clearCompleted("conv-a");
    expect(dockStateOf(getTurn("conv-a"))).toBeNull();
  });

  it("does not dock a conversation with no state at all", () => {
    expect(dockStateOf(getTurn("never-touched"))).toBeNull();
  });

  it("docks a running turn as working", () => {
    __seed("conv-a", { running: true });
    expect(dockStateOf(getTurn("conv-a"))).toBe("working");
  });

  it("docks a retrying turn as working", () => {
    __seed("conv-a", { running: false, retrying: 2 });
    expect(dockStateOf(getTurn("conv-a"))).toBe("working");
  });

  it("docks a queued turn as working", () => {
    __seed("conv-a", { running: false, queue: ["next one"] });
    expect(dockStateOf(getTurn("conv-a"))).toBe("working");
  });

  it("docks a settling upload as working", () => {
    __seed("conv-a", { running: false, settling: true });
    expect(dockStateOf(getTurn("conv-a"))).toBe("working");
  });

  it("docks a stopping turn as working", () => {
    __seed("conv-a", { running: false, stopping: true });
    expect(dockStateOf(getTurn("conv-a"))).toBe("working");
  });

  it("docks a recovering turn as reconnecting", () => {
    __seed("conv-a", { running: true, recovering: true });
    expect(dockStateOf(getTurn("conv-a"))).toBe("reconnecting");
  });

  // parkFlush only clears the debounce timer, and bumpFlush-on-typing is the only thing
  // that re-arms it. So hitting send and navigating away inside SEND_DEBOUNCE_MS leaves a
  // message that will NOT be POSTed until the member comes back and types. That is the
  // most valuable chip the dock can show, and it is not "working" -- nothing is running.
  it("docks a parked, unsent burst as unsent", () => {
    __seed("conv-a", { running: false, pending: ["hello"] });
    expect(dockStateOf(getTurn("conv-a"))).toBe("unsent");
  });

  it("docks a failed turn as failed", () => {
    __seed("conv-a", { running: false, error: "turn_lost" });
    expect(dockStateOf(getTurn("conv-a"))).toBe("failed");
  });

  it("docks a landed reply as ready", () => {
    __seed("conv-a", { running: false, revealed: "the answer" });
    expect(dockStateOf(getTurn("conv-a"))).toBe("ready");
  });

  it("docks a turn whose own message is on screen but has no reply yet as ready", () => {
    __seed("conv-a", { running: false, activeUserMessage: "hi" });
    expect(dockStateOf(getTurn("conv-a"))).toBe("ready");
  });

  describe("precedence", () => {
    it("failed outranks ready", () => {
      __seed("conv-a", { running: false, revealed: "partial", error: "turn_lost" });
      expect(dockStateOf(getTurn("conv-a"))).toBe("failed");
    });

    // `running` stays true throughout a recovery by long-turn-resilience FR-4, so these
    // two always coincide and the more specific one has to win.
    it("reconnecting outranks working", () => {
      __seed("conv-a", { running: true, recovering: true });
      expect(dockStateOf(getTurn("conv-a"))).toBe("reconnecting");
    });

    it("working outranks unsent", () => {
      __seed("conv-a", { running: true, pending: ["queued behind the running turn"] });
      expect(dockStateOf(getTurn("conv-a"))).toBe("working");
    });
  });
});

// ---------------------------------------------------------------------------
// dockedTurns — the snapshot
// ---------------------------------------------------------------------------

describe("dockedTurns", () => {
  it("returns nothing when nothing is active", () => {
    expect(dockedTurns()).toEqual([]);
  });

  it("carries the sid, state and run context of each docked conversation", () => {
    __seedContext("conv-a", { ...ctx, project: "proj-x" });
    __seed("conv-a", { running: true });
    const [entry] = dockedTurns();
    expect(entry.sid).toBe("conv-a");
    expect(entry.state).toBe("working");
    expect(entry.ctx?.project).toBe("proj-x");
  });

  // useSyncExternalStore compares snapshots by reference, and emit() fires on EVERY
  // reveal tick -- up to REVEAL_MAX_STEPS per reply. A snapshot rebuilt each time would
  // re-render the dock sixty times per reply for fields it does not display.
  it("is referentially stable across a reveal tick", () => {
    __seed("conv-a", { running: true, buffered: "one two three" });
    const first = dockedTurns();
    __seed("conv-a", { revealed: "one", buffered: " two three" });
    expect(dockedTurns()).toBe(first);
  });

  it("returns a new snapshot when a state changes", () => {
    __seed("conv-a", { running: true });
    const first = dockedTurns();
    __seed("conv-a", { running: true, recovering: true });
    expect(dockedTurns()).not.toBe(first);
  });

  it("returns a new snapshot when a conversation joins or leaves", () => {
    __seed("conv-a", { running: true });
    const first = dockedTurns();
    __seed("conv-b", { running: true });
    const second = dockedTurns();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });

  // The elapsed readout reads lastEventAt, so a chip that never re-rendered would count
  // up from a stale event forever. Bucketed to the second: content deltas arrive far
  // faster than that, and the readout has one-second resolution anyway.
  it("returns a new snapshot when an event lands in a later second", () => {
    __seed("conv-a", { running: true, lastEventAt: 1_000 });
    const first = dockedTurns();
    __seed("conv-a", { lastEventAt: 1_400 });
    expect(dockedTurns()).toBe(first);
    __seed("conv-a", { lastEventAt: 2_100 });
    expect(dockedTurns()).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------
// acknowledgeTurn
// ---------------------------------------------------------------------------

describe("acknowledgeTurn", () => {
  // A failed turn's chip cannot retire the way a ready one does. clearCompleted
  // DELIBERATELY preserves error/errorDetail -- for a harness failure that banner is the
  // only surviving trace, since picoclaw does not persist errors. So the dock tracks the
  // acknowledgement itself instead of clearing the error out from under the banner.
  it("retires a failed chip without touching the error", () => {
    __seed("conv-a", { running: false, error: "harness", errorDetail: "picoclaw said no" });
    expect(dockedTurns()).toHaveLength(1);

    acknowledgeTurn("conv-a");
    expect(dockedTurns()).toHaveLength(0);
    expect(getTurn("conv-a").error).toBe("harness");
    expect(getTurn("conv-a").errorDetail).toBe("picoclaw said no");
  });

  it("does not suppress a live turn", () => {
    __seed("conv-a", { running: true });
    acknowledgeTurn("conv-a");
    expect(dockedTurns()).toHaveLength(1);
  });

  // runTurn clears `error` when a new turn starts (turn-failure-visible: a send retires
  // the previous banner), so the same conversation can fail again later. A stale
  // acknowledgement would swallow that second failure silently.
  it("stops suppressing once a new turn runs on the conversation", () => {
    __seed("conv-a", { running: false, error: "turn_lost" });
    acknowledgeTurn("conv-a");
    expect(dockedTurns()).toHaveLength(0);

    __seed("conv-a", { running: true, error: null });
    expect(dockedTurns()).toHaveLength(1);

    __seed("conv-a", { running: false, error: "turn_lost" });
    expect(dockedTurns()).toHaveLength(1);
  });
});
