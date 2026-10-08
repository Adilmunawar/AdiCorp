export type CsvCell = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

/** Escape one CSV cell: quotes doubled, and spreadsheet formulas neutralised (CSV injection). */
export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  // A plain signed number ("-1500", "-1,250.50") cannot run as a formula: leave it a number in Excel.
  const plainNumber = /^[+-]?\d[\d.,]*$/.test(s);
  if (/^[=+\-@\t\r]/.test(s) && typeof value !== "number" && !plainNumber) s = `'${s}`;
  return /[",\r\n']/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(lines: CsvCell[][]): string {
  return lines.map((line) => line.map(csvEscape).join(",")).join("\r\n");
}

/**
 * Download rows as a UTF-8 CSV (with BOM so Excel reads accents and Urdu correctly).
 * - `rows` as objects: headers are the keys of the first row (or `columns`).
 * - `rows` as arrays: the first array is treated as the header row.
 */
export function downloadCsv<T>(rows: T[], filename: string, columns?: CsvColumn<T>[]): void {
  let lines: CsvCell[][];
  if (columns) {
    lines = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r)))];
  } else if (rows.length > 0 && Array.isArray(rows[0])) {
    lines = rows as unknown as CsvCell[][];
  } else {
    const records = rows as unknown as Record<string, CsvCell>[];
    const headers = records.length ? Object.keys(records[0]) : [];
    lines = [headers, ...records.map((r) => headers.map((h) => r[h]))];
  }
  const blob = new Blob(["﻿" + toCsv(lines)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`);
}

/** Save a Blob as a file. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
