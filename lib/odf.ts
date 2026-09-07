import { SHEET_ROW_CAP, type SheetPreview } from "./sheet-preview";

/**
 * The OpenDocument reader: `.odt`, `.ods` and `.odp`, in the browser.
 *
 * ONE parser with three entry points, because the three formats are one container and
 * one XML vocabulary — what differs is which body element the walk starts from
 * (`office:text`, `office:spreadsheet`, `office:presentation`). Three parsers would
 * triplicate the zip handling and the style resolution for nothing
 * (preview-formatting-and-odf DEC-7).
 *
 * Each format then lands in a pane that ALREADY EXISTS: `.ods` returns the
 * `SheetPreview[]` the spreadsheet pane consumes, so it inherits the sheet tabs, the row
 * cap and the truncation notice without a line of UI (DEC-5); `.odt` and `.odp` return
 * HTML that goes through `sanitizeDocxHtml` and is painted by the word-processor pane's
 * typography.
 *
 * The HTML this builds is safe by CONSTRUCTION — every tag it emits is one of a dozen it
 * chooses itself and every text node is escaped, so member content can only ever become
 * text. It is filtered a second time anyway, at the call site, because that filter is the
 * one with the suite and the stated posture behind it (FR-4.1). Two filters is the point,
 * not an oversight.
 */

// ODF prefixes are fixed by convention but not by the format, so every lookup goes
// through the LOCAL name. The alternative — `getAttributeNS` against seven namespace
// constants — is more precise and buys nothing here: no element or attribute this walk
// reads shares a local name with a different one in the same position.
function attr(el: Element, local: string): string | null {
  for (const a of Array.from(el.attributes)) {
    if ((a.localName || a.name) === local) return a.value;
  }
  return null;
}

function name(node: Node): string {
  return (node as Element).localName || (node as Element).nodeName;
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * Subtrees that are dropped WHOLE, and the reason differs per entry.
 *
 * `text:tracked-changes` is the one that would be a bug rather than clutter: it holds the
 * text a reviewer DELETED, and recursing into unknown containers by default (see `blocks`)
 * would paste removed sentences back into the document.
 *
 * The rest are content a preview has no business showing (annotations, speaker notes) or
 * bytes it must never follow (embedded objects, base64 images) — FR-4.2.
 */
const DROP = new Set([
  "annotation",
  "annotation-end",
  "automatic-styles",
  "font-face-decls",
  "tracked-changes",
  "sequence-decls",
  "forms",
  "settings",
  "scripts",
  "event-listeners",
  "object",
  "object-ole",
  "binary-data",
  "image",
  "notes",
]);

// --- Automatic styles ----------------------------------------------------
//
// ODF has no `<strong>`. Emphasis is a STYLE reference: a `<text:span>` carries
// `text:style-name="T1"`, and `T1` is a `<style:style>` in `office:automatic-styles`
// whose `<style:text-properties>` says `fo:font-weight="bold"`. Resolving that table is
// what keeps an .odt from reading worse than the .docx beside it (DEC-8).

interface Emphasis {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface Styles {
  text: Map<string, Emphasis>;
  /** Style names that number their items, so the list is an `<ol>` rather than a `<ul>`. */
  ordered: Set<string>;
}

function readStyles(doc: Document): Styles {
  const text = new Map<string, Emphasis>();
  const ordered = new Set<string>();

  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const local = name(el);

    if (local === "style") {
      const styleName = attr(el, "name");
      if (!styleName) continue;
      const props = Array.from(el.children).find((c) => name(c) === "text-properties");
      if (!props) continue;
      const weight = attr(props, "font-weight") ?? "";
      const style = attr(props, "font-style") ?? "";
      const underline = attr(props, "text-underline-style") ?? "none";
      text.set(styleName, {
        // A numeric weight is legal and common; 600 is the same threshold the CSS
        // `bolder` keyword resolves against.
        bold: weight === "bold" || (Number(weight) >= 600),
        italic: style === "italic" || style === "oblique",
        underline: underline !== "none" && underline !== "",
      });
      continue;
    }

    // `<text:list-style>` holds one level element per nesting depth. A list is ordered
    // when its FIRST level numbers itself; mixing kinds per level is legal ODF and is
    // deliberately flattened, because the pane has one list element per list.
    if (local === "list-style") {
      const styleName = attr(el, "name");
      if (!styleName) continue;
      if (Array.from(el.children).some((c) => name(c) === "list-level-style-number")) {
        ordered.add(styleName);
      }
    }
  }

  return { text, ordered };
}

// --- Inline --------------------------------------------------------------

/** Only what cannot fetch or execute: an ordinary web link, or an in-document anchor. */
function safeHref(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("https://") || v.startsWith("http://") || v.startsWith("#");
}

function emphasise(inner: string, e: Emphasis | undefined): string {
  if (!inner || !e) return inner;
  let out = inner;
  if (e.bold) out = `<strong>${out}</strong>`;
  if (e.italic) out = `<em>${out}</em>`;
  if (e.underline) out = `<u>${out}</u>`;
  return out;
}

/**
 * The text of one paragraph-ish element, as HTML.
 *
 * Unknown elements RECURSE rather than drop, which is the same choice
 * `sanitizeDocxHtml` documents for unknown wrappers: ODF wraps real content in
 * bookmarks, soft page breaks, change marks and reference marks, and dropping those
 * would drop the sentence around them. The `DROP` set above is what makes that default
 * safe — the containers whose content must NOT survive are named explicitly.
 */
function inline(node: Node, styles: Styles): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out += escapeText(child.nodeValue ?? "");
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const local = name(el);
    if (DROP.has(local)) continue;

    switch (local) {
      case "span":
        out += emphasise(inline(el, styles), styles.text.get(attr(el, "style-name") ?? ""));
        break;
      case "a": {
        const href = attr(el, "href") ?? "";
        const inner = inline(el, styles);
        out += safeHref(href) ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
        break;
      }
      case "line-break":
        out += "<br>";
        break;
      case "tab":
        out += "&#9;";
        break;
      // `<text:s text:c="n">` is a run of n spaces, which XML would otherwise collapse.
      case "s":
        out += "&nbsp;".repeat(Math.min(Number(attr(el, "c") ?? 1) || 1, 64));
        break;
      default:
        out += inline(el, styles);
    }
  }
  return out;
}

