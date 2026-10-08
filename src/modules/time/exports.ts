import { format, parseISO } from "date-fns";
import { addPdfFooter, brandTableStyles, createBrandedPdf, downloadBlob, downloadCsv, type PdfCompany } from "@/components/kit";
import { db } from "@/integrations/supabase/client";
import { STATUS_META, clock, clockSeconds, shiftLabel } from "./lib";
import type { DayLogRow, MonthRegister, PunchRow, RegisterDay, RegisterEmployee } from "./types";

/* ------------------------------------------------------------------ */
/* Register model shared by Excel and PDF                              */
/* ------------------------------------------------------------------ */

export interface RegisterRowModel {
  employee: RegisterEmployee;
  codes: string[];
  p: number;
  h: number;
  l: number;
  a: number;
  worked: number;
}

function codeFor(emp: RegisterEmployee, day: RegisterDay, working: Set<string>, leave: Set<string>): string {
  const d = day.date;
  if ((emp.joining_date && d < emp.joining_date) || (emp.separation_date && d > emp.separation_date)) return "-";
  const cell = emp.cells[d];
  if (leave.has(d) || cell?.s === "leave") return "L";
  if (cell) {
    if (cell.s === "present" || cell.s === "late") return "P";
    if (cell.s === "half_day") return "H";
    if (cell.s === "short_leave") return "S";
    if (cell.s === "absent") return "A";
  }
  return working.has(d) ? "" : "off";
}

export function buildRegisterModel(data: MonthRegister): RegisterRowModel[] {
  return data.employees.map((emp) => {
    const working = new Set(emp.working);
    const leave = new Set(emp.leave);
    const codes = data.days.map((day) => codeFor(emp, day, working, leave));
    const count = (c: string) => codes.filter((x) => x === c).length;
    const p = count("P");
    const h = count("H") + count("S");
    return { employee: emp, codes, p, h, l: count("L"), a: count("A"), worked: p + h * 0.5 };
  });
}

/** Holiday/event notes and HR notes (the automatic "Biometric punch" note is left out). */
export function registerNotes(data: MonthRegister): string[] {
  const notes: string[] = [];
  for (const day of data.days) {
    for (const ev of day.events) notes.push(`${format(parseISO(day.date), "d MMM")}: ${ev.title}`);
  }
  for (const emp of data.employees) {
    for (const [date, cell] of Object.entries(emp.cells)) {
      if (cell.n && cell.n !== "Biometric punch" && cell.n !== "Approved punch correction") {
        notes.push(`${emp.name}, ${format(parseISO(date), "d MMM")}: ${cell.n}`);
      }
    }
  }
  return Array.from(new Set(notes));
}

function registerFileName(company: string | null | undefined, month: string, suffix: string[], ext: string) {
  const slug = (company || "adicorp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const extra = suffix
    .filter(Boolean)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean);
  return [slug || "company", "attendance-register", month.slice(0, 7), ...extra].join("-") + `.${ext}`;
}

/* ------------------------------------------------------------------ */
/* Excel register                                                      */
/* ------------------------------------------------------------------ */

