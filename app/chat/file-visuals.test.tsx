import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { FileTypeIcon, FILE_TYPE_TONE } from "./file-visuals";
import type { FileTypeGroup } from "@/lib/media";

// Reported in use: a column of identical grey glyphs is a column a member reads the
// names of, one by one. Colour is what lets "the spreadsheet" and "the picture" be
// found by shape and hue before the name is read at all.
describe("FileTypeIcon", () => {
  const groups: FileTypeGroup[] = [
    "pdf", "image", "markdown", "text", "sheet", "archive", "code", "audio", "video", "unknown",
  ];

  it("gives every group a tone", () => {
    for (const g of groups) expect(FILE_TYPE_TONE[g], g).toBeTruthy();
  });

  // The point is DISTINCTION, so the tones have to differ where a member tells the
  // types apart: a spreadsheet must not look like a picture.
  it("tells the common types apart by colour", () => {
    const distinct = new Set(
      (["pdf", "image", "sheet", "code", "archive"] as FileTypeGroup[]).map((g) => FILE_TYPE_TONE[g]),
    );
    expect(distinct.size).toBe(5);
  });

  // `unknown` stays quiet: a confident colour on a type we did not recognise says
  // something we do not know.
  it("leaves an unrecognised type muted", () => {
    expect(FILE_TYPE_TONE.unknown).toContain("muted");
  });

  it("paints the glyph with its group's tone", () => {
    const html = renderToStaticMarkup(<FileTypeIcon group="sheet" />);
    expect(html).toContain(FILE_TYPE_TONE.sheet);
  });
});
