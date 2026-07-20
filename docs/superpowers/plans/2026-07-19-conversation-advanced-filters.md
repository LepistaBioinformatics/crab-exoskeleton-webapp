# Advanced Conversation Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag/alias/text/date filtering to the chat conversation sidebar, working in both list and tree views, driven by clickable pills plus GitHub-style inline autocomplete.

**Architecture:** A pure filter module (`conversation-filter.ts`) parses the searchbox string into structured tokens and applies them in two stages — a synchronous predicate over `ConversationSummary` (tag/alias/date), then an async content stage (`text:`) that runs only over survivors, reading message history from a shared cache extracted from the tree view. A new `conversation-search-bar.tsx` renders the pills + autocomplete and lives at the top of `HistorySidebar`, feeding both modes.

**Tech Stack:** Next 15 (App Router), React 19, TypeScript 5.7, Tailwind v4 + class-variance-authority, lucide-react. Tests via Vitest (added in Task 0). No react-query.

## Global Constraints

- Node `>=20`.
- Path alias `@/` maps to repo root (see `tsconfig.json`).
- No new runtime dependencies beyond what's listed; test tooling is `devDependencies` only.
- Styling: Tailwind utility classes + `cva` for variants; combine classes with `cn()` from `lib/cn.ts`. Per-item dynamic colors (tag colors) use inline `style`, matching `TagChip`.
- Autocomplete suggestions are derived **only from the in-memory `conversations` array** — no API calls.
- Filter combination semantics: **AND across types, OR within a type**.
- `tag:` matches tag **name** (case-insensitive substring). `alias:`/`text:` are case-insensitive substrings. `text:` searches title + alias + message content. Date filters apply to `updatedAt`.

---

### Task 0: Test tooling (Vitest)

**Files:**
- Modify: `package.json` (add devDeps + `test` scripts)
- Create: `vitest.config.ts`
- Create: `test/smoke.test.ts` (temporary, deleted at end of task)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (single run) and `npm run test:watch` runners; `vitest` importable in `*.test.ts`.

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
npm install -D vitest@^2 @vitejs/plugin-react@^4 jsdom@^25
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and verify it passes**

Run: `npm test`
Expected: 1 passing test (`test/smoke.test.ts`).

- [ ] **Step 6: Remove the smoke test and commit**

```bash
rm test/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(test): add vitest tooling"
```

---

### Task 1: Shared history cache module

Extract the tree's module-level `historyCache` into a reusable module so the content-filter stage and the tree read from one place.

**Files:**
- Create: `app/chat/history-cache.ts`
- Modify: `app/chat/conversation-tree.tsx` (remove local `HistoryMessage`/`historyCache`, use the module)

**Interfaces:**
- Consumes: `Workspace` (`@/app/chat/fragment`), `ConversationSummary` (`@/lib/chatSession`), `historyQuery` (`@/app/chat/fragment`).
- Produces:
  - `interface HistoryMessage { role: string; content: string; created_at?: string }`
  - `getHistory(workspace: Workspace, conversation: ConversationSummary, force?: boolean): Promise<HistoryMessage[]>` — returns cached messages when `cached.updatedAt >= conversation.updatedAt` and `force` is false; otherwise fetches `/api/chat/{role}/history`, caches, and returns. Returns `[]` on non-ok/exception.
  - `clearHistoryCache(): void` — test helper that empties the cache.

- [ ] **Step 1: Create `app/chat/history-cache.ts`**

```ts
import { historyQuery, type Workspace } from "./fragment";
import type { ConversationSummary } from "@/lib/chatSession";

export interface HistoryMessage {
  role: string;
  content: string;
  created_at?: string;
}

// Module-level cache keyed by conversation id, reused across List<->Tree toggles
// and the content-filter stage so flipping views or typing doesn't refetch.
// Invalidated per conversation once its updatedAt advances (a new message).
const historyCache = new Map<string, { updatedAt: number; messages: HistoryMessage[] }>();

export function clearHistoryCache(): void {
  historyCache.clear();
}

// `force` re-pulls even when updatedAt is unchanged -- used for the active
// conversation, whose completed turn doesn't advance updatedAt.
export async function getHistory(
  workspace: Workspace,
  conversation: ConversationSummary,
  force = false,
): Promise<HistoryMessage[]> {
  const cached = historyCache.get(conversation.id);
  if (!force && cached && cached.updatedAt >= conversation.updatedAt) {
    return cached.messages;
  }
  try {
    const res = await fetch(
      `/api/chat/${conversation.role}/history?${historyQuery(workspace, conversation.id)}`,
    );
    if (!res.ok) return cached?.messages ?? [];
    const data = await res.json();
    const messages: HistoryMessage[] = Array.isArray(data.messages) ? data.messages : [];
    historyCache.set(conversation.id, { updatedAt: conversation.updatedAt, messages });
    return messages;
  } catch {
    return cached?.messages ?? [];
  }
}
```

