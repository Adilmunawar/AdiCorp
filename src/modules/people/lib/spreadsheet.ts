import { format, isValid } from "date-fns";
import type { Employee } from "../api/types";
import { GENDER_OPTIONS, SHIFT_OPTIONS } from "./constants";

/*
 * Excel import/export for the employee directory. The xlsx library is loaded on
 * demand so the directory itself stays light.
 */

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  /** Matches the uploaded heading (case-insensitive). */
  match: RegExp;
  example: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", header: "Full name", required: true, match: /^(full\s*)?name$|^employee(\s*name)?$/i, example: "Ayesha Khan" },
  { key: "cnic", header: "CNIC", required: true, match: /cnic|\bnic\b|national\s*id|id\s*(no|number)/i, example: "35202-1234567-1" },
  { key: "rank", header: "Position", required: true, match: /designation|position|job\s*title|^title$|^role$|^rank$|^post$|^grade$/i, example: "Software Engineer" },
  { key: "joining_date", header: "Joining date", required: true, match: /doj|join|start\s*date|date\s*of\s*app/i, example: "2026-10-01" },
  { key: "department", header: "Department", match: /dept|department|team|section|unit/i, example: "Engineering" },
  { key: "employee_code", header: "Employee code", match: /(employee|emp|staff)\s*(code|id|no)|^code$/i, example: "" },
  { key: "father_name", header: "Father's name", match: /father|guardian|s\/o|husband/i, example: "Imran Khan" },
  { key: "phone", header: "Phone", match: /phone|mobile|cell|contact\s*no|whatsapp/i, example: "0300-1234567" },
  { key: "email", header: "E-mail", match: /e-?mail/i, example: "ayesha@example.com" },
  { key: "gender", header: "Gender", match: /gender|sex/i, example: "female" },
  { key: "date_of_birth", header: "Date of birth", match: /birth|dob/i, example: "1996-04-12" },
  { key: "shift_type", header: "Shift", match: /shift/i, example: "morning" },
  { key: "emergency_contact", header: "Emergency contact", match: /emergency/i, example: "Imran Khan 0300-7654321" },
  { key: "address", header: "Address", match: /address/i, example: "House 12, Street 4, Lahore" },
  { key: "education", header: "Education", match: /education|qualification|degree/i, example: "BS Computer Science" },
  { key: "bank_name", header: "Bank", match: /^bank(\s*name)?$/i, example: "Meezan Bank" },
  { key: "bank_account_number", header: "Account number", match: /account|iban/i, example: "PK36MEZN0001234567890123" },
];

const DATE_KEYS = new Set(["joining_date", "date_of_birth"]);

async function loadXlsx() {
  return import("xlsx");
}

/** Normalise Pakistani mobile numbers to 03xx-xxxxxxx; leave anything else as typed. */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  let d = trimmed.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = "0" + d;
  if (d.length === 11 && d.startsWith("03")) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return trimmed;
}

/** "F", "Female", "woman" -> "female"; unknown values pass through for the server to reject. */
export function normaliseGender(raw: string): string {
  const g = raw.trim().toLowerCase();
  if (GENDER_OPTIONS.some((o) => o.value === g)) return g;
  if (g === "f" || g === "woman") return "female";
  if (g === "m" || g === "man") return "male";
  if (g === "o") return "other";
  return g;
}

export type DateOrder = "dmy" | "mdy";

/** Parse spreadsheet dates: Date cells, ISO, dd/mm/yyyy or mm/dd/yyyy, 4-Mar-2024, Mar 4, 2024. */
export function parseSheetDate(value: unknown, order: DateOrder): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (y < 100) y += y > 50 ? 1900 : 2000;
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return order === "dmy" ? build(y, b, a) : build(y, a, b);
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-,]+(\d{4})$/.exec(s);
  if (m) {
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[1]);
  }
  m = /^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const mi = months.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return build(+m[3], mi + 1, +m[2]);
  }
  return null;

  function build(y: number, mo: number, d: number): string | null {
    if (y < 1930 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return null;
    return format(dt, "yyyy-MM-dd");
  }
}

export interface ParsedImport {
  rows: Record<string, string>[];
  /** Spreadsheet row numbers (1-based, including the header) of each parsed row. */
  sourceRows: number[];
  mapped: { key: string; header: string }[];
  ignored: string[];
  /** Client-side problems per row index (dates that could not be read, etc.). */
  problems: Map<number, string[]>;
}

/**
 * Excel date serial -> "yyyy-MM-dd". The serial is converted by SheetJS's calendar maths:
 * `cellDates` Date objects are built from a local 1899 base date and land seconds before
 * midnight in zones such as Asia/Karachi, which moved every date one day back.
 */
