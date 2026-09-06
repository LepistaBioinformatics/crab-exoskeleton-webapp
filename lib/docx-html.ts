// The filter between mammoth's HTML and the DOM.
//
// mammoth turns a .docx into HTML, and that HTML is derived from a file the MEMBER
// supplied. The preview feature rests on one posture, stated in lib/media.ts: nothing a
// member uploads renders as markup from this origin. Injecting mammoth's output
// verbatim would be the single exception, so it is filtered to a document's worth of
// tags and nothing else (file-preview-in-pane DEC-4).
//
// A hand-written allowlist rather than a sanitizer dependency: the input is one
// generator's output, not the open web, and the set of tags a .docx can become is
// small enough to read in one screen. What the allowlist does NOT contain is the
// interesting part — no script, no style, no iframe, no object, no form, and no
// attribute that is not on the tiny per-tag list below.

const ALLOWED_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "sub", "sup",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "a", "img", "hr",
]);

// Per tag, because "which attributes are safe" is not a property of attributes alone:
// `src` on an <img> is bytes, `src` on anything else is a fetch this origin should not
// be making.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt"]),
  th: new Set(["colspan", "rowspan"]),
  td: new Set(["colspan", "rowspan"]),
};

/** Only what cannot navigate or fetch: an ordinary web link, or the file's own bytes. */
function safeUrl(tag: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (tag === "img") return v.startsWith("data:image/");
  return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("#");
}

/**
 * mammoth's HTML, reduced to a document.
 *
 * Parses with the browser's own parser rather than with regular expressions —
 * `DOMParser` in an inert document, so nothing loads and nothing runs while it is being
 * inspected — and rebuilds from the nodes that survive. Anything not on the allowlist
 * is dropped WITH its subtree when it is a script-like container, and unwrapped
 * otherwise, so a `<div>` of text keeps its text.
 */
export function sanitizeDocxHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return serialize(doc.body);
}

// Containers whose CONTENT is not text a reader wants: dropping the tag but keeping
// the children would paste a script's source into the document.
const DROP_SUBTREE = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template"]);

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serialize(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* text */) {
      out += escapeText(child.nodeValue ?? "");
      continue;
    }
    if (child.nodeType !== 1 /* element */) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_SUBTREE.has(tag)) continue;
    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown WRAPPER: keep what it held. A .docx becomes divs and spans around real
      // content, and dropping those would drop the document.
      out += serialize(el);
      continue;
    }

    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTRS[tag]?.has(name)) continue;
      if ((name === "href" || name === "src") && !safeUrl(tag, attr.value)) continue;
      attrs.push(`${name}="${escapeText(attr.value).replace(/"/g, "&quot;")}"`);
    }
    const open = attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
    if (tag === "br" || tag === "hr" || tag === "img") {
      out += open;
      continue;
    }
    out += `${open}${serialize(el)}</${tag}>`;
  }
  return out;
}
