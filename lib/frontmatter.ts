/**
 * The leading `---` block of a markdown document, split off so the preview can
 * render it as metadata instead of as the document.
 *
 * WHY A SPLITTER AND NOT A PLUGIN. `MessageContent` renders the chat transcript,
 * the scheduled-tasks panel and the draft editor as well as this preview, and an
 * assistant message that opens with `---` is an ordinary thematic break. Teaching
 * the shared renderer about frontmatter would turn that into a metadata card
 * everywhere. `remark-frontmatter` would also not put it on screen: react-markdown
 * goes mdast -> hast and `remark-rehype` has no handler for a `yaml` node, so the
 * block would vanish rather than render.
 *
 * THE GRAMMAR IS NOT YAML, deliberately, and this is the third implementation of
 * the same one. The proxy's `parseSkillFrontmatter` decides whether a skill loads
 * at all and the harness's `skillfile.Frontmatter` reads it into the prompt; both
 * refuse a YAML dependency and read exactly a leading `---`, `key: value` lines
 * and a closing `---`. A webapp that parsed real YAML would show a reviewer
 * something different from what the two readers act on -- which is the opposite of
 * what reviewing a skill is for. There is also no YAML parser in this tree.
 */

/**
 * One line of the block. `key` is null for a line with no `key: value` shape,
 * whose text is then the whole line.
 */
export type FrontmatterRow = { key: string | null; value: string };

export type SplitDocument = {
  /** Null when the document has no frontmatter -- see the two rules in `split`. */
  frontmatter: FrontmatterRow[] | null;
  /** What to hand the markdown renderer. The whole text when there is no block. */
  body: string;
};

const FENCE = "---";

/**
 * split separates a leading frontmatter block from the body.
 *
 * Two documents are deliberately NOT frontmatter:
 *
 *   - one whose `---` is not the first content line. That is a thematic break, or
 *     the underline of a setext heading, and both are ordinary markdown.
 *   - one that opens the fence and never closes it. Treating the rest of the file
 *     as metadata would hide an arbitrary amount of the document, and silently:
 *     the reader sees a shorter file with nothing saying why. It renders whole.
 */
export function split(text: string): SplitDocument {
  const lines = text.replace(/^﻿/, "").split("\n");

  let open = 0;
  while (open < lines.length && lines[open].trim() === "") open++;
  if (open >= lines.length || lines[open].trim() !== FENCE) {
    return { frontmatter: null, body: text };
  }

  let close = open + 1;
  while (close < lines.length && lines[close].trim() !== FENCE) close++;
  if (close >= lines.length) {
    return { frontmatter: null, body: text };
  }

  const rows = lines
    .slice(open + 1, close)
    .filter((line) => line.trim() !== "")
    .map(row);
  return { frontmatter: rows, body: lines.slice(close + 1).join("\n") };
}

/**
 * row reads one line of the block.
 *
 * EVERY line becomes a row, which is where this parts company with the two Go
 * readers. They keep `name` and `description` and ignore the rest, because they
 * are deciding whether a skill is valid. This is showing a reviewer what the file
 * says -- and the field nobody reads, or the line that is malformed, is exactly
 * what they opened the file to find.
 */
function row(line: string): FrontmatterRow {
  const colon = line.indexOf(":");
  if (colon < 0) {
    return { key: null, value: line.trim() };
  }
  const key = line.slice(0, colon).trim();
  if (key === "") {
    return { key: null, value: line.trim() };
  }
  return { key, value: unquote(line.slice(colon + 1).trim()) };
}

/** unquote strips ONE layer of matching quotes, as the Go readers do. */
function unquote(value: string): string {
  const q = value[0];
  if (value.length >= 2 && (q === '"' || q === "'") && value.endsWith(q)) {
    return value.slice(1, -1);
  }
  return value;
}
