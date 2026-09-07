// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { textDocumentHtml, presentationHtml, spreadsheetSheets } from "@/lib/odf";
import { sanitizeDocxHtml } from "@/lib/docx-html";

// preview-formatting-and-odf T3. Fixture `content.xml` strings rather than real files,
// the convention `docx-html.test.ts` set: the interesting behaviour is the XML walk, and
// building a zip to reach it would be testing JSZip.
//
// The namespace declarations are real ones from the ODF spec and are not decoration —
// an undeclared prefix is a well-formedness error, so a fixture without them would fail
// to parse rather than exercise anything.
const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
].join(" ");

function content(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}>${inner}</office:document-content>`;
}

function textDoc(body: string, styles = ""): string {
  return content(
    `<office:automatic-styles>${styles}</office:automatic-styles>` +
      `<office:body><office:text>${body}</office:text></office:body>`,
  );
}

describe("textDocumentHtml", () => {
  it("keeps heading levels from text:outline-level", () => {
    const html = textDocumentHtml(
      textDoc('<text:h text:outline-level="1">Q2</text:h><text:h text:outline-level="3">Detail</text:h>'),
    );
    expect(html).toContain("<h1>Q2</h1>");
    expect(html).toContain("<h3>Detail</h3>");
  });

  it("clamps an outline level past six", () => {
    const html = textDocumentHtml(textDoc('<text:h text:outline-level="9">Deep</text:h>'));
    expect(html).toContain("<h6>Deep</h6>");
  });

  // DEC-8: ODF carries no <strong>. Emphasis is a style reference resolved through
  // office:automatic-styles, and skipping this is what makes a naive ODF extraction read
  // worse than the .docx path it sits beside.
  it("resolves bold and italic through the automatic-style table", () => {
    const styles =
      '<style:style style:name="T1" style:family="text">' +
      '<style:text-properties fo:font-weight="bold"/></style:style>' +
      '<style:style style:name="T2" style:family="text">' +
      '<style:text-properties fo:font-style="italic"/></style:style>';
    const html = textDocumentHtml(
      textDoc(
        '<text:p>Revenue <text:span text:style-name="T1">up</text:span>' +
          ' <text:span text:style-name="T2">12%</text:span></text:p>',
        styles,
      ),
    );
    expect(html).toContain("<strong>up</strong>");
    expect(html).toContain("<em>12%</em>");
  });

  it("reads a numeric font-weight as bold", () => {
    const styles =
      '<style:style style:name="T1" style:family="text">' +
      '<style:text-properties fo:font-weight="700"/></style:style>';
    const html = textDocumentHtml(
      textDoc('<text:p><text:span text:style-name="T1">heavy</text:span></text:p>', styles),
    );
    expect(html).toContain("<strong>heavy</strong>");
  });

  it("leaves an unstyled span alone", () => {
    const html = textDocumentHtml(textDoc('<text:p><text:span text:style-name="T9">plain</text:span></text:p>'));
    expect(html).toBe("<p>plain</p>");
  });

  it("nests a list inside its item, and numbers one whose style says so", () => {
    const styles =
      '<text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>';
    const html = textDocumentHtml(
      textDoc(
        '<text:list text:style-name="L1"><text:list-item><text:p>one</text:p>' +
          "<text:list><text:list-item><text:p>one.a</text:p></text:list-item></text:list>" +
          "</text:list-item></text:list>",
        styles,
      ),
    );
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>one<ul><li>one.a</li></ul></li>");
  });

  it("defaults an unnumbered list to a bullet list", () => {
    const html = textDocumentHtml(
      textDoc("<text:list><text:list-item><text:p>a</text:p></text:list-item></text:list>"),
    );
    expect(html).toContain("<ul><li>a</li></ul>");
  });

  it("expands a repeated column and drops the trailing padding", () => {
    const html = textDocumentHtml(
      textDoc(
        "<table:table><table:table-row>" +
          '<table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell>' +
          '<table:table-cell table:number-columns-repeated="900"/>' +
          "</table:table-row></table:table>",
      ),
    );
    expect(html).toBe("<table><tr><td>x</td><td>x</td></tr></table>");
  });

  it("promotes header rows to th", () => {
    const html = textDocumentHtml(
      textDoc(
        "<table:table><table:table-header-rows><table:table-row>" +
          "<table:table-cell><text:p>Name</text:p></table:table-cell>" +
          "</table:table-row></table:table-header-rows>" +
          "<table:table-row><table:table-cell><text:p>Ada</text:p></table:table-cell></table:table-row>" +
          "</table:table>",
      ),
    );
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<td>Ada</td>");
  });

  it("keeps a web link and drops one that could do anything else", () => {
    const ok = textDocumentHtml(
      textDoc('<text:p><text:a xlink:href="https://example.com">site</text:a></text:p>'),
    );
    expect(ok).toContain('<a href="https://example.com">site</a>');

    const bad = textDocumentHtml(
      textDoc('<text:p><text:a xlink:href="javascript:alert(1)">click</text:a></text:p>'),
    );
    expect(bad).not.toContain("javascript:");
    expect(bad).toContain("click");
  });

  // The default for an unknown element is to RECURSE, because ODF wraps real content in
  // bookmarks and change marks. That default is only safe because the containers whose
  // content must not survive are named explicitly — and tracked changes hold the text a
  // reviewer DELETED.
  it("does not resurrect deleted text from tracked changes", () => {
    const html = textDocumentHtml(
      textDoc(
        "<text:tracked-changes><text:changed-region><text:deletion>" +
          "<text:p>removed sentence</text:p></text:deletion></text:changed-region></text:tracked-changes>" +
          "<text:p>kept</text:p>",
      ),
    );
    expect(html).not.toContain("removed sentence");
    expect(html).toContain("kept");
  });

  it("keeps the text around a bookmark it does not know", () => {
    const html = textDocumentHtml(
      textDoc('<text:p>before <text:bookmark text:name="b"/>after</text:p>'),
    );
    expect(html).toContain("before after");
  });

  it("drops annotations and embedded object bytes", () => {
    const html = textDocumentHtml(
      textDoc(
        "<text:p>body<office:annotation><text:p>reviewer note</text:p></office:annotation></text:p>" +
          "<draw:frame><office:binary-data>AAAA</office:binary-data></draw:frame>",
      ),
    );
    expect(html).not.toContain("reviewer note");
    expect(html).not.toContain("AAAA");
    expect(html).toContain("body");
  });

  // FR-4.1 — safe by construction here, and filtered AGAIN at the call site. Two filters
  // is the point, but it only works if the second one passes this one's output through:
  // formatting silently eaten there would be invisible, because the walk's own tests
  // never see it.
  //
  // Asserted as survival rather than as byte-equality on purpose. `sanitizeDocxHtml`
  // parses with `text/html`, and the HTML parser INSERTS a `<tbody>` into any table that
  // lacks one — so a byte-comparison would fail on a detail that changes nothing, while
  // a plain-text fixture (which is what this test used to be) would pass without
  // exercising a table or a nested span at all.
  it("survives the sanitizer the call site puts it through", () => {
    const styles =
      '<style:style style:name="T1" style:family="text"><style:text-properties ' +
      'fo:font-weight="bold" fo:font-style="italic" style:text-underline-style="solid"/></style:style>';
    const html = textDocumentHtml(
      textDoc(
        '<text:h text:outline-level="2">Head</text:h>' +
          '<text:p><text:span text:style-name="T1">all three</text:span></text:p>' +
          "<text:list><text:list-item><text:p>item</text:p></text:list-item></text:list>" +
          "<table:table><table:table-header-rows><table:table-row>" +
          "<table:table-cell><text:p>H</text:p></table:table-cell></table:table-row>" +
          "</table:table-header-rows><table:table-row>" +
          '<table:table-cell table:number-columns-spanned="2"><text:p>wide</text:p></table:table-cell>' +
          "</table:table-row></table:table>",
        styles,
      ),
    );
    const clean = sanitizeDocxHtml(html);
    for (const kept of [
      "<h2>Head</h2>",
      "<strong>",
      "<em>",
      "<u>",
      "all three",
      "<li>item</li>",
      "<th>H</th>",
      'colspan="2"',
      "wide",
    ]) {
      expect(clean, `${kept} did not survive the sanitizer`).toContain(kept);
    }
    // The only difference the second filter is allowed to make.
    expect(clean.replace(/<\/?tbody>/g, "")).toBe(html);
  });

  it("emits no markup of the member's own", () => {
    const html = textDocumentHtml(textDoc("<text:p>&lt;script&gt;alert(1)&lt;/script&gt;</text:p>"));
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(sanitizeDocxHtml(html)).toBe(html);
  });

  it("returns nothing for a spreadsheet handed to the text walker", () => {
    expect(textDocumentHtml(content("<office:body><office:spreadsheet/></office:body>"))).toBe("");
  });

  it("refuses malformed XML rather than guessing", () => {
    expect(() => textDocumentHtml("<office:document-content>")).toThrow("odf_malformed");
  });
});

describe("presentationHtml", () => {
  const label = (n: number) => `Slide ${n}`;

  function deck(pages: string): string {
    return content(`<office:body><office:presentation>${pages}</office:presentation></office:body>`);
  }

  it("makes each slide a section, titled by its title frame", () => {
    const html = presentationHtml(
      deck(
        '<draw:page draw:name="page1">' +
          '<draw:frame presentation:class="title"><draw:text-box><text:p>Agenda</text:p></draw:text-box></draw:frame>' +
          "<draw:frame><draw:text-box><text:p>first point</text:p></draw:text-box></draw:frame>" +
          "</draw:page>" +
          '<draw:page draw:name="page2">' +
          "<draw:frame><draw:text-box><text:p>second slide body</text:p></draw:text-box></draw:frame>" +
          "</draw:page>",
      ),
      label,
    );
    expect(html).toContain("<h2>Agenda</h2>");
    expect(html).toContain("<p>first point</p>");
    // No title frame on slide two, and `draw:name` is an internal id rather than a name.
    expect(html).toContain("<h2>Slide 2</h2>");
    expect(html).not.toContain("page2");
    // A rule between slides, but not before the first.
    expect(html.indexOf("<hr>")).toBeGreaterThan(html.indexOf("Agenda"));
    expect(html.startsWith("<hr>")).toBe(false);
  });

  it("leaves speaker notes out", () => {
    const html = presentationHtml(
      deck(
        '<draw:page draw:name="page1">' +
          "<draw:frame><draw:text-box><text:p>on the slide</text:p></draw:text-box></draw:frame>" +
          "<presentation:notes><draw:frame><draw:text-box><text:p>say this out loud</text:p>" +
          "</draw:text-box></draw:frame></presentation:notes></draw:page>",
      ),
      label,
    );
    expect(html).toContain("on the slide");
    expect(html).not.toContain("say this out loud");
  });
});

describe("spreadsheetSheets", () => {
  function book(tables: string): string {
    return content(`<office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body>`);
  }

  function cell(text: string): string {
    return `<table:table-cell office:value-type="string"><text:p>${text}</text:p></table:table-cell>`;
  }

  it("reads a sheet's name and its rows", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="Revenue">' +
          `<table:table-row>${cell("Region")}${cell("Q2")}</table:table-row>` +
          `<table:table-row>${cell("EMEA")}${cell("120")}</table:table-row>` +
          "</table:table>",
      ),
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Revenue");
    expect(sheets[0].rows).toEqual([
      ["Region", "Q2"],
      ["EMEA", "120"],
    ]);
    expect(sheets[0].truncated).toBe(false);
  });

  // The defect this guards is what makes a naive .ods reader unusable: a sheet is stored
  // out to its full width and height, so the last used cell is followed by a repeat count
  // in the hundreds and the last used row by one in the thousands.
  it("drops the padding a sheet is stored with", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S">' +
          `<table:table-row>${cell("a")}<table:table-cell table:number-columns-repeated="1020"/></table:table-row>` +
          '<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>' +
          "</table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["a"]]);
    expect(sheets[0].truncated).toBe(false);
  });

  it("keeps a blank row that sits between real ones", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S">' +
          `<table:table-row>${cell("a")}</table:table-row>` +
          "<table:table-row><table:table-cell/></table:table-row>" +
          `<table:table-row>${cell("b")}</table:table-row>` +
          "</table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["a"], [], ["b"]]);
  });

  it("expands a repeated cell that actually carries a value", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S"><table:table-row>' +
          '<table:table-cell table:number-columns-repeated="3" office:value-type="string">' +
          "<text:p>x</text:p></table:table-cell></table:table-row></table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["x", "x", "x"]]);
  });

  // FR-4.3, matching the .xlsx reader: the stored RESULT is what a member reads, and
  // nothing here evaluates anything.
  it("shows a formula cell's stored result and never its formula", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S"><table:table-row>' +
          '<table:table-cell table:formula="of:=SUM([.A1:.A9])" office:value-type="float" office:value="42">' +
          "<text:p>42</text:p></table:table-cell></table:table-row></table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["42"]]);
    expect(JSON.stringify(sheets)).not.toContain("SUM");
  });

  it("falls back to the stored value when a tool wrote no display text", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S"><table:table-row>' +
          '<table:table-cell office:value-type="float" office:value="7"/>' +
          "</table:table-row></table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["7"]]);
  });

  it("reports the row cap instead of painting past it", () => {
    const rows = Array.from({ length: 8 }, () => `<table:table-row>${cell("r")}</table:table-row>`).join("");
    const sheets = spreadsheetSheets(book(`<table:table table:name="S">${rows}</table:table>`), 5);
    expect(sheets[0].rows).toHaveLength(5);
    expect(sheets[0].truncated).toBe(true);
  });

  // Rows are not always direct children: ODS wraps them in header-row and row-group
  // elements. The HTML walk handles those explicitly; this one reads DESCENDANTS, which
  // is what makes it agree without a second wrapper list to keep in sync.
  it("reads rows out of the group wrappers ODS puts them in", () => {
    const sheets = spreadsheetSheets(
      book(
        '<table:table table:name="S">' +
          `<table:table-header-rows><table:table-row>${cell("Header")}</table:table-row></table:table-header-rows>` +
          `<table:table-row-group><table:table-row>${cell("grouped")}</table:table-row></table:table-row-group>` +
          `<table:table-row>${cell("plain")}</table:table-row>` +
          "</table:table>",
      ),
    );
    expect(sheets[0].rows).toEqual([["Header"], ["grouped"], ["plain"]]);
  });

  it("returns every sheet in the book", () => {
    const sheets = spreadsheetSheets(
      book(
        `<table:table table:name="One"><table:table-row>${cell("1")}</table:table-row></table:table>` +
          `<table:table table:name="Two"><table:table-row>${cell("2")}</table:table-row></table:table>`,
      ),
    );
    expect(sheets.map((s) => s.name)).toEqual(["One", "Two"]);
  });
});