function colName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function exportRegisterXlsx(data: MonthRegister, opts: { companyName?: string | null; department?: string | null; search?: string }) {
  const XLSX = await import("xlsx");
  const model = buildRegisterModel(data);
  const monthLabel = format(parseISO(data.month), "MMMM yyyy");
  const dayCount = data.days.length;
  const firstDayCol = 4; // A Sr, B Code, C Name, D Department
  const lastDayCol = firstDayCol + dayCount - 1;

  const title = [`${opts.companyName || "Company"} — Attendance register, ${monthLabel}${opts.department ? ` — ${opts.department}` : ""}`];
  const header = ["Sr", "Code", "Name", "Department", ...data.days.map((d) => `${Number(d.date.slice(8))}`), "P", "H/S", "L", "A", "Days worked"];
  const weekdays = ["", "", "", "", ...data.days.map((d) => format(parseISO(d.date), "EEEEE")), "", "", "", "", ""];

  const rows: (string | number | { t: string; f: string })[][] = [title, [], header, weekdays];
  model.forEach((m, i) => {
    const excelRow = rows.length + 1;
    const range = `${colName(firstDayCol)}${excelRow}:${colName(lastDayCol)}${excelRow}`;
    const pCol = colName(lastDayCol + 1);
    const hCol = colName(lastDayCol + 2);
    rows.push([
      i + 1,
      m.employee.code ?? "",
      m.employee.name,
      m.employee.department ?? "",
      ...m.codes,
      { t: "n", f: `COUNTIF(${range},"P")` },
      { t: "n", f: `COUNTIF(${range},"H")+COUNTIF(${range},"S")` },
      { t: "n", f: `COUNTIF(${range},"L")` },
      { t: "n", f: `COUNTIF(${range},"A")` },
      { t: "n", f: `${pCol}${excelRow}+0.5*${hCol}${excelRow}` },
    ]);
  });
  const firstDataRow = 5;
  const lastDataRow = rows.length;
  if (model.length > 0) {
    rows.push([
      "",
      "",
      "Present per day",
      "",
      ...data.days.map((_, i) => ({ t: "n", f: `COUNTIF(${colName(firstDayCol + i)}${firstDataRow}:${colName(firstDayCol + i)}${lastDataRow},"P")` })),
    ]);
  }
  rows.push([]);
  rows.push(["Key: P present · H half day · S short leave · L leave · A absent · off day off · - outside employment"]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 4 }, { wch: 10 }, { wch: 26 }, { wch: 16 }, ...data.days.map(() => ({ wch: 4 })), { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 11 }];
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(header.length - 1, 20) } }];
  sheet["!freeze"] = { xSplit: 4, ySplit: 4 };

  const notes = registerNotes(data);
  const notesSheet = XLSX.utils.aoa_to_sheet([["Notes"], ...(notes.length ? notes.map((n) => [n]) : [["No notes this month"]])]);
  notesSheet["!cols"] = [{ wch: 80 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, format(parseISO(data.month), "MMM yyyy"));
  XLSX.utils.book_append_sheet(book, notesSheet, "Notes");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    registerFileName(opts.companyName, data.month, [opts.department ?? "", opts.search ?? ""], "xlsx"),
  );
}

/* ------------------------------------------------------------------ */
/* PDF register (A4 landscape, letterhead, signatures)                 */
/* ------------------------------------------------------------------ */

const FILL: Record<string, [number, number, number]> = {
  P: [220, 242, 228],
  H: [253, 239, 213],
  S: [222, 236, 250],
  L: [226, 234, 249],
  A: [251, 226, 226],
  off: [238, 240, 243],
};

export async function exportRegisterPdf(data: MonthRegister, opts: { company?: PdfCompany; department?: string | null; search?: string }) {
  const model = buildRegisterModel(data);
  const monthLabel = format(parseISO(data.month), "MMMM yyyy");
  const { doc, startY, autoTable, margin } = await createBrandedPdf({
    title: `Attendance register — ${monthLabel}`,
    subtitle: [opts.department ? `Department: ${opts.department}` : "All departments", `${model.length} people`, opts.search ? `Search: ${opts.search}` : ""]
      .filter(Boolean)
      .join(" · "),
    company: opts.company,
    orientation: "landscape",
  });

  const head = [["Employee", ...data.days.map((d) => `${Number(d.date.slice(8))}\n${format(parseISO(d.date), "EEEEE")}`), "P", "H", "L", "A", "Wkd"]];
  const body = model.map((m) => [
    `${m.employee.name}${m.employee.code ? `\n${m.employee.code}` : ""}`,
    ...m.codes.map((c) => (c === "off" ? "" : c)),
    m.p,
    m.h,
    m.l,
    m.a,
    m.worked,
  ]);
  const perDay = data.days.map((_, i) => model.filter((m) => m.codes[i] === "P").length);
  const foot = [["Present per day", ...perDay.map((n, i) => (data.days[i].working ? n : "")), "", "", "", "", ""]];
  const dayCols = data.days.length;
  const base = brandTableStyles();

  autoTable(doc, {
    ...base,
    startY,
    head,
    body,
    foot,
    styles: { ...(base.styles ?? {}), fontSize: 6.5, cellPadding: 2, halign: "center", valign: "middle" },
    headStyles: { ...(base.headStyles ?? {}), fontSize: 6, halign: "center" },
    footStyles: { fillColor: [235, 241, 251], textColor: [24, 32, 44], fontStyle: "bold", fontSize: 6 },
    columnStyles: { 0: { halign: "left", cellWidth: 98 } },
    showHead: "everyPage",
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index > 0 && hook.column.index <= dayCols) {
        const original = model[hook.row.index]?.codes[hook.column.index - 1];
        const fill = original ? FILL[original] : undefined;
        if (fill) hook.cell.styles.fillColor = fill;
        hook.cell.styles.fontStyle = "bold";
      }
      if ((hook.section === "head" || hook.section === "foot") && hook.column.index > 0 && hook.column.index <= dayCols) {
        const day = data.days[hook.column.index - 1];
        if (hook.section === "head" && !day.working) hook.cell.styles.fillColor = [90, 120, 170];
      }
    },
  });

  // Notes and signature lines on the last page.
  const notes = registerNotes(data);
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = doc.internal.pageSize.getWidth();
  let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 18;
  const ensure = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 50;
    }
  };
  doc.setFontSize(7.5);
  doc.setTextColor(90, 98, 110);
  ensure(14);
  doc.text("Key: P present · H half day · S short leave · L leave · A absent · blank = not marked or day off · - outside employment", margin, y);
  y += 14;
  if (notes.length > 0) {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 32, 44);
    doc.text("Notes", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 78, 90);
    y += 11;
    for (const note of notes.slice(0, 60)) {
      ensure(10);
      doc.text(`• ${note}`.slice(0, 180), margin, y);
      y += 9.5;
    }
  }
  ensure(60);
  y += 34;
  doc.setDrawColor(150, 156, 166);
  const sigWidth = 170;
  const labels = ["Prepared by (HR)", "Checked by", "Approved by"];
  labels.forEach((label, i) => {
    const x = margin + i * ((width - margin * 2 - sigWidth) / 2);
    doc.line(x, y, x + sigWidth, y);
    doc.setFontSize(7.5);
    doc.setTextColor(90, 98, 110);
    doc.text(label, x, y + 11);
  });

  addPdfFooter(doc, opts.company?.name ? `${opts.company.name} · AdiCorp HR` : "AdiCorp HR");
  doc.save(registerFileName(opts.company?.name, data.month, [opts.department ?? "", opts.search ?? ""], "pdf"));
}

