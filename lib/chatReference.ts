import type { ChatDict } from "@/lib/i18n/chat";
import type { TaskReference } from "@/lib/cronTasks";

// What the next message will carry besides the prose the member types.
//
// Held above ChatView (in the shell) rather than inside it: ChatView is keyed on the
// workspace and unmounts on a switch, and a slot that goes with the view it was picked
// from loses the reference the member just chose.
//
// Every variant serializes to ONE self-contained line and never inlines content. That is
// the rule the `[anexo: …]` refs and the reply quote already follow — a transcript runs to
// six figures of bytes, and the agent can read its own store and files anyway.

/**
 * One entity out of the agent's knowledge graph.
 *
 * Carries the entity's NAME and its shape, never its observations. The agent owns the graph through
 * its own MCP tools, so a name is a lookup key — inlining the facts would duplicate into the
 * transcript exactly what the agent can read for itself, which is the rule every variant here
 * follows.
 */
export interface EntityReference {
  kind: "entity";
  name: string;
  /** The entity type, or "unknown" — normalised by the caller, as the map does. */
  entityType: string;
  observations: number;
  relations: number;
}

/**
 * One memory off the mangrove's timeline.
 *
 * THE OBJECT ID IS THE PAYLOAD, and it is the reason this kind exists rather than the
 * member copying the text out. The agent resolves it through `mangrove_timeline` and
 * reads the memory itself — including the two kinds that have no text to copy: a
 * published FILE, whose body is bytes behind a digest, and a graph FRAGMENT, whose body
 * is JSON that means nothing pasted into a sentence.
 *
 * `cell` and `author` are here for the chip the member reads, never for the agent to
 * look anything up by: two authors can hold a position on one cell, so the pair is not
 * an identity and the id is.
 */
export interface MangroveReference {
  kind: "mangrove";
  objectId: string;
  cell: string;
  author: string;
}

export type ChatReference = TaskReference | EntityReference | MangroveReference;

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
    case "entity":
      return {
        title: t.memoryGraph.referencedEntity,
        preview: `${ref.name} · ${ref.entityType}`,
      };
    case "mangrove":
      return {
        title: t.mangrove.referencedPost,
        preview: `${ref.cell} · ${ref.author}`,
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
    // The NAME is the payload: it is the key the agent's own open_nodes takes, so the agent can
    // read the observations rather than being handed a stale copy of them.
    case "entity":
      return `[${t.memoryGraph.markerEntity}: "${ref.name}" (${ref.entityType}) — ${ref.observations} ${t.memoryGraph.observations}, ${ref.relations} ${t.memoryGraph.relations}]`;
    // The OBJECT ID is what makes this resolvable: the agent looks the memory up with
    // mangrove_timeline rather than being handed a copy of it, which is the same rule the
    // entity marker follows and the only one that works for a file or a fragment.
    case "mangrove":
      return `[${t.mangrove.markerPost}: "${ref.cell}" (${ref.objectId}) — ${t.mangrove.from.replace("{who}", ref.author)}]`;
  }
}
