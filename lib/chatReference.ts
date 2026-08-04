import type { ChatDict } from "@/lib/i18n/chat";
import type { TaskReference } from "@/lib/cronTasks";

// What the next message will carry besides the prose the member types.
//
// Held above ChatView (in the shell) rather than inside it, because the Canvas REPLACES
// the chat view: a reference picked there has to survive the switch back, and a slot that
// unmounts with the view it was picked from cannot.
//
// Every variant serializes to ONE self-contained line and never inlines content. That is
// the rule the `[anexo: …]` refs and the reply quote already follow — a transcript runs to
// six figures of bytes, and the agent can read its own store and files anyway.

/** A span of the timeline: one conversation over a window, as Canvas shows it. */
export interface SpanReference {
  kind: "span";
  conversationId: string;
  title: string;
  /** Pre-formatted by the caller, which is where the locale lives. */
  from: string;
  to: string;
  messages: number;
}

export type ChatReference = TaskReference | SpanReference;

/** The chip's heading and one-line detail. */
export function referenceChip(
  ref: ChatReference,
  t: ChatDict,
): { title: string; preview: string } {
  switch (ref.kind) {
    case "task":
      return {
        title: t.scheduledTasks.referencedTask,
        preview: `${ref.name} · ${ref.schedule}`,
      };
    case "run":
      return {
        title: t.scheduledTasks.referencedRun,
        preview: `${ref.name} · ${ref.instant}`,
      };
    case "span":
      return {
        title: t.canvasActivity.referencedSpan,
        preview: `${ref.title} · ${ref.from} → ${ref.to}`,
      };
  }
}

/**
 * The marker that travels inside the sent message.
 *
 * One bracketed line per reference, in the member's own language, so the agent reads it
 * the way it reads an attachment ref. Never the referenced content: the ids and instants
 * are enough for an agent that owns the store, the transcripts and the files.
 */
export function buildReferenceMarker(ref: ChatReference, t: ChatDict): string {
  switch (ref.kind) {
    case "task":
      return `[${t.scheduledTasks.markerTask}: "${ref.name}" (${ref.jobId}) — ${ref.schedule}, ${t.scheduledTasks.markerLastRun} ${ref.lastRun}]`;
    case "run":
      return `[${t.scheduledTasks.markerRun}: "${ref.name}" (${ref.jobId}), run ${ref.runId}, ${ref.instant}]`;
    case "span":
      return `[${t.canvasActivity.markerSpan}: "${ref.title}" — ${ref.messages} ${t.canvasActivity.markerMessages}, ${ref.from} → ${ref.to}]`;
  }
}