/* ------------------------------------------------------------------ */
/* CSV logs                                                            */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  measured: "Present",
  no_out: "No out-punch",
  unmeasured: "Marked by HR",
  absent: "Absent",
  leave: "On leave",
  off: "Day off",
  off_day: "Worked a day off",
  pending: "In progress",
};

export function exportDayLogCsv(rows: DayLogRow[], from: string, to: string, timeZone: string) {
  downloadCsv(rows, `attendance-daily-log-${from}-to-${to}.csv`, [
    { header: "Date", value: (r) => r.work_date },
    { header: "Day", value: (r) => format(parseISO(r.work_date), "EEE") },
    { header: "Code", value: (r) => r.code },
    { header: "Name", value: (r) => r.name },
    { header: "Department", value: (r) => r.department },
    { header: "Position", value: (r) => r.rank },
    { header: "Shift", value: (r) => shiftLabel(r.shift_type) },
    { header: "Starts", value: (r) => (r.working ? clock(r.shift_start, timeZone) : "") },
    { header: "Ends", value: (r) => (r.working ? clock(r.shift_end, timeZone) : "") },
    { header: "First in", value: (r) => (r.first_in ? clock(r.first_in, timeZone) : "") },
    { header: "Last out", value: (r) => (r.last_out ? clock(r.last_out, timeZone) : "") },
    { header: "Hours", value: (r) => (r.worked_minutes !== null ? (r.worked_minutes / 60).toFixed(2) : "") },
    { header: "Late minutes", value: (r) => r.late_minutes ?? "" },
    { header: "Early minutes", value: (r) => r.early_minutes ?? "" },
    { header: "Punches", value: (r) => r.punches },
    // "pending" is a shift that is not over yet: in progress once punched, otherwise still to come.
    { header: "Status", value: (r) => (r.kind === "pending" && r.punches === 0 ? "Not started" : (KIND_LABEL[r.kind] ?? r.kind)) },
    { header: "Register", value: (r) => (r.register ? (STATUS_META[r.register]?.label ?? r.register) : "") },
    { header: "Notes", value: (r) => r.note ?? "" },
  ]);
}

interface SummaryAcc {
  code: string | null;
  name: string;
  department: string | null;
  working: number;
  present: number;
  absent: number;
  noPunch: number;
  leave: number;
  lateDays: number;
  lateMinutes: number;
  earlyDays: number;
  earlyMinutes: number;
  noOut: number;
  offDays: number;
  minutes: number;
  firstIns: number[];
}

