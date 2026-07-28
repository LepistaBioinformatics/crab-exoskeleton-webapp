import type { InstanceConfigWrite } from "@/lib/admin";
import { managedDifferences, parseDocument, type JsonValue } from "./json-tree";

// The instance-config editor's decisions, kept out of the component so they are
// testable without a DOM (this suite runs `environment: "node"`, and the editor
// portals to <body>).

export type Mode = "raw" | "tree";

// What the last save produced. One value rather than several booleans, so two
// outcomes can never be on screen at once.
export type Outcome =
  | { kind: "saved" }
  | { kind: "managedReverted"; paths: string[] }
  | { kind: "reapplyFailed"; detail?: string }
  | { kind: "stale" }
  | { kind: "error"; code: string };

// A document that does not parse opens in RAW: the broken case is what this
// feature exists for, and the text is the only view that can show a syntax error.
export function initialMode(valid: boolean): Mode {
  return valid ? "tree" : "raw";
}

// Save is offered only for a document the proxy can accept (parses, object at the
// top level), that differs from what was loaded, and while nothing is in flight.
// Blocking locally makes the reason immediate instead of a round-trip.
export function canSave(args: { parsedOk: boolean; dirty: boolean; saving: boolean }): boolean {
  return args.parsedOk && args.dirty && !args.saving;
}

// outcomeFor reads the write response the way the admin needs it framed.
//
// Order matters. A failed re-apply outranks a reverted managed path because it is
// the actionable one, and both are reported as SAVED — the document is on disk
// either way, and calling it a failure would send an admin looking for a write
// that already happened.
export function outcomeFor(res: InstanceConfigWrite, submitted: JsonValue): Outcome {
  if (!res.reapplied.ok) {
    return { kind: "reapplyFailed", detail: res.reapplied.detail };
  }
  const saved = parseDocument(res.raw).value;
  const reverted = saved ? managedDifferences(submitted, saved, res.managedPaths) : [];
  return reverted.length > 0 ? { kind: "managedReverted", paths: reverted } : { kind: "saved" };
}

// A stale revision is its own outcome and is never retried: the proxy's own
// materialization is the other writer, and retrying would overwrite it.
export function outcomeForError(code: string): Outcome {
  return code === "stale_revision" ? { kind: "stale" } : { kind: "error", code };
}

// insertTab is Tab-indents-instead-of-moving-focus for the raw editor. Losing
// focus mid-document is worse than trapping the key in a code field.
export function insertTab(text: string, from: number, to: number): { text: string; caret: number } {
  return { text: text.slice(0, from) + "  " + text.slice(to), caret: from + 2 };
}
