import { describe, it, expect } from "vitest";
import { toRows, rowRole, landingIndex, type ChatMessage } from "./message-rows";

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
