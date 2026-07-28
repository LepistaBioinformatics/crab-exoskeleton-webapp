// Tree/text primitives for the instance-config editor. Deliberately free of
// React so every rule below is unit-testable without mounting anything (the
// pattern tabs.ts and format.ts already follow).
//
// The editor's single source of truth is the document TEXT. Tree edits go through
// these functions and are re-serialized immediately, so switching modes never
// merges two states and never loses an edit.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

// A path is the SEGMENT LIST, not a dotted string: an object key may contain a
// dot, and re-splitting a joined path would address the wrong node. The dotted
// form exists only for display, for `data-path`, and for matching managedPaths.
export type Path = (string | number)[];

export type JsonType = "string" | "number" | "boolean" | "null" | "object" | "array";

export interface ParseResult {
  value: JsonValue | null;
  /** Parses AND the top level is an object — what the proxy will accept. */
  ok: boolean;
  error?: string;
  line?: number;
  column?: number;
}

// parseDocument reports line/column rather than only the raw parser message.
// V8 reports a character position ("position 4213"), which an admin cannot act
// on; the line and column are what the raw view points at.
export function parseDocument(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { value: null, ok: false, error: message, ...positionOf(text, message) };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: parsed as JsonValue, ok: false, error: "notObject" };
  }
  return { value: parsed as JsonValue, ok: true };
}

// positionOf extracts a 1-based line/column from the engine's message.
//
// Three shapes have to be tolerated, and none of them is guaranteed:
//   - "… at position 26 (line 3 column 7)"  — current V8, read directly
//   - "… at position 26"                    — older V8, derived from the offset
//   - "Unexpected token 'o', …snippet… is not valid JSON" — V8's form for an
//     unexpected token in a document long enough to be summarized, and Safari's
//     and Firefox's messages generally: NO position at all.
//
// The third case returns nothing rather than a guess. The message itself quotes
// the offending text there, which is more use to an admin than a wrong line
// number would be, and the status line renders fine without one.
function positionOf(text: string, message: string): { line?: number; column?: number } {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return { line: Number(lineCol[1]), column: Number(lineCol[2]) };

  const pos = /position (\d+)/.exec(message);
  if (!pos) return {};
  const offset = Math.min(Number(pos[1]), text.length);
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export function serialize(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

export function dotted(path: Path): string {
  return path
    .map((seg) => (typeof seg === "number" ? `[${seg}]` : seg))
    .reduce<string>((acc, seg) => {
      if (!acc) return seg;
      return seg.startsWith("[") ? acc + seg : `${acc}.${seg}`;
    }, "");
}

export function typeOf(v: JsonValue): JsonType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "object") return "object";
  return t as JsonType;
}

