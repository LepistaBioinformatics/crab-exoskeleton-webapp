// A JSON tokenizer for syntax highlighting, and the bracket scan folding is built
// on. React-free and total.
//
// Two properties matter more than anything else here:
//
//   1. The tokens are a CONTIGUOUS, NON-OVERLAPPING COVER of the input. Whitespace
//      and garbage get tokens too. The highlight layer renders token slices behind
//      a transparent textarea, so dropping or reordering a single character would
//      shift every glyph after it and misalign the caret from what the admin sees.
//   2. It never throws and never abandons the rest of the document. The files this
//      exists to repair are malformed by definition.

import type { SyntaxRole } from "@/lib/syntax-theme";

export type TokenKind =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punct"
  | "plain"
  | "invalid";

export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
}

// How each JSON token kind maps onto a language-agnostic syntax role. The
// tokenizer owns this because it is the thing that knows what its kinds mean; the
// theme owns only the colours.
export const SYNTAX_ROLE: Record<TokenKind, SyntaxRole> = {
  key: "name",
  string: "string",
  number: "number",
  boolean: "keyword",
  null: "keyword",
  punct: "punct",
  plain: "plain",
  invalid: "invalid",
};

const PUNCT = new Set(["{", "}", "[", "]", ",", ":"]);

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  // Runs of whitespace and runs of unrecognized bytes are each collapsed into one
  // token, which keeps the rendered element count near the number of *meaningful*
  // tokens rather than the number of characters.
  const flushPlain = (from: number, to: number, kind: TokenKind) => {
    if (to > from) out.push({ kind, start: from, end: to });
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      const start = i;
      while (i < text.length && /[ \t\n\r]/.test(text[i])) i++;
      flushPlain(start, i, "plain");
      continue;
    }

    if (PUNCT.has(ch)) {
      out.push({ kind: "punct", start: i, end: i + 1 });
      i++;
      continue;
    }

    if (ch === '"') {
      const start = i;
      i = scanString(text, i);
      // A string is a KEY when the next non-whitespace character is a colon. That
      // is the only thing distinguishing the two in JSON, and telling them apart
      // is most of what makes highlighting worth having.
      out.push({ kind: nextMeaningful(text, i) === ":" ? "key" : "string", start, end: i });
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const start = i;
      i = scanNumber(text, i);
      // A lone "-" is not a number. Tagging it invalid rather than number is what
      // makes a half-typed value visible as unfinished instead of looking valid.
      out.push({ kind: i > start + (ch === "-" ? 1 : 0) ? "number" : "invalid", start, end: i });
      continue;
    }

    const word = matchWord(text, i);
    if (word) {
      out.push({ kind: word.kind, start: i, end: i + word.length });
      i += word.length;
      continue;
    }

    // Anything else: a run of characters that cannot begin a JSON value.
    const start = i;
    while (i < text.length && !isTokenStart(text[i])) i++;
    // Guard against a zero-length run, which would loop forever.
    if (i === start) i++;
    flushPlain(start, i, "invalid");
  }

  return out;
}

function isTokenStart(ch: string): boolean {
  return (
    /[ \t\n\r]/.test(ch) ||
    PUNCT.has(ch) ||
    ch === '"' ||
    ch === "-" ||
    (ch >= "0" && ch <= "9") ||
    ch === "t" ||
    ch === "f" ||
    ch === "n"
  );
}

// scanString returns the offset just past the closing quote, or past the end of
// the line when the string is unterminated. Stopping at the newline matters: an
// unterminated string on line 3 must not colour the remaining 400 lines as one
// string, which would hide every real token below it.
function scanString(text: string, from: number): number {
  let i = from + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    if (ch === "\n") return i;
    i++;
  }
  return text.length;
}

function scanNumber(text: string, from: number): number {
  let i = from;
  if (text[i] === "-") i++;
  while (i < text.length && text[i] >= "0" && text[i] <= "9") i++;
  if (text[i] === ".") {
    i++;
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i++;
  }
  if (text[i] === "e" || text[i] === "E") {
    const mark = i;
    i++;
    if (text[i] === "+" || text[i] === "-") i++;
    if (!(text[i] >= "0" && text[i] <= "9")) return mark; // "1e" is not a number yet
    while (i < text.length && text[i] >= "0" && text[i] <= "9") i++;
  }
  return i;
}

function matchWord(text: string, at: number): { kind: TokenKind; length: number } | null {
  if (text.startsWith("true", at)) return { kind: "boolean", length: 4 };
  if (text.startsWith("false", at)) return { kind: "boolean", length: 5 };
  if (text.startsWith("null", at)) return { kind: "null", length: 4 };
  return null;
}

function nextMeaningful(text: string, from: number): string {
  let i = from;
  while (i < text.length && /[ \t\n\r]/.test(text[i])) i++;
  return text[i] ?? "";
}
