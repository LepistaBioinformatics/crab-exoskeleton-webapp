import type ExcelJS from "exceljs";

/**
 * A spreadsheet, reduced to what a preview can paint.
 *
 * VALUES only, by construction: every cell is rendered through `text`, so a formula
 * shows its stored result and never becomes something this app evaluates. Nothing here
 * reads macros, external links or defined names — a preview is a reader, and the file
 * belongs to the member, not to us (file-preview-in-pane FR-4.2).
 */
export interface SheetPreview {
  name: string;
  rows: string[][];
  /** True when the sheet has more rows than were returned. */
  truncated: boolean;
}

/**
 * Rows are capped because the pane paints them all: a 200k-row export would freeze the
 * tab it was opened in. The cap is reported rather than silent, so the pane can say the
 * view is partial instead of quietly misrepresenting the file.
 */
export const SHEET_ROW_CAP = 500;

/**
 * exceljs is imported dynamically, like the highlighter's grammars: a conversation that
 * never opens a spreadsheet must not pay for a spreadsheet reader.
 */
export async function readWorkbook(
  bytes: ArrayBuffer,
  rowCap: number = SHEET_ROW_CAP,
): Promise<SheetPreview[]> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(bytes);

  const sheets: SheetPreview[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    let truncated = false;
    ws.eachRow((row) => {
      if (rows.length >= rowCap) {
        truncated = true;
        return;
      }
      const cells: string[] = [];
      // `values` is 1-based with a hole at 0 — exceljs's own shape, not a mistake here.
      const values = row.values as ExcelJS.CellValue[];
      for (let i = 1; i < values.length; i++) {
        cells.push(cellText(values[i]));
      }
      rows.push(cells);
    });
    sheets.push({ name: ws.name, rows, truncated });
  });
  return sheets;
}

/** One cell as the member would read it. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    // A formula cell carries its stored RESULT; the formula itself is deliberately not
    // read. A rich-text cell carries runs; a hyperlink carries its text.
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
    return "";
  }
  return String(value);
}
