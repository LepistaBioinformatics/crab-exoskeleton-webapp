import { describe, it, expect } from "vitest";
import {
  PREVIEW_TEXT_MAX,
  BINARY_SNIFF_BYTES,
  fileTypeGroup,
  isDocumentKind,
  isSheetKind,
  looksBinary,
  mediaUrl,
  previewBlobType,
  previewKind,
  resolveMediaRef,
} from "@/lib/media";
import type { Workspace } from "@/app/chat/fragment";

const workspace = { t: "acme", s: "growth", r: "alpha" } as Workspace;
const inProject = { ...workspace, p: "proj-1" } as Workspace;

// Which files the panel offers to SHOW. The set is deliberately narrower than the
// upload allowlist, so the interesting assertions are the exclusions.
describe("previewKind", () => {
  it("recognises every previewable extension", () => {
    expect(previewKind("photo.png")).toBe("image");
    expect(previewKind("photo.jpg")).toBe("image");
    expect(previewKind("photo.jpeg")).toBe("image");
    expect(previewKind("photo.webp")).toBe("image");
    expect(previewKind("photo.gif")).toBe("image");
    expect(previewKind("report.md")).toBe("markdown");
    expect(previewKind("notes.txt")).toBe("text");
    expect(previewKind("rows.csv")).toBe("text");
    expect(previewKind("paper.pdf")).toBe("pdf");
  });

  // The agent writes REPORT.MD as readily as report.md; a case-sensitive check
  // would look like a menu that works on some files and not others.
  it("ignores case", () => {
    expect(previewKind("REPORT.MD")).toBe("markdown");
    expect(previewKind("Photo.PNG")).toBe("image");
  });

  // FR-4.1 / FR-4.2, and the reason the two BINARY ancestors stay out: mammoth and
  // exceljs read the zipped XML formats, not `.doc` and `.xls`.
  it("previews the office formats it can actually read", () => {
    expect(previewKind("report.docx")).toBe("docx");
    expect(previewKind("sheet.xlsx")).toBe("xlsx");
    expect(previewKind("legacy.doc")).toBeNull();
    expect(previewKind("legacy.xls")).toBeNull();
  });

  // preview-formatting-and-odf FR-3. The OpenDocument family were the last office
  // formats with no way to be read in the browser at all. Each keeps a kind of its OWN
  // even though `.odt` shares the word-processor pane with `.docx` and `.ods` shares the
  // spreadsheet pane with `.xlsx`: the kind is what selects the READER, so collapsing
  // them would move that decision out of this table and into the component.
  it("previews the OpenDocument family", () => {
    expect(previewKind("report.odt")).toBe("odt");
    expect(previewKind("budget.ods")).toBe("ods");
    expect(previewKind("deck.odp")).toBe("odp");
    expect(previewKind("REPORT.ODT")).toBe("odt");
  });

  it("routes each office kind to the pane that paints it", () => {
    for (const n of ["report.docx", "report.odt", "deck.odp"]) {
      expect(isDocumentKind(previewKind(n)!)).toBe(true);
      expect(isSheetKind(previewKind(n)!)).toBe(false);
    }
    for (const n of ["sheet.xlsx", "budget.ods"]) {
      expect(isSheetKind(previewKind(n)!)).toBe(true);
      expect(isDocumentKind(previewKind(n)!)).toBe(false);
    }
    // The text kinds belong to neither, which is what keeps the `<pre>` paths separate.
    for (const n of ["notes.txt", "run.py", "report.md"]) {
      expect(isDocumentKind(previewKind(n)!)).toBe(false);
      expect(isSheetKind(previewKind(n)!)).toBe(false);
    }
  });

  it("refuses what it cannot render, so the menu stays download-only", () => {
    expect(previewKind("slides.pptx")).toBeNull();
    expect(previewKind("bundle.zip")).toBeNull();
    expect(previewKind("archive.tar.gz")).toBeNull();
  });

  // preview-plain-text-fallback FR-1. The default inverted: an extension nobody here has
  // heard of reads as PLAIN TEXT rather than losing the menu entry. It costs nothing of
  // the origin's posture — text renders escaped inside a `<pre>`, exactly as `.txt`
  // always has — because what the old refusal actually bought was protection from
  // mojibake, not from injection.
  it("reads an unrecognised extension as plain text", () => {
    for (const n of ["notes.rst", "data.ndjson", "app.conf2", "thing.xyzzy", "f.qwerty"]) {
      expect(previewKind(n), n).toBe("text");
    }
  });

  it("still refuses the formats that would only be mojibake", () => {
    for (const n of [
      "bundle.zip",
      "clip.mp4",
      "song.mp3",
      "font.woff2",
      "lib.so",
      "app.exe",
      "photo.heic",
      "store.sqlite",
      "legacy.doc",
      "slides.key",
    ]) {
      expect(previewKind(n), n).toBeNull();
    }
  });

  // file-preview-in-pane FR-1.1. The agent writes scripts and configs constantly and
  // every one of them was download-only, while the chat has highlighted the same
  // languages in code blocks all along. The list is DERIVED from that highlighter's
  // alias table rather than written out again here — two lists of languages drift.
  it("previews any file the chat could already highlight", () => {
    for (const name of [
      "run.py",
      "deploy.sh",
      "server.ts",
      "app.jsx",
      "main.go",
      "lib.rs",
      "query.sql",
      "compose.yml",
      "pyproject.toml",
      "settings.ini",
    ]) {
      expect(previewKind(name), name).toBe("code");
    }
  });

  // FR-1.3, and the line that keeps this expansion honest: `html` maps to the xml
  // grammar, so it is shown as SOURCE. Nothing a member uploads renders as markup
  // from this origin — which is the invariant that let the old list stay short.
  it("shows markup as source, never as markup", () => {
    expect(previewKind("page.html")).toBe("code");
    expect(previewKind("feed.xml")).toBe("code");
  });

  // FR-1.2: plain text with no grammar to colour.
  it("keeps grammar-less text as text", () => {
    expect(previewKind("server.log")).toBe("text");
    expect(previewKind("notes.txt")).toBe("text");
  });

  // preview-plain-text-fallback FR-1. These used to be null, and the refusal was
  // incidental rather than intended: the check keyed on a SUFFIX, so a file whose whole
  // name is its name lost the menu entry. `README` and `.gitignore` are text a member
  // opens constantly.
  it("reads a name with no usable extension as plain text", () => {
    expect(previewKind("README")).toBe("text");
    expect(previewKind("CHANGELOG")).toBe("text");
    expect(previewKind(".gitignore")).toBe("text");
    expect(previewKind(".prettierrc")).toBe("text");
    // Nothing to preview at all, which is still an answer of its own.
    expect(previewKind("")).toBeNull();
    expect(previewKind("uploads/")).toBeNull();
  });

  // A folder in the path must not be mistaken for the extension: only the leaf's
  // last dot counts.
  it("reads the extension from the leaf, not the path", () => {
    expect(previewKind("uploads/2026.reports/q2.md")).toBe("markdown");
    expect(previewKind("uploads/v1.2/notes.txt")).toBe("text");
  });
});

