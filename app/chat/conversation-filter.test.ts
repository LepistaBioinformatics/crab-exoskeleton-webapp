import { describe, it, expect } from "vitest";
import { parseFilterQuery, isEmptyQuery, applySyncFilters } from "./conversation-filter";
import type { ConversationSummary } from "@/lib/chatSession";

// Fixed clock: 2026-07-19T12:00:00Z
const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);

describe("parseFilterQuery", () => {
  it("parses bare words as text", () => {
    expect(parseFilterQuery("hello world", NOW)).toMatchObject({
      tags: [], aliases: [], texts: ["hello", "world"], dates: [],
    });
  });

  it("parses tag/alias/text prefixes, tags repeatable", () => {
    const q = parseFilterQuery("tag:urgente tag:bug alias:cli text:deploy", NOW);
    expect(q.tags).toEqual(["urgente", "bug"]);
    expect(q.aliases).toEqual(["cli"]);
    expect(q.texts).toEqual(["deploy"]);
  });

  it("supports quoted values with spaces", () => {
    const q = parseFilterQuery('text:"pull request" alias:"my cli"', NOW);
    expect(q.texts).toEqual(["pull request"]);
    expect(q.aliases).toEqual(["my cli"]);
  });

  it("parses the 7d preset relative to now", () => {
    const q = parseFilterQuery("date:7d", NOW);
    expect(q.dates).toEqual([{ from: NOW - 7 * 86400000, to: NOW }]);
  });

  it("parses the today preset", () => {
    const q = parseFilterQuery("date:hoje", NOW);
    const start = new Date(NOW); start.setHours(0, 0, 0, 0);
    expect(q.dates[0].from).toBe(start.getTime());
    expect(q.dates[0].to).toBe(NOW);
  });

  it("parses a 4-digit year preset", () => {
    const q = parseFilterQuery("date:2026", NOW);
    expect(q.dates[0].from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
    expect(q.dates[0].to).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
  });

  it("parses an explicit range", () => {
    const q = parseFilterQuery("date:2026-01-01..2026-03-01", NOW);
    expect(q.dates[0].from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
    expect(q.dates[0].to).toBe(new Date(2026, 2, 1, 23, 59, 59, 999).getTime());
  });

  it("ignores an invalid date token", () => {
    expect(parseFilterQuery("date:notadate", NOW).dates).toEqual([]);
  });

  it("ignores empty prefixes and reports emptiness", () => {
    const q = parseFilterQuery("tag:  text:", NOW);
    expect(q.tags).toEqual([]);
    expect(q.texts).toEqual([]);
    expect(isEmptyQuery(q)).toBe(true);
  });
});

function makeConv(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "id", role: "picoclaw" as never, tenantId: "t", subsAccId: "s",
    title: "Title", updatedAt: NOW, alias: null, tags: [],
    sessionKey: null, sessionFile: null, ...over,
  };
}

describe("applySyncFilters", () => {
  const urgent = makeConv({ id: "u", tags: [{ name: "urgente", value: null, metadata: {} }] });
  const bug = makeConv({ id: "b", tags: [{ name: "bug", value: null, metadata: {} }] });
  const cli = makeConv({ id: "c", alias: "my-cli", tags: [{ name: "bug", value: null, metadata: {} }] });
  const old = makeConv({ id: "o", updatedAt: new Date(2020, 0, 1).getTime() });
  const all = [urgent, bug, cli, old];

  it("ORs within tags", () => {
    const q = parseFilterQuery("tag:urgente tag:bug", NOW);
    expect(applySyncFilters(all, q).map((c) => c.id)).toEqual(["u", "b", "c"]);
  });

  it("ANDs across types (tag AND alias)", () => {
    const q = parseFilterQuery("tag:bug alias:cli", NOW);
    expect(applySyncFilters(all, q).map((c) => c.id)).toEqual(["c"]);
  });

  it("filters by date range on updatedAt", () => {
    const q = parseFilterQuery("date:2020", NOW);
    expect(applySyncFilters(all, q).map((c) => c.id)).toEqual(["o"]);
  });

  it("ignores text tokens (handled by content stage)", () => {
    const q = parseFilterQuery("text:deploy", NOW);
    expect(applySyncFilters(all, q)).toHaveLength(all.length);
  });

  it("returns everything for an empty query", () => {
    expect(applySyncFilters(all, parseFilterQuery("", NOW))).toHaveLength(all.length);
  });
});
