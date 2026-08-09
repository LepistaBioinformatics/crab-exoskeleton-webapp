import { describe, it, expect } from "vitest";
import { parseFilterQuery, isEmptyQuery, applySyncFilters, applyContentFilter, matchesTextMeta, pickResumeCandidate } from "./conversation-filter";
import type { ConversationSummary } from "@/lib/chatSession";
import type { HistoryMessage } from "./history-cache";

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

  it("ignores a reversed date range", () => {
    expect(parseFilterQuery("date:2026-06-01..2026-01-01", NOW).dates).toEqual([]);
  });

  it("ignores empty prefixes and reports emptiness", () => {
    const q = parseFilterQuery("tag:  text:", NOW);
    expect(q.tags).toEqual([]);
    expect(q.texts).toEqual([]);
    expect(isEmptyQuery(q)).toBe(true);
  });

  it("keeps unrecognized-prefix tokens whole as text (e.g. time formats)", () => {
    expect(parseFilterQuery("10:30", NOW).texts).toEqual(["10:30"]);
  });

  it("keeps unrecognized-prefix tokens whole as text (e.g. note:foo)", () => {
    expect(parseFilterQuery("note:foo", NOW).texts).toEqual(["note:foo"]);
  });

  it("still correctly extracts values from recognized prefixes (regression)", () => {
    expect(parseFilterQuery("text:deploy", NOW).texts).toEqual(["deploy"]);
  });
});

function makeConv(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "id", role: "picoclaw" as never, tenantId: "t", subsAccId: "s",
    title: "Title", updatedAt: NOW, alias: null, tags: [],
    sessionKey: null, sessionFile: null, project: null, ...over,
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

describe("applyContentFilter", () => {
  const byTitle = makeConv({ id: "t", title: "Deploy notes" });
  const byContent = makeConv({ id: "m", title: "Random" });
  const noMatch = makeConv({ id: "n", title: "Random" });
  const histories: Record<string, HistoryMessage[]> = {
    m: [{ role: "user", content: "let's deploy tomorrow" }],
    n: [{ role: "user", content: "nothing here" }],
  };
  const load = async (c: ConversationSummary) => histories[c.id] ?? [];
  const live = new AbortController().signal;

  it("returns candidates unchanged when there are no text tokens", async () => {
    const out = await applyContentFilter([byTitle, byContent], [], load, live);
    expect(out).toHaveLength(2);
  });

  it("matches on title without loading history", async () => {
    const loadSpy = async () => {
      throw new Error("should not load");
    };
    const out = await applyContentFilter([byTitle], ["deploy"], loadSpy, live);
    expect(out.map((c) => c.id)).toEqual(["t"]);
  });

  it("matches on message content when title/alias miss", async () => {
    const out = await applyContentFilter([byContent, noMatch], ["deploy"], load, live);
    expect(out.map((c) => c.id)).toEqual(["m"]);
  });

  it("returns [] when aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await applyContentFilter([byContent], ["deploy"], load, ctrl.signal);
    expect(out).toEqual([]);
  });
});

describe("matchesTextMeta", () => {
  it("matches title or alias case-insensitively", () => {
    const c = makeConv({ title: "Deploy", alias: "prod-cli" });
    expect(matchesTextMeta(c, ["deploy"])).toBe(true);
    expect(matchesTextMeta(c, ["CLI"])).toBe(true);
    expect(matchesTextMeta(c, ["missing"])).toBe(false);
  });
});

describe("pickResumeCandidate", () => {
  // The bug this pins: the card offered the most recent conversation in the whole
  // workspace, so on the agent's own landing it could name a PROJECT conversation.
  // Opening it changed only `sid`, leaving `p` unset, so the transcript was read
  // from the main workspace and the member could not reach the chat at all.
  const globalOld = makeConv({ id: "g-old", title: "Global old", updatedAt: NOW - 3000 });
  const globalNew = makeConv({ id: "g-new", title: "Global new", updatedAt: NOW - 2000 });
  const projOld = makeConv({ id: "p-old", title: "Proj old", updatedAt: NOW - 1000, project: "alpha-proj" });
  const projNew = makeConv({ id: "p-new", title: "Proj new", updatedAt: NOW, project: "alpha-proj" });
  const otherProj = makeConv({ id: "x", title: "Other", updatedAt: NOW, project: "other-proj" });
  const all = [globalOld, globalNew, projOld, projNew, otherProj];

  it("on the agent's landing, picks the newest chat that belongs to NO project", () => {
    // projNew is newer than globalNew, and must still lose: it lives elsewhere.
    expect(pickResumeCandidate(all, undefined, null)?.id).toBe("g-new");
  });

  it("inside a project, picks the newest chat of THAT project", () => {
    expect(pickResumeCandidate(all, undefined, "alpha-proj")?.id).toBe("p-new");
  });

  it("does not leak one project's chat into another", () => {
    expect(pickResumeCandidate(all, undefined, "other-proj")?.id).toBe("x");
  });

  it("returns null when the scope has nothing to resume", () => {
    expect(pickResumeCandidate(all, undefined, "empty-proj")).toBeNull();
    expect(pickResumeCandidate([], undefined, null)).toBeNull();
  });

  it("excludes the conversation already open, and falls back to the next one", () => {
    expect(pickResumeCandidate(all, "g-new", null)?.id).toBe("g-old");
    expect(pickResumeCandidate(all, "p-new", "alpha-proj")?.id).toBe("p-old");
  });

  it("skips a freshly-minted empty chat, but keeps one that was labelled", () => {
    const fresh = makeConv({ id: "fresh", title: "New chat", updatedAt: NOW + 5000 });
    const aliased = makeConv({ id: "aliased", title: "New chat", alias: "wip", updatedAt: NOW + 6000 });
    expect(pickResumeCandidate([...all, fresh], undefined, null)?.id).toBe("g-new");
    expect(pickResumeCandidate([...all, fresh, aliased], undefined, null)?.id).toBe("aliased");
  });

  it("treats an absent project the same as an explicit null", () => {
    // The API omits the field for a main-agent conversation on older rows.
    const legacy = { ...makeConv({ id: "legacy", updatedAt: NOW + 1000 }) } as ConversationSummary;
    delete (legacy as { project?: unknown }).project;
    expect(pickResumeCandidate([legacy], undefined, null)?.id).toBe("legacy");
    expect(pickResumeCandidate([legacy], undefined, "alpha-proj")).toBeNull();
  });
});
