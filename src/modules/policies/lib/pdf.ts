import type jsPDF from "jspdf";
import { format } from "date-fns";
import { BRAND_RGB, loadImageDataUrl, loadPdfLibs } from "@/components/kit";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { parseRichText, type Span } from "./richText";
import { inZone, letterLabel } from "./letters";

/** Company details printed on the letterhead. */
export interface LetterheadCompany {
  name?: string | null;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  /** IANA zone the letter's dates are written in (the company's); the browser's when unknown. */
  timezone?: string | null;
}

const INK: [number, number, number] = [33, 40, 44];
const MUTED: [number, number, number] = [110, 118, 130];
const RULE: [number, number, number] = [225, 228, 232];
const MARGIN = 54;
const BOTTOM = 60;

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

const fmt = (iso: string | null | undefined, pattern = "dd MMMM yyyy", timeZone?: string | null) => (iso ? format(inZone(iso, timeZone), pattern) : "—");

/** The zone printed next to evidence times, e.g. "Asia/Karachi". */
function zoneLabel(timeZone?: string | null): string {
  if (timeZone) return timeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

/** A4 portrait with the company letterhead on page 1. Returns the doc and the first content Y. */
async function letterhead(company: LetterheadCompany) {
  const { JsPDF } = await loadPdfLibs();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  const logo = (company.logo && (await loadImageDataUrl(company.logo))) || (await loadImageDataUrl(ADICORP_LOGO_PATH));
  let textX = MARGIN;
  if (logo) {
    try {
      doc.addImage(logo, imageFormat(logo), MARGIN, 40, 44, 44);
      textX = MARGIN + 56;
    } catch {
      /* unsupported image: no logo */
    }
  }
  doc.setTextColor(...BRAND_RGB);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(company.name || "", textX, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const contact = [company.address, company.phone, company.website].filter(Boolean).join("  ·  ");
  if (contact) doc.text(doc.splitTextToSize(contact, width - textX - MARGIN)[0] ?? "", textX, 76);

  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 98, width - MARGIN, 98);
  doc.setLineWidth(0.5);
  doc.setTextColor(...INK);
  return { doc, y: 126, width };
}

/** Page numbers and a footer line on every page. */
function footer(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, height - 36, width - MARGIN, height - 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label, MARGIN, height - 22);
    doc.text(`Page ${i} of ${pages}`, width - MARGIN, height - 22, { align: "right" });
  }
}

/** Writes rich text (headings, paragraphs, lists, **bold**) with word wrap and page breaks. */
class Writer {
  constructor(
    private doc: jsPDF,
    public y: number,
  ) {}

  private get pageHeight() {
    return this.doc.internal.pageSize.getHeight();
  }
  private get width() {
    return this.doc.internal.pageSize.getWidth() - MARGIN * 2;
  }

  ensure(space: number) {
    if (this.y + space > this.pageHeight - BOTTOM) {
      this.doc.addPage();
      this.y = 64;
    }
  }

  gap(h: number) {
    this.y += h;
  }

  /** Mixed bold/regular spans, wrapped to the width, starting at x. */
  spans(spans: Span[], { size = 10, x = MARGIN, lineHeight = 1.45, bold = false }: { size?: number; x?: number; lineHeight?: number; bold?: boolean } = {}) {
    const doc = this.doc;
    const maxX = MARGIN + this.width;
    const lh = size * lineHeight;
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    const words: { text: string; bold: boolean }[] = [];
    for (const s of spans) {
      for (const part of s.text.split(/(\s+)/)) {
        if (part) words.push({ text: part, bold: bold || s.bold });
      }
    }
    this.ensure(lh);
    let cx = x;
    for (const w of words) {
      doc.setFont("helvetica", w.bold ? "bold" : "normal");
      const isSpace = /^\s+$/.test(w.text);
      const ww = doc.getTextWidth(isSpace ? " " : w.text);
      if (!isSpace && cx + ww > maxX && cx > x) {
        this.y += lh;
        this.ensure(lh);
        cx = x;
      }
      if (isSpace) {
        if (cx > x) cx += ww;
        continue;
      }
      doc.text(w.text, cx, this.y);
      cx += ww;
    }
    this.y += lh;
  }