// --- Blocks --------------------------------------------------------------

function listItems(list: Element, styles: Styles): string {
  let out = "";
  for (const item of Array.from(list.children)) {
    if (name(item) !== "list-item" && name(item) !== "list-header") continue;
    let body = "";
    const nested: string[] = [];
    for (const child of Array.from(item.children)) {
      const local = name(child);
      if (DROP.has(local)) continue;
      if (local === "list") {
        nested.push(listElement(child, styles));
      } else if (local === "p" || local === "h") {
        // Paragraphs inside an item are the item's own text, not blocks of their own:
        // a `<p>` here would inherit the paragraph margin and space the list out.
        body += (body ? "<br>" : "") + inline(child, styles);
      } else {
        body += inline(child, styles);
      }
    }
    out += `<li>${body}${nested.join("")}</li>`;
  }
  return out;
}

function listElement(list: Element, styles: Styles): string {
  const tag = styles.ordered.has(attr(list, "style-name") ?? "") ? "ol" : "ul";
  return `<${tag}>${listItems(list, styles)}</${tag}>`;
}

/** How many columns one cell stands for, clamped: ODS pads rows out to 1024 or more. */
const MAX_COLUMNS = 512;

function tableElement(table: Element, styles: Styles): string {
  const rows: string[] = [];

  function walkRows(parent: Element, cellTag: "td" | "th"): void {
    for (const child of Array.from(parent.children)) {
      const local = name(child);
      if (local === "table-header-rows") {
        walkRows(child, "th");
        continue;
      }
      if (local === "table-rows" || local === "table-row-group") {
        walkRows(child, cellTag);
        continue;
      }
      if (local !== "table-row") continue;

      const cells: string[] = [];
      let columns = 0;
      for (const cell of Array.from(child.children)) {
        const cellName = name(cell);
        // A covered cell is the hidden remainder of a span; its neighbour's colspan
        // already accounts for it.
        if (cellName === "covered-table-cell") continue;
        if (cellName !== "table-cell") continue;

        const repeat = Math.min(Number(attr(cell, "number-columns-repeated") ?? 1) || 1, MAX_COLUMNS);
        const spanned = Number(attr(cell, "number-columns-spanned") ?? 1) || 1;
        const rowSpan = Number(attr(cell, "number-rows-spanned") ?? 1) || 1;
        const body = Array.from(cell.children)
          .filter((p) => !DROP.has(name(p)))
          .map((p) => inline(p, styles))
          .join("<br>");
        const attrs =
          (spanned > 1 ? ` colspan="${spanned}"` : "") + (rowSpan > 1 ? ` rowspan="${rowSpan}"` : "");
        for (let i = 0; i < repeat && columns < MAX_COLUMNS; i++, columns++) {
          cells.push(`<${cellTag}${attrs}>${body}</${cellTag}>`);
        }
      }

      // Trailing empties are padding, not columns. An .ods row is stored out to the
      // sheet's full width, so keeping them would paint hundreds of blank cells.
      while (cells.length && /^<t[dh][^>]*><\/t[dh]>$/.test(cells[cells.length - 1])) cells.pop();
      if (cells.length) rows.push(`<tr>${cells.join("")}</tr>`);
    }
  }

  walkRows(table, "td");
  return rows.length ? `<table>${rows.join("")}</table>` : "";
}

