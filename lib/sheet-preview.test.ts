import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readWorkbook } from "@/lib/sheet-preview";

// file-preview-in-pane FR-4.2. A spreadsheet previews as a table of VALUES: what the
// member would see in the cell, never a formula this app evaluates and never a macro it
// reads. The fixture is a real workbook written by the same library, so the test fails
// if the shape it hands back ever changes.
async function workbookBytes(build: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("readWorkbook", () => {
  it("returns each sheet's rows as values", async () => {
    const bytes = await workbookBytes((wb) => {
      const ws = wb.addWorksheet("Sales");
      ws.addRow(["region", "total"]);
      ws.addRow(["north", 1200]);
    });

    const sheets = await readWorkbook(bytes);

    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Sales");
    expect(sheets[0].rows).toEqual([
      ["region", "total"],
      ["north", "1200"],
    ]);
  });

  it("shows a formula's RESULT, never the formula", async () => {
    const bytes = await workbookBytes((wb) => {
      const ws = wb.addWorksheet("Calc");
      ws.addRow([2, 3]);
      ws.getCell("C1").value = { formula: "A1+B1", result: 5 };
    });

    const [sheet] = await readWorkbook(bytes);

    expect(sheet.rows[0]).toEqual(["2", "3", "5"]);
    expect(JSON.stringify(sheet.rows)).not.toContain("A1+B1");
  });

  it("keeps every sheet, in the workbook's own order", async () => {
    const bytes = await workbookBytes((wb) => {
      wb.addWorksheet("first").addRow(["a"]);
      wb.addWorksheet("second").addRow(["b"]);
    });

    const sheets = await readWorkbook(bytes);

    expect(sheets.map((s) => s.name)).toEqual(["first", "second"]);
  });

  // A 200k-row export must not freeze the tab it is previewed in. The cap is on ROWS
  // because that is what the table paints, and it is reported so the pane can say the
  // view is partial rather than quietly lying about the file.
  it("caps the rows it returns and says so", async () => {
    const bytes = await workbookBytes((wb) => {
      const ws = wb.addWorksheet("big");
      for (let i = 0; i < 60; i++) ws.addRow([i]);
    });

    const [sheet] = await readWorkbook(bytes, 25);

    expect(sheet.rows).toHaveLength(25);
    expect(sheet.truncated).toBe(true);
  });
});
