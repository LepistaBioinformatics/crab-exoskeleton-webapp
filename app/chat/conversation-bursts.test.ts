import { describe, it, expect } from "vitest";
import {
  buildEvents,
  aggregateBursts,
  laneColorFor,
  type TreeEvent,
  type Burst,
} from "./conversation-bursts";
import type { ConversationSummary } from "@/lib/chatSession";
import type { HistoryMessage } from "./history-cache";

function conv(id: string, updatedAt: number, extra: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id, role: "picoclaw" as never, tenantId: "t1", subsAccId: "s1",
    title: "T", updatedAt, alias: null, tags: [], sessionKey: null, sessionFile: null,
    ...extra,
  };
}
const iso = (n: number) => new Date(n).toISOString();
const msg = (content: string, created_at?: string): HistoryMessage => ({ role: "user", content, created_at });

describe("buildEvents", () => {
  it("orders most-recent first across conversations by parsed instant", () => {
    const events = buildEvents([
      { c: conv("a", 0), messages: [msg("a1", iso(1000))] },
      { c: conv("b", 0), messages: [msg("b1", iso(2000))] },
    ]);
    expect(events.map((e) => e.content)).toEqual(["b1", "a1"]);
  });

  it("breaks same-conversation ties by line order (later line = more recent)", () => {
    const t = iso(1000);
    const events = buildEvents([{ c: conv("a", 0), messages: [msg("a1", t), msg("a2", t)] }]);
    expect(events.map((e) => e.content)).toEqual(["a2", "a1"]);
  });

  it("falls back to updatedAt + seq when created_at is missing/unparseable", () => {
    const events = buildEvents([
      { c: conv("a", 5000), messages: [msg("x"), msg("y", "not-a-date")] },
    ]);
    const x = events.find((e) => e.content === "x")!;
    const y = events.find((e) => e.content === "y")!;
    expect(x.ts).toBe(5000); // updatedAt + seq(0)
    expect(y.ts).toBe(5001); // updatedAt + seq(1)
    expect(x.createdAt).toBe(""); // no raw timestamp
  });

  it("uses alias as the label when present, else the title", () => {
    const events = buildEvents([
      { c: conv("a", 0, { alias: "My chat", title: "auto title" }), messages: [msg("a1", iso(1))] },
      { c: conv("b", 0, { alias: null, title: "auto title B" }), messages: [msg("b1", iso(2))] },
    ]);
    expect(events.find((e) => e.conversationId === "a")!.label).toBe("My chat");
    expect(events.find((e) => e.conversationId === "b")!.label).toBe("auto title B");
  });
});

describe("aggregateBursts", () => {
  it("collapses a consecutive same-conversation run into one burst", () => {
    const events = buildEvents([
      { c: conv("a", 0), messages: [msg("m1", iso(1000)), msg("m2", iso(2000)), msg("m3", iso(3000))] },
    ]);
    const bursts = aggregateBursts(events);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].count).toBe(3);
    expect(bursts[0].text).toBe("m3"); // most-recent message shown
    expect(bursts[0].anchor).toBe(iso(3000)); // scroll target = most recent
    expect(bursts[0].startAnchor).toBe(iso(1000)); // oldest of the run
  });

  it("keeps interleaved visits to the same conversation as separate bursts", () => {
    // A(recent) → B → A(old): A appears twice because B fell between them in time.
    const events = buildEvents([
      { c: conv("a", 0), messages: [msg("a-old", iso(1000)), msg("a-new", iso(3000))] },
      { c: conv("b", 0), messages: [msg("b", iso(2000))] },
    ]);
    const bursts = aggregateBursts(events);
    expect(bursts.map((x) => x.conversationId)).toEqual(["a", "b", "a"]);
  });

  it("marks only the most-recent visit of each conversation as isLatest", () => {
    const events: TreeEvent[] = [
      { conversationId: "a", label: "A", content: "a2", createdAt: iso(3000), ts: 3000, seq: 1 },
      { conversationId: "b", label: "B", content: "b1", createdAt: iso(2000), ts: 2000, seq: 0 },
      { conversationId: "a", label: "A", content: "a1", createdAt: iso(1000), ts: 1000, seq: 0 },
    ];
    const bursts = aggregateBursts(events);
    expect(bursts.map((x) => x.isLatest)).toEqual([true, true, false]);
  });
});

describe("laneColorFor", () => {
  it("uses the first tag color when set", () => {
    const c = conv("a", 0, { tags: [{ name: "x", value: "v", metadata: { color: "#abcdef" } }] });
    expect(laneColorFor(c, "a")).toBe("#abcdef");
  });

  it("falls back to a stable golden-angle hsl when no tag color", () => {
    const first = laneColorFor(conv("zzz", 0), "zzz");
    const again = laneColorFor(conv("zzz", 0), "zzz");
    expect(first).toMatch(/^hsl\(/);
    expect(again).toBe(first); // deterministic per id
  });
});
