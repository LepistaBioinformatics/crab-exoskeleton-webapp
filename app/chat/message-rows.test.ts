import { describe, it, expect } from "vitest";
import {
  toRows,
  rowRole,
  landingIndex,
  type ChatMessage,
  type TurnEvent,
} from "./message-rows";

const user = (content: string): ChatMessage => ({ role: "user", content });
const answer = (content: string): ChatMessage => ({ role: "assistant", content });
const step = (content: string, reasoning?: string): ChatMessage => ({
  role: "assistant",
  content,
  kind: "step",
  reasoning,
});

describe("toRows", () => {
  it("leaves a transcript with no steps untouched", () => {
    const rows = toRows([user("q"), answer("a")]);
    expect(rows.map((r) => r.row)).toEqual(["message", "message"]);
  });

  it("collapses consecutive steps into one row", () => {
    const rows = toRows([user("q"), step("s1"), step("s2"), step("s3"), answer("a")]);
    expect(rows.map((r) => r.row)).toEqual(["message", "steps", "message"]);
    expect(rows[1].row === "steps" && rows[1].items).toHaveLength(3);
  });

  it("keeps runs separated by an answer as distinct blocks", () => {
    const rows = toRows([step("s1"), answer("a"), step("s2")]);
    expect(rows.map((r) => r.row)).toEqual(["steps", "message", "steps"]);
  });

  // Scroll refs and the tree's `msg` anchor are keyed by the message's index in
  // the ORIGINAL array; losing it would silently break scroll-to-message.
  it("carries the original index through the grouping", () => {
    const rows = toRows([user("q"), step("s1"), step("s2"), answer("a")]);
    expect(rows[1].row === "steps" && rows[1].items.map((x) => x.i)).toEqual([1, 2]);
    expect(rows[2].row === "message" && rows[2].i).toBe(3);
  });

  it("keeps a step that carries only reasoning", () => {
    const rows = toRows([step("", "weighing options")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].row === "steps" && rows[0].items[0].m.reasoning).toBe("weighing options");
  });

  it("treats an unmarked assistant message as an answer", () => {
    const rows = toRows([{ role: "assistant", content: "a", kind: undefined }]);
    expect(rows[0].row).toBe("message");
  });
});

describe("landingIndex", () => {
  it("lands on the last message when it is an answer", () => {
    expect(landingIndex([user("q"), step("s"), answer("a")])).toBe(2);
  });

  // A transcript can end on narration -- the agent narrating after answering, or
  // a reasoning-only step, which is never promoted back to an answer. Landing
  // there would open the conversation on a collapsed block.
  it("skips back past trailing steps", () => {
    expect(landingIndex([user("q"), answer("a"), step("s1"), step("s2")])).toBe(1);
  });

  it("falls back to the last entry when everything is a step", () => {
    expect(landingIndex([step("s1"), step("s2")])).toBe(1);
  });

  it("reports -1 for an empty transcript", () => {
    expect(landingIndex([])).toBe(-1);
  });
});

describe("rowRole", () => {
  // A run spaces as ONE assistant block; computing the neighbours' padding
  // against the several messages inside it is what the grouping exists to avoid.
  it("reports a step run as the assistant", () => {
    const rows = toRows([step("s1"), step("s2")]);
    expect(rowRole(rows[0])).toBe("assistant");
  });

  it("reports a message row as its own speaker", () => {
    const rows = toRows([user("q"), answer("a")]);
    expect(rows.map(rowRole)).toEqual(["user", "assistant"]);
  });
});

// An ITERATION is one step on screen, and the harness writes it as two entries:
// the narration before the tools run (so it survives a turn that dies inside
// one) and the events after (so they can say how each call ended).
describe("toRows — an iteration's events", () => {
  const narration = (content: string, events?: TurnEvent[]): ChatMessage => ({
    role: "assistant",
    content,
    kind: "step",
    ...(events ? { events } : {}),
  });
  const eventsOnly = (events: TurnEvent[]): ChatMessage => ({
    role: "assistant",
    content: "",
    kind: "step",
    events,
  });
  const ran = (name: string): TurnEvent => ({ kind: "tool", name, status: "ok" });

  it("folds an events entry into the step it belongs to", () => {
    const rows = toRows([
      { role: "user", content: "oi" },
      narration("vou ver"),
      eventsOnly([ran("sh")]),
      { role: "assistant", content: "pronto" },
    ]);
    const steps = rows.find((r) => r.row === "steps");
    if (steps?.row !== "steps") throw new Error("no step run");
    // ONE item, not two. Otherwise a fourteen-iteration turn reads as "28 steps"
    // and landingIndex walks back over twice as many rows looking for the answer.
    expect(steps.items).toHaveLength(1);
    expect(steps.items[0].m.content).toBe("vou ver");
    expect(steps.items[0].events).toEqual([ran("sh")]);
  });

  it("counts one step per iteration, however many entries it took", () => {
    const rows = toRows([
      narration("um"),
      eventsOnly([ran("a")]),
      narration("dois"),
      eventsOnly([ran("b")]),
    ]);
    const steps = rows[0];
    if (steps.row !== "steps") throw new Error("no step run");
    expect(steps.items).toHaveLength(2);
    expect(steps.items.map((i) => i.m.content)).toEqual(["um", "dois"]);
  });

  // The silent tool call this whole feature exists to recover: the very first
  // iteration narrated nothing, so there is no step in front of it to fold into.
  // Dropping it would hide exactly the work that was invisible before.
  it("keeps an events entry that has no step before it", () => {
    const rows = toRows([
      { role: "user", content: "oi" },
      eventsOnly([ran("sh")]),
      { role: "assistant", content: "pronto" },
    ]);
    const steps = rows.find((r) => r.row === "steps");
    if (steps?.row !== "steps") throw new Error("the silent call vanished");
    expect(steps.items).toHaveLength(1);
    expect(steps.items[0].events).toEqual([ran("sh")]);
  });

  // A narration frame names the tools it asked for; its own iteration's events
  // then arrive with the outcomes. Both belong to the one step.
  it("appends to events the step already carried", () => {
    const rows = toRows([narration("vou ver", [{ kind: "tool", name: "sh" }]), eventsOnly([ran("sh")])]);
    const steps = rows[0];
    if (steps.row !== "steps") throw new Error("no step run");
    expect(steps.items[0].events).toEqual([{ kind: "tool", name: "sh" }, ran("sh")]);
  });

  // The answer is still what a conversation opens on. An events entry is a step,
  // so it must not become the landing row.
  it("never lands on an events entry", () => {
    const messages = [
      { role: "user" as const, content: "oi" },
      { role: "assistant" as const, content: "pronto" },
      eventsOnly([ran("sh")]),
    ];
    expect(landingIndex(messages)).toBe(1);
  });
});
