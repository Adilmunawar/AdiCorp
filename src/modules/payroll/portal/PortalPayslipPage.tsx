import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { CardSkeleton, EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { errorMessage, usePortalPayslip } from "../lib/api";
import { payslipPdf } from "../lib/pdf";
import { PayslipDocument, type SlipData } from "../components/PayslipDocument";

export default function PortalPayslipPage() {
  const { id } = useParams<{ id: string }>();
  const q = usePortalPayslip(id);
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  if (q.isLoading) {
    // Same width as the payslip itself, so nothing jumps when it arrives.
    return (
      <div className="mx-auto w-full max-w-4xl" aria-busy="true" aria-label="Loading payslip">
        <CardSkeleton lines={8} />
      </div>
    );
  }
  if (q.isError || !q.data?.payslip) {
    return (
      <EmptyState
        icon={FileText}
        title="Payslip not available"
        description={q.error ? errorMessage(q.error) : "It may be being corrected by Finance."}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/payslips">My payslips</Link>
          </Button>
        }
      />
    );
  }

  const { payslip, employee, company } = q.data;
  const slip: SlipData = { ...payslip, lines: Array.isArray(payslip.lines) ? payslip.lines : [] };
  const person = { ...employee };

  const pdf = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      await payslipPdf(slip, person, company, mode);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2">
          <Link to="/portal/payslips">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            My payslips
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={!!busy} onClick={() => pdf("download")}>
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" aria-hidden />}
            Download PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={!!busy} onClick={() => pdf("print")}>
            {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" aria-hidden />}
            Print
          </Button>
        </div>
      </div>
      <PayslipDocument slip={slip} person={person} company={company} />
    </div>
  );
}
