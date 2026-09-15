// SPLITTING HIGHLIGHT.JS OUTPUT INTO ONE STRING PER SOURCE LINE.
//
// The preview's numbered code pane used to be two sibling `<pre>` elements — one of
// numbers, one of code — which stayed aligned only because each source line occupied
// exactly one row in both. That is true right up until the code wraps, and the owner
// asked for wrapping: a line broken into three rows would sit beside one number while
// the rest of the file slid out of step below it.
//
// So the pane is a row per line now, and this is what makes the rows. The reason it was
// avoided before (`preview-plain-text-fallback` DEC-2) is real and is exactly what this
// function has to answer: highlight.js returns spans that CROSS NEWLINES — a block
// comment, a template literal, a multi-line string — so cutting its output at `\n` and
// handing the pieces to separate elements produces unbalanced markup and colouring that
// bleeds or stops early. The fix is to close every span still open at the break and
// reopen the same stack on the next line, which is what the highlighter's own
// line-numbering plugins do.
//
// Safe to scan for `<` and `>` naively: highlight.js escapes the code it is given, so
// `&lt;` is what a literal `<` in the source looks like by the time it reaches here and
// the only real tags are the highlighter's own spans. That escaping is the security
// boundary of the whole feature, asserted in `code-highlight.test.ts` rather than
// trusted, and this function preserves it by never decoding or re-encoding anything —
// text between tags is copied through byte for byte.
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  // The opening tags in force at the cursor, innermost last.
  const open: string[] = [];
  let current = "";
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    const text = lt === -1 ? html.slice(i) : html.slice(i, lt);

    let start = 0;
    for (;;) {
      const nl = text.indexOf("\n", start);
      if (nl === -1) {
        current += text.slice(start);
        break;
      }
      current += text.slice(start, nl) + "</span>".repeat(open.length);
      lines.push(current);
      current = open.join("");
      start = nl + 1;
    }

    if (lt === -1) break;
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      // Truncated markup. Nothing sensible is left to parse, so the remainder rides
      // along as text rather than being dropped — and the spans still open are closed
      // with it. An unbalanced last line reaches `innerHTML`, where the browser repairs
      // it by swallowing whatever follows.
      current += html.slice(lt) + "</span>".repeat(open.length);
      open.length = 0;
      break;
    }
    const tag = html.slice(lt, gt + 1);
    if (tag.startsWith("</")) open.pop();
    else if (!tag.endsWith("/>")) open.push(tag);
    current += tag;
    i = gt + 1;
  }

  lines.push(current);
  return lines;
}
