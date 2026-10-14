import { describe, it, expect } from "vitest";
import { toRows, landingIndex, type ChatMessage } from "./message-rows";

const user = (content: string): ChatMessage => ({ role: "user", content });
const said = (content: string): ChatMessage => ({ role: "assistant", content });
const step = (content: string): ChatMessage => ({ role: "assistant", content, kind: "step" });

const approval = (status = "ok"): ChatMessage => ({
  role: "assistant",
  content: "",
  kind: "approval",
  events: [{ kind: "approval", name: "schedule_create", status, arguments: "{}" }],
});

// An approval record reaches the client in the SAME SHAPE as a silent tool call
// and as a compaction record -- an entry with no content carrying events -- and
// only the kind the proxy assigned separates the three. Folded into a run it
// would be a decision the member made, hidden inside "3 steps".
describe("toRows — an approval record", () => {
  it("stands on its own row rather than joining a run of steps", () => {
    const rows = toRows([user("agenda isso"), step("vou agendar"), approval(), said("pronto")]);
    expect(rows.map((r) => r.row)).toEqual(["message", "steps", "approval", "message"]);
  });

  it("breaks a run of steps in two, because it happened between them", () => {
    const rows = toRows([step("um"), approval("denied"), step("dois")]);
    expect(rows.map((r) => r.row)).toEqual(["steps", "approval", "steps"]);
  });

  it("carries the original index, so a tree anchor still lands on it", () => {
    const rows = toRows([user("oi"), approval()]);
    const row = rows[1];
    expect(row.row).toBe("approval");
    expect(row.row === "approval" && row.i).toBe(1);
  });

  // The harness writes the record AFTER the iteration's events entry, so that
  // entry still folds into the narration before it. One iteration stays one
  // step on screen, with the divider after it.
  it("leaves the iteration's own merge alone when it follows the events", () => {
    const events: ChatMessage = {
      role: "assistant",
      content: "",
      kind: "step",
      events: [{ kind: "tool", name: "schedule_create", status: "ok" }],
    };
    const rows = toRows([step("vou agendar"), events, approval(), said("pronto")]);
    expect(rows.map((r) => r.row)).toEqual(["steps", "approval", "message"]);
    const run = rows[0];
    expect(run.row === "steps" && run.items).toHaveLength(1);
  });
});

describe("landingIndex", () => {
  // Opening a conversation on "you allowed schedule_create" lands the member
  // beside the transcript instead of in it, the same reason a compaction
  // divider is skipped.
  it("skips an approval record and lands on what was said", () => {
    expect(landingIndex([user("oi"), said("pronto"), approval()])).toBe(1);
  });
});