  plain(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; x?: number } = {}) {
    const doc = this.doc;
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? INK));
    const x = opts.x ?? MARGIN;
    for (const line of doc.splitTextToSize(text, MARGIN + this.width - x) as string[]) {
      this.ensure(size * 1.45);
      doc.text(line, x, this.y);
      this.y += size * 1.45;
    }
    doc.setTextColor(...INK);
  }

  rich(source: string) {
    for (const b of parseRichText(source)) {
      if (b.kind === "h1") {
        this.ensure(30);
        this.gap(4);
        this.spans(b.spans, { size: 15, bold: true });
        this.gap(4);
      } else if (b.kind === "h2") {
        this.ensure(26);
        this.gap(6);
        this.spans(b.spans, { size: 11.5, bold: true });
        this.gap(2);
      } else if (b.kind === "p") {
        this.spans(b.spans);
        this.gap(6);
      } else if (b.kind === "ul" || b.kind === "ol") {
        const ordered = b.kind === "ol";
        b.items.forEach((item, i) => {
          this.ensure(16);
          this.doc.setFont("helvetica", "normal");
          this.doc.setFontSize(10);
          this.doc.text(ordered ? `${i + 1}.` : "•", MARGIN + 6, this.y);
          this.spans(item, { x: MARGIN + 22 });
          this.gap(1);
        });
        this.gap(5);
      }
    }
  }

  /** Label / value rows (two columns). */
  facts(rows: [string, string][]) {
    for (const [label, value] of rows) {
      this.ensure(16);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(label.toUpperCase(), MARGIN, this.y);
      this.plain(value, { size: 9.5, x: MARGIN + 120 });
    }
  }

  rule() {
    this.ensure(14);
    this.doc.setDrawColor(...RULE);
    this.doc.line(MARGIN, this.y, MARGIN + this.width, this.y);
    this.y += 14;
  }
}

