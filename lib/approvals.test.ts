import { describe, it, expect } from "vitest";
import { describeSchedule, humanInterval, rawArguments } from "./approvals";

describe("describeSchedule", () => {
  it("reads a cron schedule the way a person would", () => {
    expect(
      describeSchedule({ kind: "cron", expr: "0 7 * * 1", message: "weekly report" }),
    ).toEqual({ what: "weekly report", when: "0 7 * * 1" });
  });

  it("keeps the timezone beside the expression, since it changes when it fires", () => {
    const out = describeSchedule({
      kind: "cron",
      expr: "0 7 * * 1",
      tz: "America/Sao_Paulo",
      message: "weekly report",
    });
    expect(out?.when).toBe("0 7 * * 1 (America/Sao_Paulo)");
  });

  it("states an interval in the largest unit that divides evenly", () => {
    expect(describeSchedule({ kind: "every", everyMs: 3600000, message: "x" })?.when).toBe("1h");
  });

  // The member is being asked to allow something, so a request with no message
  // is one the card cannot describe -- and it falls back to the raw arguments
  // rather than rendering an empty card.
  it("is null when there is nothing to describe", () => {
    expect(describeSchedule({ kind: "cron", expr: "0 7 * * 1" })).toBeNull();
    expect(describeSchedule(null)).toBeNull();
    expect(describeSchedule("not an object")).toBeNull();
  });

  // An unrecognised kind still names what would run. Hiding the message because
  // the schedule was unfamiliar would hide the part that matters most.
  it("still says what would run when the schedule kind is unfamiliar", () => {
    expect(describeSchedule({ kind: "phase-of-the-moon", message: "x" })).toEqual({
      what: "x",
      when: "",
    });
  });
});

describe("humanInterval", () => {
  it("uses days, hours or minutes, largest first", () => {
    expect(humanInterval(86400000)).toBe("1d");
    expect(humanInterval(7200000)).toBe("2h");
    expect(humanInterval(900000)).toBe("15min");
  });

  it("falls back to minutes when nothing divides evenly", () => {
    expect(humanInterval(5400000)).toBe("90min");
  });
});

describe("rawArguments", () => {
  it("renders what the card cannot describe", () => {
    expect(rawArguments({ a: 1 })).toContain('"a": 1');
  });

  // A circular structure must not take down the card that exists to show the
  // member what they are allowing.
  it("survives something it cannot serialise", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(rawArguments(loop)).toBe("");
  });
});
