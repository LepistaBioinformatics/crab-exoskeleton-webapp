import { describe, it, expect } from "vitest";
import { PREVIEW_TEXT_MAX, mediaUrl, previewKind, resolveMediaRef } from "@/lib/media";
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

  it("refuses what it cannot render, so the menu stays download-only", () => {
    expect(previewKind("sheet.xlsx")).toBeNull();
    expect(previewKind("doc.docx")).toBeNull();
    expect(previewKind("slides.pptx")).toBeNull();
    expect(previewKind("bundle.zip")).toBeNull();
  });

  it("handles names with no usable extension", () => {
    expect(previewKind("README")).toBeNull();
    expect(previewKind(".gitignore")).toBeNull();
    expect(previewKind("")).toBeNull();
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