- [ ] **Step 2: Write a test for cache reuse**

Create `app/chat/history-cache.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getHistory, clearHistoryCache } from "./history-cache";
import type { ConversationSummary } from "@/lib/chatSession";

const workspace = { t: "t1", s: "s1", r: "picoclaw" } as never;

function conv(id: string, updatedAt: number): ConversationSummary {
  return {
    id, role: "picoclaw" as never, tenantId: "t1", subsAccId: "s1",
    title: "T", updatedAt, alias: null, tags: [], sessionKey: null, sessionFile: null,
  };
}

describe("getHistory", () => {
  beforeEach(() => clearHistoryCache());
  afterEach(() => vi.restoreAllMocks());

  it("fetches once then serves from cache for the same updatedAt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ role: "user", content: "hello" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getHistory(workspace, conv("a", 100));
    const second = await getHistory(workspace, conv("a", 100));

    expect(first).toEqual([{ role: "user", content: "hello" }]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when updatedAt advances", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, json: async () => ({ messages: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await getHistory(workspace, conv("a", 100));
    await getHistory(workspace, conv("a", 200));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns [] on non-ok without a prior cache entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await getHistory(workspace, conv("z", 1))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test -- history-cache`
Expected: 3 passing tests.

- [ ] **Step 4: Refactor `conversation-tree.tsx` to use the module**

In `app/chat/conversation-tree.tsx`:

Remove the local `HistoryMessage` interface (lines 21-25) and the local `historyCache` declaration (line 102). Add to the imports near the top:
```ts
import { getHistory, type HistoryMessage } from "./history-cache";
```

Replace the per-conversation fetch block inside the effect (the `conversations.map(async (c) => { ... })` body that reads/writes `historyCache` and calls `fetch`) with:
```ts
        conversations.map(async (c) => {
          const messages = await getHistory(workspace, c, c.id === active);
          return { c, messages };
        }),
```

- [ ] **Step 5: Verify build/lint and the tree still compiles**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors referencing `conversation-tree.tsx` or `history-cache.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/chat/history-cache.ts app/chat/history-cache.test.ts app/chat/conversation-tree.tsx
git commit -m "refactor(chat): extract shared history cache from tree view"
```

---

### Task 2: Filter query parser

**Files:**
- Create: `app/chat/conversation-filter.ts`
- Create: `app/chat/conversation-filter.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface DateFilter { from: number | null; to: number | null }` — inclusive ms-epoch bounds; `null` means unbounded on that side.
  - `interface FilterQuery { tags: string[]; aliases: string[]; texts: string[]; dates: DateFilter[] }`
  - `parseFilterQuery(input: string, now: number): FilterQuery`
  - `isEmptyQuery(q: FilterQuery): boolean`

- [ ] **Step 1: Write the failing parser test**

Create `app/chat/conversation-filter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseFilterQuery, isEmptyQuery } from "./conversation-filter";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- conversation-filter`
Expected: FAIL with "Cannot find module './conversation-filter'".

- [ ] **Step 3: Implement the parser**

