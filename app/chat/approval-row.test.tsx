// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ApprovalRow from "./approval-row";
import { approvalRecord, type ApprovalRecord } from "./message-rows";
import { chatCopy } from "@/lib/i18n/chat";

// The row that replaces a card nobody could keep. A gated call used to leave
// the transcript exactly as it found it: the member's answer went to an audit
// file no screen reads, and a question nobody answered in time left nothing at
// all, because the proxy drops a request it never resolved.

const t = chatCopy.en;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(record: ApprovalRecord) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<ApprovalRow record={record} t={t} />);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const record = (over: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
  tool: "schedule_create",
  status: "ok",
  reason: "",
  args: '{"message":"regar as plantas"}',
  ...over,
});

describe("the approval divider", () => {
  it("says what the member allowed", () => {
    expect(render(record()).textContent).toContain("You allowed schedule_create");
  });

  it("says what the member refused", () => {
    expect(render(record({ status: "denied" })).textContent).toContain(
      "You refused schedule_create",
    );
  });

  // THE CASE THAT USED TO VANISH. The member stepped away, the harness refused
  // on its own deadline, and the only evidence was a turn that carried on
  // without doing the thing. "You refused" would be a lie about it.
  it("does not blame the member for a deadline they never saw", () => {
    const text = render(record({ status: "expired" })).textContent ?? "";
    expect(text).toContain("was not answered in time");
    expect(text).not.toContain("You refused");
  });

  it("separates an approver that broke from one nobody answered", () => {
    expect(render(record({ status: "failed" })).textContent).toContain(
      "could not be checked for permission",
    );
  });

  // The arguments are the whole of what was agreed to, so they are on the row
  // -- but behind the click, because a conversation is not a log.
  it("keeps the arguments out of the line and inside the disclosure", () => {
    const el = render(record());
    const summary = el.querySelector("summary");
    expect(summary?.textContent).not.toContain("regar as plantas");
    expect(el.querySelector("details")?.textContent).toContain("regar as plantas");
  });

  // The harness caps these at 200 runes, so what arrives may be a JSON document
  // with its tail cut off. Shown as the string it is; parsing it would throw on
  // exactly the longest, most interesting call.
  it("shows truncated arguments verbatim rather than parsing them", () => {
    const cut = '{"message":"uma mensagem muito long…';
    expect(render(record({ args: cut })).textContent).toContain(cut);
  });

  it("shows the member's own reason when they gave one", () => {
    const el = render(record({ status: "denied", reason: "nao quero isso agendado" }));
    expect(el.querySelector("details")?.textContent).toContain("nao quero isso agendado");
  });

  // A record from a harness that stored neither. A chevron that opens an empty
  // box is worse than a line that is only a line.
  it("offers nothing to open when there is nothing behind it", () => {
    const el = render(record({ args: "", reason: "" }));
    expect(el.querySelector("details")).toBeNull();
    expect(el.textContent).toContain("You allowed schedule_create");
  });

  // A transcript older than the tool name, or a harness that recorded none.
  it("names an action rather than leaving a gap where the tool goes", () => {
    expect(render(record({ tool: "" })).textContent).toContain("You allowed an action");
  });
});

describe("approvalRecord", () => {
  it("reads the decision off the entry", () => {
    const got = approvalRecord({
      role: "assistant",
      content: "",
      kind: "approval",
      events: [
        {
          kind: "approval",
          name: "schedule_create",
          status: "denied",
          detail: "nao quero",
          arguments: "{}",
        },
      ],
    });
    expect(got).toEqual({
      tool: "schedule_create",
      status: "denied",
      reason: "nao quero",
      args: "{}",
    });
  });

  // A status this client does not know still happened. Dropping the row would
  // claim nobody was ever asked; "failed" says the permission did not resolve,
  // which is the one thing every unknown code here has in common.
  it("falls back rather than dropping a decision it cannot name", () => {
    const got = approvalRecord({
      role: "assistant",
      content: "",
      kind: "approval",
      events: [{ kind: "approval", name: "sh", status: "something-new" }],
    });
    expect(got?.status).toBe("failed");
  });

  it("is null for an entry carrying no approval", () => {
    expect(
      approvalRecord({ role: "assistant", content: "", events: [{ kind: "tool", name: "sh" }] }),
    ).toBeNull();
  });
});
