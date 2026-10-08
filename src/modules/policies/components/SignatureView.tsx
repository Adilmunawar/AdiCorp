import { useEffect, useState } from "react";
import { BadgeCheck, Download, Fingerprint, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/components/kit";
import { exportSignedCopyPdf, type LetterheadCompany } from "../lib/pdf";
import { sha256Hex } from "../lib/richText";
import type { SignatureRecord } from "../lib/types";
import { errorMessage } from "../lib/company";

/** Recomputes the text fingerprint in the browser and compares it with the stored one. */
function useFingerprintCheck(record: SignatureRecord | null | undefined) {
  const [state, setState] = useState<"checking" | "match" | "mismatch">("checking");
  useEffect(() => {
    let alive = true;
    if (!record) return;
    setState("checking");
    // The stored text is exactly what was fingerprinted at publish (the server trims it then), so hash it
    // as is: JavaScript's trim() also strips characters the server keeps and would report a false mismatch.
    sha256Hex(record.body)
      .then((hex) => alive && setState(hex === record.body_sha256 ? "match" : "mismatch"))
      .catch(() => alive && setState("mismatch"));
    return () => {
      alive = false;
    };
  }, [record]);
  return state;
}

/** The signature evidence: drawn signature, typed name, time, IP, browser and fingerprint. */
export function SignatureEvidence({ record, company }: { record: SignatureRecord; company: LetterheadCompany }) {
  const check = useFingerprintCheck(record);
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      await exportSignedCopyPdf({
        company,
        title: record.title,
        version: record.version,
        publishedAt: record.published_at,
        body: record.body,
        signedName: record.signed_name,
        signaturePng: record.signature_png,
        sha256: record.body_sha256,
        signedAt: record.signed_at,
        ip: record.ip,
        userAgent: record.user_agent,
        employeeName: record.employee_name,
        employeeCode: record.employee_code,
        rank: record.rank,
      });
    } catch (err) {
      toast.error("Could not create the PDF", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const rows: [string, string][] = [
    ["Signed by", [record.employee_name, record.employee_code].filter(Boolean).join(" · ") || "—"],
    ["Typed name", record.signed_name],
    ["Signed at", formatDateTime(record.signed_at)],
    ["IP address", record.ip || "—"],
    ["Browser", record.user_agent || "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background p-3">
        <p className="micro-label mb-2">Signature</p>
        <img src={record.signature_png} alt={`Signature of ${record.signed_name}`} className="h-24 w-full max-w-sm rounded-lg bg-card object-contain" />
      </div>
      <dl className="grid gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[96px_1fr] gap-2">
            <dt className="micro-label pt-0.5">{k}</dt>
            <dd className="min-w-0 break-words text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5">
          <Fingerprint className="h-3.5 w-3.5 text-primary" aria-hidden />
          <p className="micro-label">Text fingerprint (SHA-256)</p>
        </div>
        <p className="mt-1 break-all font-mono text-[10.5px] text-foreground">{record.body_sha256}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px]">
          {check === "checking" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Checking the text…</span>
            </>
          ) : check === "match" ? (
            <>
              <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden />
              <span className="font-medium text-success">The text on record matches what was signed.</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden />
              <span className="font-medium text-destructive">The fingerprint does not match the stored text.</span>
            </>
          )}
        </p>
      </div>
      <Button type="button" variant="outline" className="w-full gap-1.5 rounded-xl sm:w-auto" onClick={download} disabled={exporting}>
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        Signed copy (PDF)
      </Button>
    </div>
  );
}