function serialToIso(SSF: { parse_date_code: (v: number, opts?: { date1904?: boolean }) => { y: number; m: number; d: number } | null }, serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const p = SSF.parse_date_code(serial, { date1904 });
  if (!p) return null;
  return `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export async function parseImportFile(file: File, order: DateOrder): Promise<ParsedImport> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  // Date cells stay serial numbers (converted below without the time zone), and CSV text is
  // kept as typed: "03/04/2026" then follows the chosen day/month order instead of SheetJS's
  // US guess, and CNICs or phone numbers keep their leading zeros.
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const date1904 = !!wb.Workbook?.WBProps?.date1904;
  const sheetName = wb.SheetNames.find((n) => !/instruction/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("The file has no sheets.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: "" });
  if (matrix.length < 2) throw new Error("The file needs a header row and at least one person.");

  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? "").replace(/\*/g, "").trim());
  const used = new Set<string>();
  const colKeys: (string | null)[] = headers.map((h) => {
    if (!h) return null;
    const col = IMPORT_COLUMNS.find((c) => !used.has(c.key) && (c.header.toLowerCase() === h.toLowerCase() || c.match.test(h)));
    if (!col) return null;
    used.add(col.key);
    return col.key;
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !used.has(c.key));
  if (missing.length) throw new Error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => c.header).join(", ")}. Download the template to see the layout.`);

  const rows: Record<string, string>[] = [];
  const sourceRows: number[] = [];
  const problems = new Map<number, string[]>();
  matrix.slice(1).forEach((line, i) => {
    const cells = line as unknown[];
    if (!cells.some((c) => String(c ?? "").trim())) return;
    const row: Record<string, string> = {};
    const issues: string[] = [];
    colKeys.forEach((key, ci) => {
      if (!key) return;
      const raw = cells[ci];
      if (DATE_KEYS.has(key)) {
        const parsed = typeof raw === "number" ? serialToIso(XLSX.SSF, raw, date1904) : parseSheetDate(raw, order);
        if (raw !== "" && raw !== null && raw !== undefined && !parsed) issues.push(`Could not read the ${key === "joining_date" ? "joining date" : "date of birth"} "${String(raw)}".`);
        row[key] = parsed ?? "";
      } else {
        let v = String(raw ?? "").replace(/\s+/g, " ").trim();
        if (key === "phone" && v) v = normalisePhone(v);
        if (key === "gender" && v) v = normaliseGender(v);
        if (key === "shift_type" && v) v = v.toLowerCase();
        row[key] = v;
      }
    });
    if (issues.length) problems.set(rows.length, issues);
    rows.push(row);
    sourceRows.push(i + 2);
  });
  if (rows.length === 0) throw new Error("No people found under the header row.");
  if (rows.length > 500) throw new Error(`The file has ${rows.length} people. Import at most 500 at a time.`);

  return {
    rows,
    sourceRows,
    mapped: colKeys.map((k, i) => (k ? { key: k, header: headers[i] } : null)).filter(Boolean) as { key: string; header: string }[],
    ignored: headers.filter((h, i) => h && !colKeys[i]),
    problems,
  };
}

export async function downloadImportTemplate(companyName?: string | null): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const header = IMPORT_COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header));
  const example = IMPORT_COLUMNS.map((c) => c.example);
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws["!cols"] = IMPORT_COLUMNS.map((c) => ({ wch: Math.max(14, c.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  const notes = XLSX.utils.aoa_to_sheet([
    [`${companyName ?? "AdiCorp"}: employee import template`],
    [""],
    ["Columns marked * are required. Delete the example row before importing."],
    ["CNIC: 13 digits, with or without dashes. Employees sign in to the portal with it."],
    ["Dates: YYYY-MM-DD, DD/MM/YYYY or 4-Mar-2026. Choose the day/month order on the import screen."],
    ["Department: an existing name, or a new one (it will be created)."],
    ["Employee code: leave blank to number people automatically."],
    ["Gender: female, male or other. Shift: morning, evening or night."],
    ["The import is all-or-nothing: if any row has a problem, nobody is added and every problem is listed."],
  ]);
  notes["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");
  XLSX.writeFile(wb, "employee-import-template.xlsx");
}

/** Export the given employees (no pay, no credentials). */
export async function exportEmployeesXlsx(rows: Employee[], departmentName: (id: string | null) => string, filename: string): Promise<void> {
  const XLSX = await loadXlsx();
  const data = rows.map((e) => ({
    "Employee code": e.employee_code ?? "",
    "Full name": e.name,
    CNIC: e.cnic ?? "",
    Position: e.rank,
    Department: departmentName(e.department_id),
    Status: e.status === "active" ? "Active" : "Separated",
    "Joining date": e.joining_date ?? "",
    "Last working day": e.separation_date ?? "",
    "Father's name": e.father_name ?? "",
    Phone: e.phone ?? "",
    "E-mail": e.email ?? "",
    Gender: GENDER_OPTIONS.find((g) => g.value === e.gender)?.label ?? e.gender ?? "",
    "Date of birth": e.date_of_birth ?? "",
    Shift: SHIFT_OPTIONS.find((s) => s.value === e.shift_type)?.label ?? e.shift_type ?? "",
    "Emergency contact": e.emergency_contact ?? "",
    Address: e.address ?? "",
    Education: e.education ?? "",
    Bank: e.bank_name ?? "",
    "Account number": e.bank_account_number ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = Object.keys(data[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