Create `app/chat/conversation-filter.ts`:
```ts
export interface DateFilter {
  from: number | null; // inclusive ms epoch, null = unbounded
  to: number | null; // inclusive ms epoch, null = unbounded
}

export interface FilterQuery {
  tags: string[];
  aliases: string[];
  texts: string[];
  dates: DateFilter[];
}

// Split on whitespace but keep "quoted values" together.
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /[^\s"]+"[^"]*"|"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) tokens.push(m[0]);
  return tokens;
}

function unquote(value: string): string {
  const q = value.indexOf('"');
  if (q === -1) return value.trim();
  return value.slice(q + 1, value.lastIndexOf('"'));
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseDate(raw: string, now: number): DateFilter | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (value === "hoje" || value === "today") return { from: startOfDay(now), to: now };

  const daysMatch = /^(\d+)d$/.exec(value);
  if (daysMatch) return { from: now - Number(daysMatch[1]) * 86400000, to: now };

  if (/^\d{4}$/.test(value)) {
    const y = Number(value);
    return {
      from: new Date(y, 0, 1, 0, 0, 0, 0).getTime(),
      to: new Date(y, 11, 31, 23, 59, 59, 999).getTime(),
    };
  }

  const range = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (range) {
    const from = new Date(`${range[1]}T00:00:00`);
    const to = new Date(`${range[2]}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return { from: from.getTime(), to: to.getTime() };
  }

  return null;
}

export function parseFilterQuery(input: string, now: number): FilterQuery {
  const query: FilterQuery = { tags: [], aliases: [], texts: [], dates: [] };
  for (const token of tokenize(input)) {
    const colon = token.indexOf(":");
    const prefix = colon > 0 ? token.slice(0, colon).toLowerCase() : "";
    const rawValue = colon > 0 ? unquote(token.slice(colon + 1)) : unquote(token);
    const value = rawValue.trim();

    switch (prefix) {
      case "tag":
        if (value) query.tags.push(value);
        break;
      case "alias":
        if (value) query.aliases.push(value);
        break;
      case "text":
        if (value) query.texts.push(value);
        break;
      case "date": {
        const df = parseDate(value, now);
        if (df) query.dates.push(df);
        break;
      }
      default:
        if (value) query.texts.push(value);
    }
  }
  return query;
}