// The recurring defect in this layer is a `project` that silently does not travel:
// the request then reads the AGENT's workspace and 404s, which looks like a missing
// file rather than a missing parameter.
describe("mediaUrl", () => {
  it("carries the workspace triple", () => {
    const q = new URLSearchParams(mediaUrl(workspace, "uploads/a.png").split("?")[1]);
    expect(q.get("tenant_id")).toBe("acme");
    expect(q.get("subs_acc_id")).toBe("growth");
    expect(q.get("role")).toBe("alpha");
    expect(q.get("path")).toBe("uploads/a.png");
    expect(q.get("project")).toBeNull();
  });

  it("carries the project when the view is inside one", () => {
    const q = new URLSearchParams(mediaUrl(inProject, "uploads/a.png").split("?")[1]);
    expect(q.get("project")).toBe("proj-1");
  });
});

// `![](diagram.png)` inside a previewed markdown file resolves against the WEBAPP's
// origin unless it is rewritten — a broken image reads as a bug, not as a limit.
describe("resolveMediaRef", () => {
  it("resolves a sibling against the file's own folder", () => {
    expect(resolveMediaRef("uploads/reports/q2.md", "diagram.png")).toBe(
      "uploads/reports/diagram.png",
    );
  });

  it("resolves a subfolder reference", () => {
    expect(resolveMediaRef("uploads/reports/q2.md", "img/a.png")).toBe(
      "uploads/reports/img/a.png",
    );
  });

  it("normalises ./ and ../ instead of sending them upstream", () => {
    expect(resolveMediaRef("uploads/reports/q2.md", "./a.png")).toBe("uploads/reports/a.png");
    expect(resolveMediaRef("uploads/reports/q2.md", "../shared/logo.png")).toBe(
      "uploads/shared/logo.png",
    );
  });

  // A file at the tree root has no folder segment; joining naively would produce
  // the doubled separator "uploads//a.png".
  it("produces no doubled separator at the root", () => {
    expect(resolveMediaRef("uploads/q2.md", "a.png")).toBe("uploads/a.png");
    expect(resolveMediaRef("q2.md", "a.png")).toBe("a.png");
  });

  it("leaves anything already absolute alone", () => {
    expect(resolveMediaRef("uploads/q2.md", "https://example.com/a.png")).toBeNull();
    expect(resolveMediaRef("uploads/q2.md", "http://example.com/a.png")).toBeNull();
    expect(resolveMediaRef("uploads/q2.md", "data:image/png;base64,AAA")).toBeNull();
    expect(resolveMediaRef("uploads/q2.md", "/logo.png")).toBeNull();
    expect(resolveMediaRef("uploads/q2.md", "")).toBeNull();
  });
});

// Checked against the LISTING's size, before the request — an unbounded blob.text()
// on a large CSV freezes the tab rather than failing.
describe("PREVIEW_TEXT_MAX", () => {
  it("is 2 MB", () => {
    expect(PREVIEW_TEXT_MAX).toBe(2 * 1024 * 1024);
  });
});