export function exportSummaryCsv(rows: DayLogRow[], from: string, to: string, graceMinutes: number, timeZone: string) {
  const map = new Map<string, SummaryAcc>();
  for (const r of rows) {
    let acc = map.get(r.employee_id);
    if (!acc) {
      acc = { code: r.code, name: r.name, department: r.department, working: 0, present: 0, absent: 0, noPunch: 0, leave: 0, lateDays: 0, lateMinutes: 0, earlyDays: 0, earlyMinutes: 0, noOut: 0, offDays: 0, minutes: 0, firstIns: [] };
      map.set(r.employee_id, acc);
    }
    // A shift not over yet ("pending": today, or a future day in the range) only counts once punched,
    // so a month-to-date export does not read as absences for the days still to come.
    const notStarted = r.kind === "pending" && r.punches === 0;
    if (r.working && !notStarted) acc.working++;
    if (r.kind === "measured" || r.kind === "no_out" || r.kind === "unmeasured" || (r.kind === "pending" && r.punches > 0)) acc.present++;
    if (r.kind === "absent") acc.absent++;
    if (r.kind === "unmeasured") acc.noPunch++;
    if (r.kind === "leave") acc.leave++;
    if (r.kind === "no_out") acc.noOut++;
    if (r.kind === "off_day") acc.offDays++;
    if ((r.late_minutes ?? 0) > 0) {
      acc.lateDays++;
      acc.lateMinutes += r.late_minutes ?? 0;
    }
    if ((r.early_minutes ?? 0) > graceMinutes) {
      acc.earlyDays++;
      acc.earlyMinutes += r.early_minutes ?? 0;
    }
    if (r.worked_minutes) acc.minutes += r.worked_minutes;
    if (r.first_in && r.working) {
      const [h, m] = clock(r.first_in, timeZone).split(":").map(Number);
      if (!Number.isNaN(h)) acc.firstIns.push(h * 60 + m);
    }
  }
  const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  downloadCsv(list, `attendance-summary-${from}-to-${to}.csv`, [
    { header: "Code", value: (r) => r.code },
    { header: "Name", value: (r) => r.name },
    { header: "Department", value: (r) => r.department },
    { header: "Working days", value: (r) => r.working },
    { header: "Present", value: (r) => r.present },
    { header: "Absent", value: (r) => r.absent },
    { header: "No punch (marked by HR)", value: (r) => r.noPunch },
    { header: "Leave", value: (r) => r.leave },
    { header: "Late days", value: (r) => r.lateDays },
    { header: "Late minutes", value: (r) => r.lateMinutes },
    { header: "Early days", value: (r) => r.earlyDays },
    { header: "Early minutes", value: (r) => r.earlyMinutes },
    { header: "No out-punch", value: (r) => r.noOut },
    { header: "Days off worked", value: (r) => r.offDays },
    { header: "Hours", value: (r) => (r.minutes / 60).toFixed(2) },
    {
      header: "Average first in",
      value: (r) => {
        if (r.firstIns.length === 0) return "";
        const avg = Math.round(r.firstIns.reduce((a, b) => a + b, 0) / r.firstIns.length);
        return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
      },
    },
    { header: "Attendance %", value: (r) => (r.working > 0 ? ((r.present / r.working) * 100).toFixed(1) : "") },
  ]);
}

const SOURCE_LABEL: Record<string, string> = { live: "Live", sync: "Read from the log", correction: "Approved correction", manual: "Manual" };

export function exportPunchLogCsv(rows: PunchRow[], from: string, to: string, timeZone: string, includeUnlinked: boolean) {
  const list = includeUnlinked ? rows : rows.filter((r) => r.employee_id);
  downloadCsv(list, `punch-log-${from}-to-${to}.csv`, [
    { header: "Date", value: (r) => r.punch_date },
    { header: "Time", value: (r) => clockSeconds(r.punch_at, timeZone) },
    { header: "Terminal ID", value: (r) => r.device_user_id },
    { header: "Code", value: (r) => r.employees?.employee_code ?? "" },
    { header: "Name", value: (r) => r.employees?.name ?? "Not linked" },
    { header: "Terminal", value: (r) => r.time_devices?.name ?? (r.source === "correction" ? "Correction" : "") },
    { header: "In/Out", value: (r) => (r.direction === "unknown" ? "" : r.direction.toUpperCase()) },
    { header: "Verified by", value: (r) => r.verify_type ?? "" },
    { header: "How it arrived", value: (r) => SOURCE_LABEL[r.source] ?? r.source },
  ]);
}

/** Record an export in the activity timeline (best effort). */
export function logExport(action: string, description: string, details: Record<string, unknown>) {
  void db.rpc("log_activity", { p_action: action, p_description: description, p_details: details }).then(() => undefined);
}

