// `@file` references typed straight into the chat box.
//
// The token stays visible in the sent message — the member wrote a sentence and it
// should still read like one — and at send time each resolved mention also
// contributes an `[anexo: uploads/…]` marker, the same machine reference the attach
// button has always produced. That is what makes the agent able to open the file;
// without it, `@logo.png` is a string the model can only guess about.
//
// Pure on purpose: every rule below is a string rule, and the suite runs in a node
// environment where no component renders.

/**
 * A quoted span is literal text.
 *
 * `He said "look at @logo.png"` mentions nothing: the member is quoting, not
 * referencing. This is the one escape hatch, and it is the whole reason the token
 * has to be resolved from the TEXT at send time rather than committed the moment the
 * menu is used — a decision made at insert time could not know that the member would
 * later wrap it in quotes.
 *
 * ONLY the double quote counts. Single quotes were considered and rejected: an
 * apostrophe is ordinary prose in both languages this app speaks ("it's",
 * "d'água"), so treating `'` as a delimiter would let one apostrophe silently
 * disable every reference after it — a failure the member could not see or explain.
 *
 * Spans are counted, not matched: an ODD number of quotes before a position means it
 * sits inside an unterminated quoted span, which is still the member quoting
 * something. Nothing here needs the closing quote to exist.
 */
function insideQuotes(text: string, index: number): boolean {
  let quotes = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === '"') quotes++;
  }
  return quotes % 2 === 1;
}

// What a mention token may contain. Deliberately permissive about `/`, `.`, `-` and
// `_` because a workspace path is exactly those: `@reports/2026/q1.pdf` has to work.
// It stops at whitespace and at the punctuation that ends a sentence, so
// "veja @logo.png, obrigado" does not swallow the comma.
const MENTION = /@([^\s@"]*[^\s@",.;:!?()[\]{}])/g;

/** A file the mention menu can offer: its workspace path and how it reads. */
export interface MentionCandidate {
  /** Workspace-relative, no `uploads/` prefix — what `Attachment.name` carries. */
  name: string;
  /** The full stored path, `uploads/…` — what an `[anexo: …]` marker needs. */
  path: string;
}

/**
 * The mention being typed at the caret, or null.
 *
 * Returns the token WITHOUT its `@`, so an empty string means "`@` typed, nothing
 * after it yet" — which is a real state the menu answers by listing everything.
 * Distinct from null, which means there is no mention here at all.
 */
export function mentionQueryAt(text: string, caret: number): string | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const token = upto.slice(at + 1);
  // Whitespace closes a mention: the member moved on. A second `@` starts a new one.
  if (/[\s@"]/.test(token)) return null;
  if (insideQuotes(text, at)) return null;
  return token;
}

/** Case-insensitive substring match on the path, so `@q1` finds `reports/q1.pdf`. */
export function filterCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter((c) => c.name.toLowerCase().includes(q));
}

/**
 * Replaces the mention at the caret with `@<name> `, returning the new text and
 * where the caret should land.
 *
 * The trailing space matters: without it the next keystroke extends the token the
 * member just finished choosing.
 */
export function applyMention(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const at = text.slice(0, caret).lastIndexOf("@");
  if (at === -1) return { text, caret };
  const inserted = `@${name} `;
  return {
    text: text.slice(0, at) + inserted + text.slice(caret),
    caret: at + inserted.length,
  };
}

/**
 * The files a message actually references: every `@token` that names a known file
 * and is not inside quotes.
 *
 * Resolved against the workspace listing rather than trusted as typed, so a typo, a
 * deleted file, or an email address (`@gmail.com` is not a path anyone has) simply
 * is not a reference. Duplicates collapse: mentioning one file twice attaches it
 * once.
 */
export function resolveMentions(
  text: string,
  candidates: MentionCandidate[],
): MentionCandidate[] {
  const byName = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
  const out: MentionCandidate[] = [];
  const seen = new Set<string>();

  MENTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION.exec(text)) !== null) {
    if (insideQuotes(text, match.index)) continue;
    const found = byName.get(match[1].toLowerCase());
    if (!found || seen.has(found.path)) continue;
    seen.add(found.path);
    out.push(found);
  }
  return out;
}
