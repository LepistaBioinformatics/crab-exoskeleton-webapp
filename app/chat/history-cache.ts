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