function blocks(node: Node, styles: Styles): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const local = name(el);
    if (DROP.has(local)) continue;

    switch (local) {
      case "h": {
        const level = Math.min(Math.max(Number(attr(el, "outline-level") ?? 1) || 1, 1), 6);
        const body = inline(el, styles);
        if (body) out += `<h${level}>${body}</h${level}>`;
        break;
      }
      case "p":
        out += `<p>${inline(el, styles)}</p>`;
        break;
      case "list":
        out += listElement(el, styles);
        break;
      case "table":
        out += tableElement(el, styles);
        break;
      default:
        // Frames, text boxes, sections, groups: containers around real blocks.
        out += blocks(el, styles);
    }
  }
  return out;
}

// --- Entry points --------------------------------------------------------

function parse(xml: string): Document {
  if (typeof DOMParser === "undefined") throw new Error("odf_unsupported");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("odf_malformed");
  return doc;
}

function bodyOf(doc: Document, local: string): Element | null {
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (name(el) === local) return el;
  }
  return null;
}

/**
 * A `.odt`'s `content.xml` as HTML.
 *
 * Exported separately from the zip wrapper so the walk is testable against a fixture
 * string, which is the convention `docx-html.test.ts` set: the interesting behaviour is
 * the XML, and building a zip to reach it would test JSZip.
 */
export function textDocumentHtml(xml: string): string {
  const doc = parse(xml);
  const body = bodyOf(doc, "text");
  return body ? blocks(body, readStyles(doc)) : "";
}

/**
 * A `.odp`'s `content.xml` as HTML, one section per slide.
 *
 * DELIBERATELY PARTIAL, and the pane says so (FR-3.3). A presentation is a visual
 * medium; this shows its text in reading order and nothing else — no shapes, no
 * positioning, no images, no speaker notes (`presentation:notes` is in `DROP`). The
 * alternative was to leave Impress files unopenable, which is what prompted the work.
 */
export function presentationHtml(xml: string, slideLabel: (n: number) => string): string {
  const doc = parse(xml);
  const body = bodyOf(doc, "presentation");
  if (!body) return "";
  const styles = readStyles(doc);

  const out: string[] = [];
  let n = 0;
  for (const page of Array.from(body.children)) {
    if (name(page) !== "page") continue;
    n += 1;

    // The title frame is marked as such by `presentation:class`, so it becomes the
    // section heading rather than another paragraph. A slide with no title frame gets
    // its own name, which is what LibreOffice's outline view shows.
    const frames = Array.from(page.children).filter((c) => !DROP.has(name(c)));
    const titleFrame = frames.find((f) => {
      const cls = attr(f, "class");
      return cls === "title" || cls === "subtitle";
    });
    // `inline` recurses through the frame's own wrappers (`draw:text-box`, `text:p`) by
    // default, so the title needs no path of its own.
    const title = titleFrame ? inline(titleFrame, styles).trim() : "";

    if (n > 1) out.push("<hr>");
    // `draw:name` is deliberately NOT the fallback: LibreOffice writes "page1" there,
    // which is an internal id rather than anything a reader would recognise.
    out.push(`<h2>${title || escapeText(slideLabel(n))}</h2>`);
    for (const frame of frames) {
      if (frame === titleFrame) continue;
      out.push(blocks(frame, styles));
    }
  }
  return out.join("");
}