function safeName(s: string) {
  return s.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

/* ------------------------------------------------------------------ policy */

export interface PolicyPdfInput {
  company: LetterheadCompany;
  title: string;
  version: number;
  status: string;
  publishedAt: string | null;
  body: string;
  sha256: string | null;
}

/** The policy text on the letterhead (unsigned copy). */
export async function exportPolicyPdf(p: PolicyPdfInput) {
  const { doc, y } = await letterhead(p.company);
  const w = new Writer(doc, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `VERSION ${p.version}  ·  ${p.status === "draft" ? "DRAFT, NOT PUBLISHED" : p.status === "superseded" ? `SUPERSEDED  ·  PUBLISHED ${fmt(p.publishedAt, "dd MMM yyyy", p.company.timezone).toUpperCase()}` : `PUBLISHED ${fmt(p.publishedAt, "dd MMM yyyy", p.company.timezone).toUpperCase()}`}`,
    MARGIN,
    w.y,
  );
  w.gap(18);
  if (!parseRichText(p.body).some((b) => b.kind === "h1")) {
    w.plain(p.title, { size: 15, bold: true });
    w.gap(6);
  }
  w.rich(p.body);
  if (p.sha256) {
    w.gap(8);
    w.rule();
    w.plain(`SHA-256 fingerprint of this text: ${p.sha256}`, { size: 7.5, color: MUTED });
  }
  footer(doc, `${p.company.name || ""}  ·  ${p.title}, version ${p.version}`);
  doc.save(`${safeName(p.title)}_v${p.version}.pdf`);
}

/* --------------------------------------------------------- signed policy copy */

export interface SignedCopyInput {
  company: LetterheadCompany;
  title: string;
  version: number;
  publishedAt: string | null;
  body: string;
  signedName: string;
  signaturePng: string;
  sha256: string;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  rank: string | null;
}

export async function exportSignedCopyPdf(s: SignedCopyInput) {
  const { doc, y } = await letterhead(s.company);
  const w = new Writer(doc, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_RGB);
  doc.text(`SIGNED COPY  ·  VERSION ${s.version}  ·  PUBLISHED ${fmt(s.publishedAt, "dd MMM yyyy", s.company.timezone).toUpperCase()}`, MARGIN, w.y);
  w.gap(18);
  if (!parseRichText(s.body).some((b) => b.kind === "h1")) {
    w.plain(s.title, { size: 15, bold: true });
    w.gap(6);
  }
  w.rich(s.body);

  w.gap(10);
  w.ensure(200);
  w.rule();
  w.plain("Signature", { size: 12, bold: true });
  w.gap(4);
  try {
    w.ensure(80);
    doc.addImage(s.signaturePng, "PNG", MARGIN, w.y, 200, 70);
    w.gap(78);
  } catch {
    w.plain("[signature image could not be embedded]", { size: 9, color: MUTED });
  }
  w.facts([
    ["Signed by", [s.employeeName, s.employeeCode, s.rank].filter(Boolean).join("  ·  ") || "—"],
    ["Typed name", s.signedName],
    ["Signed at", `${fmt(s.signedAt, "dd MMM yyyy, HH:mm:ss", s.company.timezone)} (${zoneLabel(s.company.timezone)})`],
    ["IP address", s.ip || "—"],
    ["Browser", s.userAgent || "—"],
    ["Text SHA-256", s.sha256],
  ]);
  w.gap(6);
  w.plain(
    "The SHA-256 fingerprint identifies the exact text that was shown when this was signed. Any change to the text produces a different fingerprint.",
    { size: 7.5, color: MUTED },
  );
  footer(doc, `${s.company.name || ""}  ·  Signed copy of ${s.title}, version ${s.version}`);
  doc.save(`${safeName(s.title)}_v${s.version}_signed_${safeName(s.employeeName || "employee")}.pdf`);
}

/* ------------------------------------------------------------------ letter */

export interface LetterPdfInput {
  company: LetterheadCompany;
  ref: string;
  kind: string;
  subject: string;
  body: string;
  issuedAt: string;
  replyBy: string | null;
  signatoryName: string;
  signatoryTitle: string;
  employeeName: string;
  employeeCode?: string | null;
  rank?: string | null;
  department?: string | null;
  acknowledgedAt?: string | null;
  reply?: string | null;
  repliedAt?: string | null;
  withdrawnAt?: string | null;
  withdrawReason?: string | null;
}

/** The letter on the company letterhead, with the acknowledgement, reply or withdrawal. */
export async function exportLetterPdf(l: LetterPdfInput) {
  const { doc, y, width } = await letterhead(l.company);
  const w = new Writer(doc, y);
  const tz = l.company.timezone;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Ref: ${l.ref}`, MARGIN, w.y);
  doc.text(fmt(l.issuedAt, undefined, tz), width - MARGIN, w.y, { align: "right" });
  w.gap(24);

  if (l.withdrawnAt) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(200, 40, 40);
    doc.text(`WITHDRAWN ON ${fmt(l.withdrawnAt, "dd MMM yyyy", tz).toUpperCase()}`, MARGIN, w.y);
    w.gap(16);
  }

  w.plain(l.employeeName, { size: 10.5, bold: true });
  const who = [l.rank, l.department, l.employeeCode ? `Employee ID ${l.employeeCode}` : null].filter(Boolean).join("  ·  ");
  if (who) w.plain(who, { size: 9, color: MUTED });
  w.gap(10);

  w.plain(`Subject: ${l.subject}`, { size: 10.5, bold: true });
  w.plain(letterLabel(l.kind), { size: 8.5, color: BRAND_RGB });
  w.gap(10);
  w.rich(l.body);

  if (l.replyBy) {
    w.gap(2);
    w.plain(`Please reply by ${fmt(l.replyBy)}.`, { size: 10, bold: true });
  }

  w.gap(26);
  w.ensure(60);
  w.plain(l.signatoryName, { size: 10.5, bold: true });
  w.plain(l.signatoryTitle, { size: 9.5, color: MUTED });
  w.plain(l.company.name || "", { size: 9.5, color: MUTED });

  w.gap(16);
  w.rule();
  const rows: [string, string][] = [["Received", l.acknowledgedAt ? fmt(l.acknowledgedAt, "dd MMM yyyy, HH:mm", tz) : "Not yet acknowledged"]];
  if (l.repliedAt) rows.push(["Replied", fmt(l.repliedAt, "dd MMM yyyy, HH:mm", tz)]);
  if (l.withdrawnAt) rows.push(["Withdrawn", `${fmt(l.withdrawnAt, "dd MMM yyyy, HH:mm", tz)}${l.withdrawReason ? `: ${l.withdrawReason}` : ""}`]);
  w.facts(rows);
  if (l.reply) {
    w.gap(6);
    w.plain("Employee's reply", { size: 10, bold: true });
    w.plain(l.reply, { size: 9.5 });
  }

  footer(doc, `${l.company.name || ""}  ·  ${l.ref}  ·  Computer-generated letter`);
  doc.save(`${safeName(l.ref)}.pdf`);
}
