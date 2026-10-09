import { addPdfFooter, brandTableStyles, createBrandedPdf, formatMoney, formatMonth } from "@/components/kit";
import { attendanceText, paymentText, slipLines, slipTotals, statusLine, type SlipCompany, type SlipData, type SlipPerson } from "../components/PayslipDocument";
import { amountInWords, formatDay, payPeriod, payslipRef } from "../components/bits";

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "payslip";
}

type WithTable = { lastAutoTable?: { finalY: number } };

/** Builds the payslip PDF with the company letterhead. `print` opens it with the print dialog instead of downloading. */
export async function payslipPdf(slip: SlipData, person: SlipPerson, company: SlipCompany, mode: "download" | "print" = "download"): Promise<void> {
  const cur = (company.currency || "PKR").toUpperCase();
  const month = formatMonth(slip.month);
  const { doc, startY, margin, autoTable } = await createBrandedPdf({
    title: `Payslip, ${month}`,
    subtitle: `Pay period ${payPeriod(slip.month, " to ")} · Ref. ${payslipRef(slip.month, person.code, slip.id)}`,
    company: { name: company.name, logo: company.logo },
  });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const styles = brandTableStyles();
  const { earnings, deductions } = slipLines(slip, cur);
  const { gross, deductions: ded, net } = slipTotals(slip);
  const amount = (v: number) => formatMoney(v, cur).replace(`${cur} `, "");

  autoTable(doc, {
    ...styles,
    startY,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3, textColor: [33, 40, 44] },
    body: [
      ["Employee", person.name, "Employee code", person.code || "—"],
      ["Position", [person.rank, person.department].filter(Boolean).join(", ") || "—", "CNIC", person.cnic || "—"],
      ["Father's name", person.father_name || "—", "Joined", person.joining_date ? formatDay(person.joining_date) : "—"],
      ["Paid by", paymentText(slip, person), "Days paid", slip.paid_days != null && slip.month_days ? `${slip.paid_days} of ${slip.month_days}` : "—"],
      ["Status", statusLine(slip), "", ""],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 82, textColor: [110, 118, 130] }, 2: { fontStyle: "bold", cellWidth: 82, textColor: [110, 118, 130] } },
  });

  const afterDetails = (doc as unknown as WithTable).lastAutoTable?.finalY ?? startY + 80;
  const half = (width - margin * 2 - 14) / 2;
  const rows = (items: typeof earnings) => items.map((l) => [l.hint ? `${l.label}\n${l.hint}` : l.label, amount(l.amount)]);

  autoTable(doc, {
    ...styles,
    startY: afterDetails + 14,
    margin: { left: margin, right: width - margin - half },
    head: [["Earnings", `Amount (${cur})`]],
    body: rows(earnings),
    foot: [["Gross pay", amount(gross)]],
    footStyles: { fillColor: [241, 244, 249], textColor: [33, 40, 44], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 92 } },
    tableWidth: half,
  });
  const leftEnd = (doc as unknown as WithTable).lastAutoTable?.finalY ?? afterDetails;

  autoTable(doc, {
    ...styles,
    startY: afterDetails + 14,
    margin: { left: margin + half + 14, right: margin },
    head: [["Deductions", `Amount (${cur})`]],
    body: deductions.length ? rows(deductions) : [["No deductions this month", amount(0)]],
    foot: [["Total deductions", amount(ded)]],
    footStyles: { fillColor: [241, 244, 249], textColor: [33, 40, 44], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 92 } },
    tableWidth: half,
  });
  const rightEnd = (doc as unknown as WithTable).lastAutoTable?.finalY ?? afterDetails;

  let y = Math.max(leftEnd, rightEnd) + 20;
  const words = doc.splitTextToSize(amountInWords(net, cur), width - margin * 2 - 200);
  const band = Math.max(46, 30 + words.length * 11);
  doc.setFillColor(235, 242, 252);
  doc.roundedRect(margin, y, width - margin * 2, band, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(7, 77, 183);
  doc.text("NET PAY", margin + 12, y + 18);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 66, 75);
  doc.text(words, margin + 12, y + 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(7, 77, 183);
  doc.text(formatMoney(net, cur), width - margin - 12, y + 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 118, 130);
  doc.text(`Gross ${formatMoney(gross, cur)} less ${formatMoney(ded, cur)} deductions`, width - margin - 12, y + 37, { align: "right" });
  y += band + 18;

  doc.setTextColor(60, 66, 75);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (slip.notes) {
    const lines = doc.splitTextToSize(`Notes: ${slip.notes}`, width - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 6;
  }
  const attendance = attendanceText(slip);
  doc.setFontSize(8);
  doc.setTextColor(120, 126, 136);
  if (attendance) {
    doc.text(`Attendance in ${month}: ${attendance}. Shown for reference.`, margin, y);
    y += 12;
  }
  doc.text(`Computer-generated payslip from ${company.name}; no signature is required.`, margin, y);

  if (slip.status === "draft") {
    // A faint diagonal mark so a draft is never mistaken for the final payslip.
    try {
      const d = doc as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void };
      d.setGState(new d.GState({ opacity: 0.08 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(110);
      doc.setTextColor(33, 40, 44);
      doc.text("DRAFT", width / 2, height / 2 + 40, { align: "center", angle: 30 });
      d.setGState(new d.GState({ opacity: 1 }));
    } catch {
      /* the watermark is decoration only */
    }
  }
  addPdfFooter(doc, company.name || "");

  const file = `payslip-${safeName(person.code || person.name)}-${slip.month.slice(0, 7)}${slip.status === "draft" ? "-draft" : ""}.pdf`;
  if (mode === "print") {
    doc.autoPrint();
    const url = doc.output("bloburl");
    const w = window.open(String(url), "_blank");
    if (!w) doc.save(file);
    return;
  }
  doc.save(file);
}
