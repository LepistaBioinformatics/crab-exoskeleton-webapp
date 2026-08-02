import { describe, it, expect } from "vitest";
import {
  canDrop,
  dropTarget,
  isInsideReserved,
  isReservedFolder,
  RESERVED_FOLDER,
} from "./media";

// The drag rules, decided client-side so an illegal drop is refused with no round trip
// and no flicker. The proxy enforces the same rules independently — this is about not
// showing a drop indicator over a target that would be rejected.
describe("canDrop", () => {
  it("refuses dropping into the folder it already lives in", () => {
    expect(canDrop("reports/q1.pdf", "reports")).toBe(false);
    expect(canDrop("top.txt", "")).toBe(false);
  });

  it("allows a real move", () => {
    expect(canDrop("top.txt", "reports")).toBe(true);
    expect(canDrop("reports/q1.pdf", "")).toBe(true);
    expect(canDrop("reports/q1.pdf", "images")).toBe(true);
  });

  it("refuses a folder onto itself", () => {
    expect(canDrop("reports", "reports")).toBe(false);
  });

  it("refuses a folder into its own descendant", () => {
    expect(canDrop("reports", "reports/2026")).toBe(false);
    expect(canDrop("reports", "reports/2026/q2")).toBe(false);
  });

  // The separator is what makes this correct. Without it "reports" reads as an
  // ancestor of "reports-archive" and a legal move is silently forbidden — the same
  // trap the proxy's descendant check has, now tested on both sides.
  it("allows a folder into a sibling whose name shares its prefix", () => {
    expect(canDrop("reports", "reports-archive")).toBe(true);
  });

  it("refuses an empty source", () => {
    expect(canDrop("", "reports")).toBe(false);
  });
});

describe("dropTarget", () => {
  it("keeps the name and changes the parent", () => {
    expect(dropTarget("top.txt", "reports")).toBe("reports/top.txt");
    expect(dropTarget("reports/q1.pdf", "images")).toBe("images/q1.pdf");
  });

  it("drops to the root without a leading separator", () => {
    expect(dropTarget("reports/q1.pdf", "")).toBe("q1.pdf");
  });

  it("moves a whole folder by name", () => {
    expect(dropTarget("reports/2026", "images")).toBe("images/2026");
  });
});

// The system-managed folder. `attachments` is where the proxy puts files the AGENT
// produced, so a member renaming it would detach every future delivery. The proxy
// enforces this independently and answers 403 — these rules exist so the interface can
// hide the controls and refuse before the round trip.
describe("the reserved folder", () => {
  it("names attachments, and only at the top level", () => {
    expect(RESERVED_FOLDER).toBe("attachments");
    expect(isReservedFolder("attachments")).toBe(true);
    // A nested folder by that name is an ordinary folder the member owns. Forbidding
    // the word everywhere would be a rule about vocabulary, not about ownership.
    expect(isReservedFolder("reports/attachments")).toBe(false);
  });

  it("recognises paths inside it", () => {
    expect(isInsideReserved("attachments/from-agent.txt")).toBe(true);
    expect(isInsideReserved("attachments")).toBe(false);
    expect(isInsideReserved("attachments-old/x.txt")).toBe(false);
  });

  it("is neither draggable nor a drop target", () => {
    expect(canDrop("attachments", "reports")).toBe(false);
    expect(canDrop("attachments/from-agent.txt", "reports")).toBe(false);
    expect(canDrop("top.txt", "attachments")).toBe(false);
    expect(canDrop("reports", "attachments")).toBe(false);
  });

  // The separator again: a member folder whose name merely starts with the reserved
  // one is still theirs.
  it("does not capture a folder with a similar name", () => {
    expect(canDrop("top.txt", "attachments-old")).toBe(true);
    expect(isReservedFolder("attachments-old")).toBe(false);
  });
});