// The proxy serves every media file as `application/octet-stream` with
// `Content-Disposition: attachment` — a deliberate posture, since a member's file is
// untrusted content that must never render inline from this origin. `res.blob()`
// inherits that type, and a browser trusts the blob over an `<object type=…>`
// attribute, so a PDF preview showed the fallback in Firefox and DOWNLOADED itself in
// Chromium while the modal sat open behind it.
describe("previewBlobType", () => {
  it("asserts application/pdf, which the transport does not", () => {
    expect(previewBlobType("pdf")).toBe("application/pdf");
  });

  it("leaves images alone — <img> sniffs the bytes and ignores the type", () => {
    expect(previewBlobType("image")).toBeNull();
  });

  it("leaves the text kinds alone — they are read as text, never framed", () => {
    expect(previewBlobType("markdown")).toBeNull();
    expect(previewBlobType("text")).toBeNull();
  });
});

// The row deliberately had NO icon before this: a generic file glyph was identical on
// every line, so it carried nothing while costing the name its width (the reasoning is
// recorded in uploads-sidebar.tsx). A TYPE icon is a different proposition — it only
// earns that width by varying, which is what these assertions are really about.
// preview-plain-text-fallback FR-2. The half of the fallback that does not guess: an
// extension table only speaks for names it has seen, and the point of a fallback is the
// names it has not, so the bytes get the last word.
describe("looksBinary", () => {
  const bytes = (...values: number[]) => new Uint8Array(values).buffer;

  it("calls ordinary text text", () => {
    expect(looksBinary(new TextEncoder().encode("key: value\n  - one\n").buffer)).toBe(false);
  });

  it("calls a NUL binary", () => {
    expect(looksBinary(bytes(0x50, 0x4b, 0x03, 0x04, 0x00, 0x00))).toBe(true);
  });

  it("reads an empty file as text rather than as an error", () => {
    expect(looksBinary(new ArrayBuffer(0))).toBe(false);
  });

  it("keeps UTF-8 above the ASCII range as text", () => {
    // The failure this guards: treating a high byte as binary would refuse every
    // accented file the agent writes.
    expect(looksBinary(new TextEncoder().encode("ação — ü ß 日本語").buffer)).toBe(false);
  });

  it("only inspects the head, so a NUL past the window is not searched for", () => {
    const buf = new Uint8Array(BINARY_SNIFF_BYTES + 16).fill(0x61);
    buf[BINARY_SNIFF_BYTES + 4] = 0;
    expect(looksBinary(buf.buffer)).toBe(false);
    // ...and one inside it is found.
    const near = new Uint8Array(BINARY_SNIFF_BYTES + 16).fill(0x61);
    near[10] = 0;
    expect(looksBinary(near.buffer)).toBe(true);
  });
});

describe("fileTypeGroup", () => {
  it("separates the groups a member actually distinguishes at a glance", () => {
    expect(fileTypeGroup("report.pdf")).toBe("pdf");
    expect(fileTypeGroup("logo.png")).toBe("image");
    expect(fileTypeGroup("notes.md")).toBe("markdown");
    expect(fileTypeGroup("data.csv")).toBe("sheet");
    expect(fileTypeGroup("export.xlsx")).toBe("sheet");
    expect(fileTypeGroup("bundle.zip")).toBe("archive");
    expect(fileTypeGroup("script.py")).toBe("code");
    expect(fileTypeGroup("voice.mp3")).toBe("audio");
    expect(fileTypeGroup("clip.mp4")).toBe("video");
    expect(fileTypeGroup("readme.txt")).toBe("text");
  });

  // preview-formatting-and-odf FR-3.5. `docx` and `doc` were never in this table at all,
  // so a Word file has been drawing the neutral `unknown` glyph since it was written —
  // a gap that predates the OpenDocument work and was found by it.
  it("gives a word-processor document a group of its own", () => {
    expect(fileTypeGroup("q2.docx")).toBe("document");
    expect(fileTypeGroup("legacy.doc")).toBe("document");
    expect(fileTypeGroup("q2.odt")).toBe("document");
    expect(fileTypeGroup("deck.odp")).toBe("document");
    // A Calc file is a spreadsheet before it is a LibreOffice file: the group is what a
    // member distinguishes at a glance, and "spreadsheet" is that distinction.
    expect(fileTypeGroup("budget.ods")).toBe("sheet");
  });

  it("falls back to a neutral group rather than guessing", () => {
    expect(fileTypeGroup("Makefile")).toBe("unknown");
    expect(fileTypeGroup("archive.tar.gz")).toBe("archive");
    expect(fileTypeGroup(".gitignore")).toBe("unknown");
  });

  it("reads the extension off the LEAF, not the path", () => {
    // A folder carrying a dot is ordinary ("2026.reports/"), and previewKind already
    // had this bug shape covered — the same trap applies here.
    expect(fileTypeGroup("public/2026.reports/q2.md")).toBe("markdown");
    expect(fileTypeGroup("public/v1.2/notes")).toBe("unknown");
  });

  it("is case-insensitive, because an agent writes REPORT.PDF sometimes", () => {
    expect(fileTypeGroup("REPORT.PDF")).toBe("pdf");
  });
});