export function isEmptyQuery(q: FilterQuery): boolean {
  return q.tags.length === 0 && q.aliases.length === 0 && q.texts.length === 0 && q.dates.length === 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- conversation-filter`
Expected: all parser tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/chat/conversation-filter.ts app/chat/conversation-filter.test.ts
git commit -m "feat(chat): add conversation filter query parser"
```

---

### Task 3: Synchronous filter predicate

Add the tag/alias/date predicate to `conversation-filter.ts`. AND across types, OR within a type.

**Files:**
- Modify: `app/chat/conversation-filter.ts`
- Modify: `app/chat/conversation-filter.test.ts`

**Interfaces:**
- Consumes: `FilterQuery`, `ConversationSummary` (`@/lib/chatSession`).
- Produces: `applySyncFilters(conversations: ConversationSummary[], query: FilterQuery): ConversationSummary[]` — filters on tag name / alias / updatedAt. **Text tokens are ignored here** (handled by the async content stage in Task 4).

- [ ] **Step 1: Add the failing predicate test**

Append to `app/chat/conversation-filter.test.ts`:
```ts
import { applySyncFilters } from "./conversation-filter";
import type { ConversationSummary } from "@/lib/chatSession";

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
  const old = makeConv({ id: "o", updatedAt: Date.UTC(2020, 0, 1) });
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- conversation-filter`
Expected: FAIL with "applySyncFilters is not a function".

- [ ] **Step 3: Implement the predicate**

Add to `app/chat/conversation-filter.ts`:
```ts
import type { ConversationSummary } from "@/lib/chatSession";

function matchesTags(conv: ConversationSummary, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const names = conv.tags.map((t) => t.name.toLowerCase());
  return tags.some((needle) => names.some((n) => n.includes(needle.toLowerCase())));
}

function matchesAliases(conv: ConversationSummary, aliases: string[]): boolean {
  if (aliases.length === 0) return true;
  const alias = (conv.alias ?? "").toLowerCase();
  return aliases.some((needle) => alias.includes(needle.toLowerCase()));
}

function matchesDates(conv: ConversationSummary, dates: DateFilter[]): boolean {
  if (dates.length === 0) return true;
  return dates.some(
    (d) => (d.from === null || conv.updatedAt >= d.from) && (d.to === null || conv.updatedAt <= d.to),
  );
}

export function applySyncFilters(
  conversations: ConversationSummary[],
  query: FilterQuery,
): ConversationSummary[] {
  return conversations.filter(
    (c) =>
      matchesTags(c, query.tags) &&
      matchesAliases(c, query.aliases) &&
      matchesDates(c, query.dates),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- conversation-filter`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/chat/conversation-filter.ts app/chat/conversation-filter.test.ts
git commit -m "feat(chat): add synchronous tag/alias/date predicate"
```

---

### Task 4: Async content stage

Add the `text:` content matcher. It runs only over survivors, checks title/alias first (no fetch), and only fetches history when needed. OR within text tokens.

**Files:**
- Modify: `app/chat/conversation-filter.ts`
- Modify: `app/chat/conversation-filter.test.ts`

**Interfaces:**
- Consumes: `ConversationSummary`, `HistoryMessage` (`@/app/chat/history-cache`), `FilterQuery`.
- Produces:
  - `matchesTextMeta(conv: ConversationSummary, texts: string[]): boolean` — true if any text matches title or alias.
  - `applyContentFilter(candidates, texts, loadHistory, signal): Promise<ConversationSummary[]>` where `loadHistory: (c: ConversationSummary) => Promise<HistoryMessage[]>` and `signal: AbortSignal`. Returns candidates unchanged when `texts` is empty. Otherwise keeps a conversation if title/alias matches, else if any message content matches. Throws `DOMException("aborted")`-style rejection is avoided — instead it checks `signal.aborted` and returns early with the partial-safe empty result (caller ignores aborted runs).

- [ ] **Step 1: Add the failing content-stage test**

Append to `app/chat/conversation-filter.test.ts`:
```ts
import { applyContentFilter, matchesTextMeta } from "./conversation-filter";
import type { HistoryMessage } from "./history-cache";

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- conversation-filter`
Expected: FAIL with "applyContentFilter is not a function".

- [ ] **Step 3: Implement the content stage**

Add to `app/chat/conversation-filter.ts`:
```ts
import type { HistoryMessage } from "./history-cache";

export function matchesTextMeta(conv: ConversationSummary, texts: string[]): boolean {
  const haystack = `${conv.title}\n${conv.alias ?? ""}`.toLowerCase();
  return texts.some((needle) => haystack.includes(needle.toLowerCase()));
}

function matchesTextContent(messages: HistoryMessage[], texts: string[]): boolean {
  return messages.some(
    (m) =>
      typeof m.content === "string" &&
      texts.some((needle) => m.content.toLowerCase().includes(needle.toLowerCase())),
  );
}

export async function applyContentFilter(
  candidates: ConversationSummary[],
  texts: string[],
  loadHistory: (c: ConversationSummary) => Promise<HistoryMessage[]>,
  signal: AbortSignal,
): Promise<ConversationSummary[]> {
  if (texts.length === 0) return candidates;
  if (signal.aborted) return [];

  const results = await Promise.all(
    candidates.map(async (c) => {
      if (matchesTextMeta(c, texts)) return c;
      const messages = await loadHistory(c);
      return matchesTextContent(messages, texts) ? c : null;
    }),
  );
  if (signal.aborted) return [];
  return results.filter((c): c is ConversationSummary => c !== null);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- conversation-filter`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/chat/conversation-filter.ts app/chat/conversation-filter.test.ts
git commit -m "feat(chat): add async content-match filter stage"
```

---

### Task 5: Search bar component (pills + autocomplete)

**Files:**
- Create: `app/chat/conversation-search-bar.tsx`

**Interfaces:**
- Consumes: `ConversationSummary` (`@/lib/chatSession`), `Input` (`@/components/ui/input`), `cn` (`@/lib/cn`), lucide icons.
- Produces: default export `ConversationSearchBar`, props:
  ```ts
  {
    value: string;
    onChange: (value: string) => void;
    conversations: ConversationSummary[]; // for autocomplete suggestions
    searching?: boolean; // shows a spinner hint while content stage runs
  }
  ```
  The parent owns the query string; this component is controlled.

- [ ] **Step 1: Implement the component**

Create `app/chat/conversation-search-bar.tsx`:
```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Tags, AtSign, Type, CalendarDays } from "lucide-react";
import { cva } from "class-variance-authority";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ConversationSummary } from "@/lib/chatSession";

type Prefix = "tag" | "alias" | "text" | "date";

const PILLS: { prefix: Prefix; label: string; Icon: typeof Tags }[] = [
  { prefix: "tag", label: "Tag", Icon: Tags },
  { prefix: "alias", label: "Alias", Icon: AtSign },
  { prefix: "text", label: "Text", Icon: Type },
  { prefix: "date", label: "Date", Icon: CalendarDays },
];

const DATE_PRESETS = ["hoje", "7d", "30d", String(new Date().getFullYear())];

const pill = cva(
  "inline-flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors hover:border-brand hover:text-fg",
);

const suggestionRow = cva("flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs", {
  variants: { active: { true: "bg-accent/15 text-fg", false: "text-fg-muted hover:bg-elevated/60" } },
  defaultVariants: { active: false },
});

// The active token is the last whitespace-separated chunk of the input -- what
// the caret is editing. Autocomplete only acts on a chunk of the form
// "<prefix>:<partial>".
function activeToken(value: string): { start: number; prefix: Prefix | null; partial: string } {
  const start = Math.max(value.lastIndexOf(" ") + 1, 0);
  const chunk = value.slice(start);
  const colon = chunk.indexOf(":");
  if (colon <= 0) return { start, prefix: null, partial: chunk };
  const prefix = chunk.slice(0, colon).toLowerCase();
  const partial = chunk.slice(colon + 1);
  if (prefix === "tag" || prefix === "alias" || prefix === "date") {
    return { start, prefix, partial };
  }
  return { start, prefix: null, partial: chunk };
}

export default function ConversationSearchBar({
  value,
  onChange,
  conversations,
  searching = false,
}: {
  value: string;
  onChange: (value: string) => void;
  conversations: ConversationSummary[];
  searching?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const tagNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) for (const t of c.tags) set.add(t.name);
    return [...set];
  }, [conversations]);

  const aliases = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) if (c.alias) set.add(c.alias);
    return [...set];
  }, [conversations]);

  const { start, prefix, partial } = activeToken(value);

  const suggestions = useMemo(() => {
    if (!prefix) return [];
    const pool = prefix === "tag" ? tagNames : prefix === "alias" ? aliases : DATE_PRESETS;
    const needle = partial.toLowerCase();
    return pool.filter((s) => s.toLowerCase().includes(needle)).slice(0, 8);
  }, [prefix, partial, tagNames, aliases]);

  function applySuggestion(suggestion: string) {
    const head = value.slice(0, start);
    onChange(`${head}${prefix}:${suggestion} `);
    setOpen(false);
    inputRef.current?.focus();
  }

  function seedPrefix(p: Prefix) {
    const sep = value && !value.endsWith(" ") ? " " : "";
    onChange(`${value}${sep}${p}:`);
    setOpen(true);
    setActiveIdx(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <Input
          ref={inputRef}
          variant="subtle"
          inputSize="sm"
          className={cn("pl-8", searching && "pr-8")}
          placeholder="Filter: tag:  alias:  text:  date:"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {searching && (
          <span className="absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-brand/40 border-t-brand" />
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {PILLS.map(({ prefix: p, label, Icon }) => (
          <button key={p} type="button" className={pill()} onClick={() => seedPrefix(p)}>
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-9 z-20 w-full overflow-hidden rounded-lg border border-brand/30 bg-elevated shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              className={cn(suggestionRow({ active: i === activeIdx }))}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {prefix}:{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: (Verified) `Input` signature**

Confirmed against `components/ui/input.tsx`: `Input` is `forwardRef<HTMLInputElement>`, accepts `variant` (`default`/`subtle`), `inputSize` (`sm`/`md`), `className`, and spreads native input props. It has **no** `icon` prop — the code above renders the leading `Search` icon and the spinner as siblings positioned over the field, so no change is needed. No action required unless the component has since changed.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `conversation-search-bar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/chat/conversation-search-bar.tsx
git commit -m "feat(chat): add conversation search bar with pills and autocomplete"
```

---

### Task 6: Wire filtering into HistorySidebar (both modes)

Replace the old client-side search effect with the two-stage engine, render the new search bar for both modes, and pass the filtered set to the tree.

**Files:**
- Modify: `app/chat/history-sidebar.tsx`
- Modify: `app/chat/conversation-tree.tsx` (already receives `conversations`; no signature change — it will now receive the filtered array)

**Interfaces:**
- Consumes: `parseFilterQuery`, `applySyncFilters`, `applyContentFilter` (`@/app/chat/conversation-filter`), `getHistory` (`@/app/chat/history-cache`), `ConversationSearchBar` (`@/app/chat/conversation-search-bar`).
- Produces: `visible` (filtered `ConversationSummary[]`) fed to both the list rows and `<ConversationTree conversations={visible} .../>`.

- [ ] **Step 1: Read the current sidebar search/render region**

Run: `sed -n '60,300p' app/chat/history-sidebar.tsx`
Expected: locate the `query`/`searchResults`/`searching` state, the search effect (≈ lines 104-145), `visible` (line 147), the searchbox JSX (≈ lines 230-247), and the `<ConversationTree ... conversations={conversations} />` usage (≈ lines 291-298).

- [ ] **Step 2: Add imports**

Near the top imports of `app/chat/history-sidebar.tsx`, add:
```ts
import ConversationSearchBar from "./conversation-search-bar";
import { parseFilterQuery, applySyncFilters, applyContentFilter, isEmptyQuery } from "./conversation-filter";
import { getHistory } from "./history-cache";
```

- [ ] **Step 3: Replace the search effect with the two-stage engine**

Replace the entire `useEffect` block that does the full-content search (the block starting with the comment "Full-content search:" and ending at its dependency array, ≈ lines 101-145) with:
```ts
  // Two-stage filter: a synchronous predicate (tag/alias/date) narrows the set
  // instantly, then an async content stage (text:) runs only over survivors,
  // reading message history from the shared cache. AbortController guarantees
  // latest-query-wins so a slow earlier keystroke can't clobber fresh results.
  useEffect(() => {
    const parsed = parseFilterQuery(query, Date.now());
    if (isEmptyQuery(parsed)) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      const synced = applySyncFilters(conversations, parsed);
      if (parsed.texts.length === 0) {
        setSearchResults(synced);
        return;
      }
      setSearching(true);
      const matched = await applyContentFilter(
        synced,
        parsed.texts,
        (c) => getHistory(workspace, c),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setSearchResults(matched);
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, conversations, workspace.t, workspace.s, workspace.r]);
```

- [ ] **Step 4: Replace the searchbox JSX and move it out of the list-only branch**

Find the existing `<Input ... placeholder="Search conversations" ... />` block (≈ lines 230-247, rendered only in list mode) and remove it. Render the new bar unconditionally, directly above the list/tree switch. Insert (adjust surrounding JSX/indentation to match the file):
```tsx
        <div className="px-2 pb-2">
          <ConversationSearchBar
            value={query}
            onChange={setQuery}
            conversations={conversations}
            searching={searching}
          />
        </div>
```
Keep the `query`, `searchResults`, `searching`, `setQuery` state declarations already present — only the effect and the JSX change. `visible = searchResults ?? conversations` stays as-is.

- [ ] **Step 5: Pass the filtered set to the tree**

Change the tree usage from `conversations={conversations}` to `conversations={visible}`:
```tsx
        {view === "tree" ? (
          <ConversationTree
            workspace={workspace}
            conversations={visible}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
            onApply={onApply}
          />
        ) : (
```
(Match the actual prop set already passed at ≈ lines 291-298; only swap the `conversations` value.)

- [ ] **Step 6: Verify build and lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open the chat, and verify:
- List mode: clicking the `Tag` pill inserts `tag:` and opens autocomplete with existing tag names; selecting one filters the list.
- `date:7d` narrows to recent conversations; `text:<word>` matches title and message content.
- Switching to tree mode keeps the active filters and the tree renders only matching conversations.
- Typing quickly then deleting shows no stale results (latest-query-wins).

- [ ] **Step 8: Commit**

```bash
git add app/chat/history-sidebar.tsx app/chat/conversation-tree.tsx
git commit -m "feat(chat): filter conversations in list and tree via advanced filters"
```

---

## Self-Review Notes

- **Spec coverage:** tag/alias/text/date filters (Tasks 2-4); pills + autocomplete (Task 5); both list and tree (Task 6); shared history cache (Task 1); AND-across / OR-within semantics (Task 3 tests); narrow-first + AbortController + cache (Tasks 4, 6); autocomplete from in-memory data only (Task 5).
- **Date superset:** presets + range implemented in Task 2 per the spec's stated assumption.
- **Known follow-up (out of scope):** filter state is not persisted to the URL fragment (spec defers this).
- **Task 5:** `Input` signature verified against `components/ui/input.tsx` — leading icon/spinner rendered as positioned siblings (no `icon` prop exists).
