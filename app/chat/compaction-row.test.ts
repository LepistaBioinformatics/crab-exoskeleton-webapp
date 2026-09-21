import { describe, it, expect } from "vitest";
import { toRows, landingIndex, compactedCount, type ChatMessage } from "./message-rows";

const user = (content: string): ChatMessage => ({ role: "user", content });
const said = (content: string): ChatMessage => ({ role: "assistant", content });
const step = (content: string): ChatMessage => ({ role: "assistant", content, kind: "step" });

const compaction = (count?: number): ChatMessage => ({
  role: "assistant",
  content: "",
  kind: "compaction",
  events: [
    {
      kind: "compact",
      count,
      detail: "[12 earlier messages are not in this window; the full transcript is preserved]",
    },
  ],
});

// A compaction record reaches the client in the SAME SHAPE as a silent tool
// call -- an entry with no content carrying events -- and the only thing
// separating them is the kind the proxy assigned. Folded into a step run it
// would disappear into "3 steps".
describe("toRows — a compaction record", () => {
  it("stands on its own row rather than joining a run of steps", () => {
    const rows = toRows([user("oi"), step("vou ver"), compaction(12), said("pronto")]);
    expect(rows.map((r) => r.row)).toEqual(["message", "steps", "compaction", "message"]);
  });

  it("breaks a run of steps in two, because it happened between them", () => {
    const rows = toRows([step("um"), compaction(4), step("dois")]);
    expect(rows.map((r) => r.row)).toEqual(["steps", "compaction", "steps"]);
  });

  it("carries the original index, so a tree anchor still lands on it", () => {
    const rows = toRows([user("oi"), compaction(4)]);
    const row = rows[1];
    expect(row.row).toBe("compaction");
    expect(row.row === "compaction" && row.i).toBe(1);
  });

  it("leaves an ordinary events entry as a step", () => {
    const silent: ChatMessage = {
      role: "assistant",
      content: "",
      kind: "step",
      events: [{ kind: "tool", name: "sh", status: "ok" }],
    };
    const rows = toRows([user("oi"), silent]);
    expect(rows.map((r) => r.row)).toEqual(["message", "steps"]);
  });
});

// Opening a conversation on "12 earlier messages were compacted" lands the
// member on a note about the transcript instead of on the transcript.
describe("landingIndex", () => {
  it("never lands on a compaction divider", () => {
    expect(landingIndex([user("oi"), said("pronto"), compaction(12)])).toBe(1);
  });

  it("still lands on a real answer that follows one", () => {
    expect(landingIndex([user("oi"), compaction(12), said("pronto")])).toBe(2);
  });
});

describe("compactedCount", () => {
  it("reads the count the harness recorded", () => {
    expect(compactedCount(compaction(12))).toBe(12);
  });

  // Zero is rendered as the divider WITHOUT a count. "0 messages" would claim
  // something false about an event that did happen.
  it("reports zero when the record did not say", () => {
    expect(compactedCount(compaction(undefined))).toBe(0);
  });

  it("reports zero for a message that is not a compaction record", () => {
    expect(compactedCount(said("pronto"))).toBe(0);
  });
});
