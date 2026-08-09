import type { ConversationSummary } from "@/lib/chatSession";
import type { HistoryMessage } from "./history-cache";

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
    if (from.getTime() > to.getTime()) return null;
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
      default: {
        const bare = unquote(token).trim();
        if (bare) query.texts.push(bare);
      }
    }
  }
  return query;
}

export function isEmptyQuery(q: FilterQuery): boolean {
  return q.tags.length === 0 && q.aliases.length === 0 && q.texts.length === 0 && q.dates.length === 0;
}

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

// The conversation the "continue where you left off" card offers: the most
// recently updated one in the CURRENT scope, excluding the open session and any
// freshly-minted empty chat.
//
// `project` is the scope — the fragment's `p`, null on the agent's own landing.
// It is the same rule the sidebar's list follows: a project's conversations are a
// separate list, and the unscoped list shows only chats that belong to no project.
// Getting this wrong is not a cosmetic bug: offering a project conversation from
// the agent's own landing produces a card that cannot be opened, because the
// transcript is read from whichever workspace directory `p` points at.
export function pickResumeCandidate(
  conversations: ConversationSummary[],
  openSessionId: string | undefined,
  project: string | null,
): ConversationSummary | null {
  return conversations
    .filter((c) => c.id !== openSessionId)
    .filter((c) => (c.project ?? null) === project)
    // "New chat" is the API's default title, matched as data -- never translated.
    .filter((c) => !(c.title === "New chat" && !c.alias && c.tags.length === 0))
    .reduce<ConversationSummary | null>(
      (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
      null,
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
