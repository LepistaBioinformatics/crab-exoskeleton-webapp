import { describe, it, expect } from "vitest";
import { split } from "./frontmatter";

const SKILL = `---
name: pdf
description: Read, merge, split, rotate, watermark PDF files
---

# PDF skill

Body.`;

describe("split", () => {
  // THE COMPLAINT, stated as a test. With remark-gfm alone this file rendered as
  // an <hr> followed by an <h2> reading "name: pdf description: Read, merge..." --
  // the largest thing on the page, above the document's own title.
  it("takes the block out of what the markdown renderer is given", () => {
    const { frontmatter, body } = split(SKILL);
    expect(frontmatter).toEqual([
      { key: "name", value: "pdf" },
      { key: "description", value: "Read, merge, split, rotate, watermark PDF files" },
    ]);
    expect(body).not.toContain("name: pdf");
    expect(body.trim()).toBe("# PDF skill\n\nBody.");
  });

  it("leaves a document without frontmatter exactly as it was", () => {
    const doc = "# Title\n\nSome text.";
    expect(split(doc)).toEqual({ frontmatter: null, body: doc });
  });

  // FR-3. The alternative is to treat everything after the opening fence as
  // metadata, which hides an arbitrary amount of the file and says nothing.
  it("renders an unterminated block whole rather than eating the document", () => {
    const doc = "---\nname: broken\n\n# Still a document\n\nAnd its body.";
    const { frontmatter, body } = split(doc);
    expect(frontmatter).toBeNull();
    expect(body).toBe(doc);
  });

  // A thematic break, or the underline of a setext heading. Both are ordinary
  // markdown and neither is metadata.
  it("ignores a fence that is not the first content line", () => {
    const doc = "# Title\n\n---\n\nAfter the rule.";
    expect(split(doc).frontmatter).toBeNull();
  });

  it("skips a BOM and blank lines before the opening fence", () => {
    const { frontmatter } = split("﻿\n\n---\nname: pdf\n---\n\nBody.");
    expect(frontmatter).toEqual([{ key: "name", value: "pdf" }]);
  });

  it("splits on the first colon, so a value may contain one", () => {
    const { frontmatter } = split("---\ndescription: Use this for: PDFs\n---\n");
    expect(frontmatter).toEqual([{ key: "description", value: "Use this for: PDFs" }]);
  });

  // One layer, matching both Go readers. A value that is quoted twice keeps the
  // inner pair, because that is what they pass to the model.
  it("strips one layer of matching quotes", () => {
    const { frontmatter } = split(`---\nname: "pdf"\nalso: 'x'\nnested: "'y'"\n---\n`);
    expect(frontmatter).toEqual([
      { key: "name", value: "pdf" },
      { key: "also", value: "x" },
      { key: "nested", value: "'y'" },
    ]);
  });

  // WHERE THIS PARTS COMPANY WITH THE VALIDATORS. The proxy keeps `name` and
  // `description` and drops the rest; a reviewer needs to see the field nobody
  // reads -- that is what they opened the file to find.
  it("keeps a field the proxy's parser would ignore", () => {
    const { frontmatter } = split("---\nname: pdf\nallowed-tools: sh\n---\n");
    expect(frontmatter).toContainEqual({ key: "allowed-tools", value: "sh" });
  });

  it("keeps a malformed line verbatim instead of dropping it", () => {
    const { frontmatter } = split("---\nname: pdf\nthis line has no colon\n---\n");
    expect(frontmatter).toContainEqual({ key: null, value: "this line has no colon" });
  });

  it("drops blank lines inside the block, which carry nothing", () => {
    const { frontmatter } = split("---\nname: pdf\n\ndescription: x\n---\n");
    expect(frontmatter).toHaveLength(2);
  });

  it("handles CRLF, since a file may arrive with it", () => {
    const { frontmatter, body } = split("---\r\nname: pdf\r\n---\r\n\r\n# Title");
    expect(frontmatter).toEqual([{ key: "name", value: "pdf" }]);
    expect(body).toContain("# Title");
  });

  it("reports an empty block rather than claiming there is none", () => {
    expect(split("---\n---\n\n# Title").frontmatter).toEqual([]);
  });
});