/**
 * A `.ods`'s `content.xml` as the shape the spreadsheet pane already consumes.
 *
 * Cells report their DISPLAYED text — the `<text:p>` LibreOffice wrote — so a formula
 * cell shows its stored result and nothing here evaluates anything, matching the `.xlsx`
 * reader's documented behaviour (FR-4.3). `table:formula` is never read.
 */
export function spreadsheetSheets(xml: string, rowCap: number = SHEET_ROW_CAP): SheetPreview[] {
  const doc = parse(xml);
  const body = bodyOf(doc, "spreadsheet");
  if (!body) return [];

  const sheets: SheetPreview[] = [];
  for (const table of Array.from(body.children)) {
    if (name(table) !== "table") continue;

    const rows: string[][] = [];
    let truncated = false;
    // Empty rows are BUFFERED rather than emitted: a sheet is stored out to its full
    // height, so the last used row is followed by a repeat count in the thousands.
    // Flushing only when a non-empty row arrives drops that padding and keeps the blank
    // rows that sit between real ones.
    let pendingBlank = 0;

    for (const row of Array.from(table.getElementsByTagName("*"))) {
      if (name(row) !== "table-row") continue;
      const rowRepeat = Number(attr(row, "number-rows-repeated") ?? 1) || 1;

      const cells: string[] = [];
      let columns = 0;
      for (const cell of Array.from(row.children)) {
        const cellName = name(cell);
        if (cellName !== "table-cell" && cellName !== "covered-table-cell") continue;
        const repeat = Math.min(Number(attr(cell, "number-columns-repeated") ?? 1) || 1, MAX_COLUMNS);
        const text = cellText(cell);
        for (let i = 0; i < repeat && columns < MAX_COLUMNS; i++, columns++) cells.push(text);
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();

      if (!cells.length) {
        pendingBlank += rowRepeat;
        continue;
      }
      for (let i = 0; i < pendingBlank && rows.length < rowCap; i++) rows.push([]);
      pendingBlank = 0;

      for (let i = 0; i < rowRepeat; i++) {
        if (rows.length >= rowCap) {
          truncated = true;
          break;
        }
        rows.push(cells);
      }
      if (truncated) break;
    }

    sheets.push({ name: attr(table, "name") ?? `Sheet${sheets.length + 1}`, rows, truncated });
  }
  return sheets;
}

/** One cell as the member reads it: the text LibreOffice displayed, not the stored number. */
function cellText(cell: Element): string {
  const parts: string[] = [];
  for (const p of Array.from(cell.children)) {
    if (DROP.has(name(p))) continue;
    parts.push(p.textContent ?? "");
  }
  const text = parts.join("\n").trim();
  // A cell can carry a value with no display paragraph when it was written by a tool
  // rather than by LibreOffice.
  return text || (attr(cell, "value") ?? "").trim();
}

// --- The container -------------------------------------------------------

/**
 * `content.xml` out of an OpenDocument package.
 *
 * JSZip rather than a smaller zip library, and rather than reaching through `exceljs`
 * for it: it is already in the lockfile as that package's own dependency, so promoting
 * it to a direct one costs nothing to install and lets both lazy chunks share a copy —
 * while shipping `fflate` alongside it would put two zip implementations in the same
 * bundle (DEC-4). Imported dynamically, like `mammoth` and `exceljs` before it, so a
 * conversation that opens no OpenDocument file downloads neither this nor JSZip.
 */
export async function readOdfContent(bytes: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("content.xml");
  if (!entry) throw new Error("odf_malformed");
  return entry.async("string");
}
