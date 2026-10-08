import type jsPDF from "jspdf";
import type { RowInput, UserOptions } from "jspdf-autotable";
import { format } from "date-fns";
import { ADICORP_LOGO_PATH } from "@/lib/branding";

/** Brand primary #074DB7 as RGB, for jsPDF. */
export const BRAND_RGB: [number, number, number] = [7, 77, 183];
const INK: [number, number, number] = [33, 40, 44];
const MUTED: [number, number, number] = [110, 118, 130];

export interface PdfCompany {
  name?: string | null;
  /** Public logo URL; falls back to the AdiCorp mark. */
  logo?: string | null;
}

export interface BrandedPdfOptions {
  title: string;
  subtitle?: string;
  company?: PdfCompany;
  orientation?: "portrait" | "landscape";
}

const imageCache = new Map<string, Promise<string | null>>();

/** Fetch an image and return a PNG/JPEG data URL (null when it cannot be loaded). */
export function loadImageDataUrl(src: string): Promise<string | null> {
  let p = imageCache.get(src);
  if (!p) {
    p = fetch(src, { mode: "cors" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
    imageCache.set(src, p);
  }
  return p;
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

/**
 * A new A4 document with the brand header (blue band, logo, company name, title)
 * and returns the Y position where content can start.
 */
/** Lazy-load jsPDF and autotable so they only download when someone exports. */
export async function loadPdfLibs() {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { JsPDF, autoTable };
}

export async function createBrandedPdf({ title, subtitle, company, orientation = "portrait" }: BrandedPdfOptions) {
  const { JsPDF, autoTable } = await loadPdfLibs();
  const doc = new JsPDF({ orientation, unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFillColor(...BRAND_RGB);
  doc.rect(0, 0, width, 64, "F");

  const logo = (company?.logo && (await loadImageDataUrl(company.logo))) || (await loadImageDataUrl(ADICORP_LOGO_PATH));
  let textX = margin;
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 14, 36, 36, 6, 6, "F");
    try {
      doc.addImage(logo, imageFormat(logo), margin + 3, 17, 30, 30);
    } catch {
      /* unsupported image: skip the logo */
    }
    textX = margin + 48;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(company?.name || "AdiCorp HR", textX, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Generated ${format(new Date(), "d MMM yyyy, HH:mm")}`, textX, 46);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, margin, 96);
  let y = 96;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, margin, 112);
    y = 112;
  }
  doc.setTextColor(...INK);
  return { doc, startY: y + 16, margin, autoTable };
}

/** Page numbers and footer line on every page. Call last. */
export function addPdfFooter(doc: jsPDF, label = "AdiCorp HR") {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 228, 232);
    doc.line(36, height - 30, width - 36, height - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label, 36, height - 18);
    doc.text(`Page ${i} of ${pages}`, width - 36, height - 18, { align: "right" });
  }
}

/** Shared autotable styling in brand colours. */
export function brandTableStyles(): Partial<UserOptions> {
  return {
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK, lineColor: [225, 228, 232], lineWidth: 0.5 },
    headStyles: { fillColor: BRAND_RGB, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    margin: { left: 36, right: 36, bottom: 44 },
  };
}

export interface ExportTablePdfOptions extends BrandedPdfOptions {
  columns: string[];
  rows: RowInput[];
  filename: string;
  /** Optional totals row, bolded. */
  foot?: RowInput[];
  /** Right-align these column indexes (amounts). */
  numericColumns?: number[];
}

/** One-call branded table export (lists, registers, reports). */
export async function exportTablePdf({ columns, rows, filename, foot, numericColumns = [], ...header }: ExportTablePdfOptions) {
  const { doc, startY, autoTable } = await createBrandedPdf(header);
  const columnStyles: UserOptions["columnStyles"] = {};
  numericColumns.forEach((i) => {
    columnStyles[i] = { halign: "right" };
  });
  autoTable(doc, {
    ...brandTableStyles(),
    startY,
    head: [columns],
    body: rows,
    foot,
    footStyles: { fillColor: [235, 241, 251], textColor: INK, fontStyle: "bold" },
    columnStyles,
  });
  addPdfFooter(doc, header.company?.name ? `${header.company.name} · AdiCorp HR` : "AdiCorp HR");
  doc.save(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export type { jsPDF, RowInput, UserOptions };
