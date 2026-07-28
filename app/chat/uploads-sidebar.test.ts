import { describe, expect, it } from "vitest";
import { allFolderPaths, buildFileTree, type DirNode, type TreeNode } from "./uploads-sidebar";
import type { Attachment } from "@/lib/media";

const file = (name: string): Attachment => ({ path: `uploads/${name}`, name, size: 1 });
const leaves = (nodes: TreeNode[]) => nodes.map((n) => n.leaf);
const dir = (nodes: TreeNode[], leaf: string): DirNode => {
  const found = nodes.find((n) => n.kind === "dir" && n.leaf === leaf);
  if (!found || found.kind !== "dir") throw new Error(`no folder ${leaf} in ${leaves(nodes)}`);
  return found;
};

describe("buildFileTree", () => {
  it("keeps loose files at the root", () => {
    const tree = buildFileTree([file("a.txt"), file("b.txt")]);
    expect(leaves(tree)).toEqual(["a.txt", "b.txt"]);
    expect(tree.every((n) => n.kind === "file")).toBe(true);
  });

  it("nests a file into its folder — the case that was invisible", () => {
    const tree = buildFileTree([file("top.txt"), file("reports/q1.pdf")]);
    expect(leaves(tree)).toEqual(["reports", "top.txt"]);
    expect(leaves(dir(tree, "reports").children)).toEqual(["q1.pdf"]);
  });

  it("builds intermediate folders that hold no file of their own", () => {
    const tree = buildFileTree([file("reports/2026/q2.pdf")]);
    const reports = dir(tree, "reports");
    expect(reports.path).toBe("reports");
    const y2026 = dir(reports.children, "2026");
    expect(y2026.path).toBe("reports/2026");
    expect(leaves(y2026.children)).toEqual(["q2.pdf"]);
  });

  it("reuses one node for a repeated prefix instead of duplicating it", () => {
    const tree = buildFileTree([
      file("reports/2026/a.pdf"),
      file("reports/2026/b.pdf"),
      file("reports/2025/c.pdf"),
    ]);
    expect(leaves(tree)).toEqual(["reports"]);
    const reports = dir(tree, "reports");
    expect(leaves(reports.children)).toEqual(["2025", "2026"]);
    expect(leaves(dir(reports.children, "2026").children)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("puts folders before files, each alphabetical", () => {
    const tree = buildFileTree([file("z.txt"), file("b/1.txt"), file("a.txt"), file("a/1.txt")]);
    expect(leaves(tree)).toEqual(["a", "b", "a.txt", "z.txt"]);
  });

  it("distinguishes same-named files in different folders", () => {
    const tree = buildFileTree([file("a/report.pdf"), file("b/report.pdf")]);
    const inA = dir(tree, "a").children[0];
    const inB = dir(tree, "b").children[0];
    expect(inA.kind === "file" && inA.file.path).toBe("uploads/a/report.pdf");
    expect(inB.kind === "file" && inB.file.path).toBe("uploads/b/report.pdf");
  });

  it("ignores a name that is only separators", () => {
    expect(buildFileTree([file("///")])).toEqual([]);
  });

  it("returns nothing for an empty listing", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("allFolderPaths", () => {
  it("collects every folder, including nested ones", () => {
    const tree = buildFileTree([file("a/b/c.txt"), file("d/e.txt"), file("root.txt")]);
    expect(allFolderPaths(tree).sort()).toEqual(["a", "a/b", "d"]);
  });

  it("is empty when nothing is nested", () => {
    expect(allFolderPaths(buildFileTree([file("a.txt")]))).toEqual([]);
  });
});
