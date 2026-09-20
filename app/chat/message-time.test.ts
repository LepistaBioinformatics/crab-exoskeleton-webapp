import { describe, it, expect } from "vitest";
import { messageTime } from "./message-time";

const NOW = new Date("2026-09-19T21:00:00Z");

describe("messageTime", () => {
  // BOTH, on every message. A thread that ran across an evening and picked up
  // the next morning cannot be followed on the clock alone.
  it("carries the date and the time, today included", () => {
    const out = messageTime("2026-09-19T14:32:00Z", "en-US", NOW);
    expect(out?.label).toMatch(/Sep/);
    expect(out?.label).toMatch(/\d{1,2}:\d{2}/);
  });

  it("carries both for an older message too", () => {
    const out = messageTime("2026-09-17T14:32:00Z", "en-US", NOW);
    expect(out?.label).toMatch(/Sep/);
    expect(out?.label).toMatch(/\d{1,2}:\d{2}/);
  });

  // The year would double the label's width to disambiguate a case that almost
  // never arises, so it appears only when it actually disambiguates something.
  it("leaves the year out this year and puts it in for another", () => {
    expect(messageTime("2026-09-17T14:32:00Z", "en-US", NOW)?.label).not.toMatch(/202\d/);
    expect(messageTime("2024-09-17T14:32:00Z", "en-US", NOW)?.label).toMatch(/2024/);
  });

  // The short label is for scanning; the title is for answering. So the full
  // instant is there even when the label is only a time.
  it("always carries the whole instant for the title", () => {
    const out = messageTime("2026-09-19T14:32:00Z", "en-US", NOW);
    expect(out?.full).toMatch(/September/);
    expect(out?.full).toMatch(/\d{1,2}:\d{2}/);
  });

  it("carries a machine-readable instant for <time dateTime>", () => {
    expect(messageTime("2026-09-19T14:32:00Z", "en-US", NOW)?.machine).toBe(
      "2026-09-19T14:32:00.000Z",
    );
  });

  it("follows the reader's locale rather than the machine's", () => {
    const en = messageTime("2026-09-17T14:32:00Z", "en-US", NOW);
    const pt = messageTime("2026-09-17T14:32:00Z", "pt-BR", NOW);
    expect(en?.label).not.toBe(pt?.label);
  });

  // NULL, NOT "NOW". A message with no recorded time is ordinary -- the
  // transcript field is optional and a streaming message has not been written
  // yet -- and a timestamp that is not a fact about the message is worse than
  // none, because a reader cannot tell the difference.
  it("is null when there is nothing trustworthy to show", () => {
    expect(messageTime(undefined, "en-US", NOW)).toBeNull();
    expect(messageTime("", "en-US", NOW)).toBeNull();
    expect(messageTime("   ", "en-US", NOW)).toBeNull();
    expect(messageTime("not a date", "en-US", NOW)).toBeNull();
  });
});