// coerce converts a leaf to another JSON type. Recovering a wrongly-typed value
// -- `"max_tokens": "32768"` as a string, which picoclaw refuses -- is a primary
// repair case, and a typed input alone cannot express it.
//
// A non-numeric string becomes 0 rather than NaN: NaN does not survive
// JSON.stringify and would silently turn into null on save.
export function coerce(v: JsonValue, to: JsonType): JsonValue {
  switch (to) {
    case "string":
      return v === null || typeof v === "object" ? "" : String(v);
    case "number": {
      const n = typeof v === "boolean" ? Number(v) : Number(String(v ?? ""));
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return v === true || v === "true" || v === 1;
    case "null":
      return null;
    case "object":
      return {};
    case "array":
      return [];
  }
}

// isWithin reports whether a path is one of `entries` or sits INSIDE one of them.
// Both callers need the subtree rule: `model_list` is proxy-managed, so
// `model_list[0].provider` is too (the proxy replaces the whole value), and a
// redacted `model_list[0].api_keys` must mask `model_list[0].api_keys[0]` — the
// leaf that actually holds the credential.
//
// The trailing-boundary check is what keeps `model_lists` from matching
// `model_list`.
export function isWithin(path: Path, entries: string[]): boolean {
  const candidate = dotted(path);
  return entries.some((entry) => {
    if (candidate === entry) return true;
    if (!candidate.startsWith(entry)) return false;
    const next = candidate.charAt(entry.length);
    return next === "." || next === "[";
  });
}

// --- editing primitives -------------------------------------------------------
//
// Each takes the WHOLE document and returns a new one, so the caller
// re-serializes once and the text stays the single source of truth. Nothing
// mutates in place: a shared sub-object would alias into the previous state.

export function setAtPath(doc: JsonValue, path: Path, value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    if (!Array.isArray(doc)) return doc;
    const next = doc.slice();
    next[head] = setAtPath(doc[head] ?? null, rest, value);
    return next;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return doc;
  return { ...doc, [head]: setAtPath(doc[head] ?? null, rest, value) };
}

export function removeAtPath(doc: JsonValue, path: Path): JsonValue {
  if (path.length === 0) return doc;
  const [head, ...rest] = path;
  if (rest.length > 0) {
    const child = childAt(doc, head);
    if (child === undefined) return doc;
    return setAtPath(doc, [head], removeAtPath(child, rest) as JsonValue);
  }
  if (typeof head === "number") {
    if (!Array.isArray(doc)) return doc;
    // Splice, not delete: `delete arr[i]` leaves a hole that serializes to null
    // and would look like an intentional value.
    return doc.filter((_, i) => i !== head);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return doc;
  const next = { ...doc };
  delete next[head];
  return next;
}

/** Sentinel for the one refusal a caller has to render inline. */
export const DUPLICATE_KEY = "duplicate";

// addKey inserts an empty-string value the admin then retypes via coerce. A key
// that already exists is REFUSED rather than overwritten: silently replacing a
// sibling is how an editor destroys config.
export function addKey(doc: JsonValue, path: Path, key: string): JsonValue | typeof DUPLICATE_KEY {
  const target = path.length === 0 ? doc : childAt2(doc, path);
  if (target === null || typeof target !== "object" || Array.isArray(target)) return doc;
  if (key in target) return DUPLICATE_KEY;
  return setAtPath(doc, [...path, key], "");
}

export function appendItem(doc: JsonValue, path: Path): JsonValue {
  const target = path.length === 0 ? doc : childAt2(doc, path);
  if (!Array.isArray(target)) return doc;
  return setAtPath(doc, [...path, target.length], "");
}

function childAt(doc: JsonValue, seg: string | number): JsonValue | undefined {
  if (typeof seg === "number") return Array.isArray(doc) ? doc[seg] : undefined;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return undefined;
  return doc[seg];
}

// valueAtPath under another name, kept private: the tree renderer walks values as
// it descends and never needs a random-access read.
function childAt2(doc: JsonValue, path: Path): JsonValue | undefined {
  let cur: JsonValue | undefined = doc;
  for (const seg of path) {
    if (cur === undefined) return undefined;
    cur = childAt(cur, seg);
  }
  return cur;
}

// valueAtPath is the read the editor needs to compare a submitted document
// against what the proxy returned (which managed paths were re-established).
export function valueAtPath(doc: JsonValue, dottedPath: string): JsonValue | undefined {
  let cur: JsonValue | undefined = doc;
  for (const seg of dottedPath.split(".")) {
    if (cur === undefined) return undefined;
    cur = childAt(cur, seg);
  }
  return cur;
}

// managedDifferences names the managed paths whose value differs between two
// documents. The editor uses it after a save to tell the admin which keys the
// proxy re-established, rather than letting a silently reverted edit look saved.
export function managedDifferences(
  submitted: JsonValue,
  saved: JsonValue,
  managed: string[],
): string[] {
  return managed.filter(
    (p) => JSON.stringify(valueAtPath(submitted, p)) !== JSON.stringify(valueAtPath(saved, p)),
  );
}
