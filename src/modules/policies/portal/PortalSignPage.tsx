import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, BadgeCheck, CheckCircle2, Clock, Download, FileSignature, Loader2, Lock, PenTool } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, PageSkeleton, SectionCard, StatusBadge, formatDate, formatDateTime } from "@/components/kit";
import { cn } from "@/lib/utils";
import { usePortalPolicyVersion, usePortalSignPolicy } from "../lib/api";
import { errorMessage, usePortalLetterhead } from "../lib/company";
import { exportPolicyPdf } from "../lib/pdf";
import { readingMinutes, sameName } from "../lib/richText";
import { RichText } from "../components/RichText";
import { SignaturePad } from "../components/SignaturePad";

/** Read a policy and sign it: the form unlocks once the reader reaches the end of the text. */
export default function PortalSignPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const navigate = useNavigate();
  const company = usePortalLetterhead();
  const { data: v, isLoading, error } = usePortalPolicyVersion(versionId);
  const sign = usePortalSignPolicy();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [padProblem, setPadProblem] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setReachedEnd(false);
    setAgreed(false);
    setTypedName("");
    setPng(null);
    setPadProblem(null);
  }, [versionId]);

  useEffect(() => {
    const el = endRef.current;
    if (!el || reachedEnd) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setReachedEnd(true), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [v?.version_id, reachedEnd]);

  const onPad = useCallback((value: string | null, problem: string | null) => {
    setPng(value);
    setPadProblem(problem);
  }, []);

  if (isLoading) return <PageSkeleton />;
  if (error || !v) {
    return (
      <EmptyState
        icon={FileSignature}
        title="This policy is not available"
        description={error ? errorMessage(error) : "Open Policies to see the current ones."}
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/portal/policies">Back to policies</Link>
          </Button>
        }
      />
    );
  }

  const canSign = v.status === "published" && v.requires_signature && !v.signature_id;
  const nameOk = sameName(typedName, v.employee_name);
  const ready = reachedEnd && agreed && nameOk && !!png;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!png) return;
    try {
      const r = await sign.mutateAsync({ versionId: v.version_id, typedName: typedName.trim(), agreed, signaturePng: png });
      toast.success(r.already ? "You had already signed this" : `Signed: ${v.title}`, {
        description: r.next_version_id ? "One more policy is waiting for your signature." : "Thank you. A signed copy is kept in Policies.",
      });
      navigate(r.next_version_id ? `/portal/policies/sign/${r.next_version_id}` : "/portal/policies", { replace: true });
    } catch (err) {
      toast.error("Could not sign", { description: errorMessage(err) });
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      await exportPolicyPdf({ company, title: v.title, version: v.version, status: v.status, publishedAt: v.published_at, body: v.body, sha256: v.body_sha256 });
    } catch (err) {
      toast.error("Could not create the PDF", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/portal/policies">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Policies
        </Link>
      </Button>
      <PageHeader
        icon={FileSignature}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Version {v.version}
            {/* Badges keep their normal case inside the uppercase eyebrow. */}
            <span className="normal-case tracking-normal">
              {v.signature_id ? <StatusBadge status="signed" /> : canSign ? <StatusBadge status="pending" label="Please sign" /> : <StatusBadge status={v.status} />}
            </span>
          </span>
        }
        title={<span className="whitespace-normal break-words">{v.title}</span>}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> About {readingMinutes(v.body)} min to read
            </span>
            {v.published_at && <span>Published {formatDate(v.published_at)}</span>}
          </span>
        }
        actions={
          <Button variant="outline" className="gap-1.5 rounded-xl" onClick={download} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            PDF
          </Button>
        }
      />

      {v.signature_id && (
        <div className="flex flex-col gap-2 rounded-2xl border border-success/25 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BadgeCheck className="h-5 w-5 text-success" aria-hidden /> You signed this version on {formatDateTime(v.signed_at)}.
          </p>
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
            <Link to={`/portal/policies/signatures/${v.signature_id}`}>Signed copy</Link>
          </Button>
        </div>
      )}

      {canSign && !reachedEnd && (
        <p className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <ArrowDown className="h-4 w-4 shrink-0 text-primary" aria-hidden /> Read to the end. The signature form unlocks when you reach it.
        </p>
      )}

      <SectionCard contentClassName="p-5 sm:p-8">
        {v.summary && <p className="mb-4 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">{v.summary}</p>}
        <RichText source={v.body} />
        <div ref={endRef} id="policy-end" className="mt-6 flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> End of {v.title}
        </div>
      </SectionCard>

      {canSign && (
        <SectionCard
          title="Sign"
          description="Your signature, typed name, the time and your browser are recorded with a fingerprint of this exact text."
          icon={PenTool}
          className={cn(!reachedEnd && "opacity-70")}
        >
          <form onSubmit={submit} className="space-y-4">
            {!reachedEnd && (
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Read the whole policy first.
              </p>
            )}
            <label className={cn("flex items-start gap-2.5 rounded-xl border border-border p-3 text-sm", !reachedEnd && "pointer-events-none")}>
              <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} disabled={!reachedEnd} className="mt-0.5" />
              <span>
                I have read and understood the <strong>{v.title}</strong> (version {v.version}) and I agree to follow it.
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="sign-name">Your full name</Label>
              <Input
                id="sign-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                disabled={!reachedEnd}
                autoComplete="name"
                placeholder={v.employee_name}
                aria-invalid={typedName.length > 0 && !nameOk}
                className="h-10 rounded-xl"
              />
              <p className={cn("text-[11px]", typedName && !nameOk ? "text-destructive" : "text-muted-foreground")}>
                {typedName && !nameOk ? `Type your name as HR has it on record: ${v.employee_name}.` : `As HR has it on record: ${v.employee_name}.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Your signature</p>
              <SignaturePad onChange={onPad} typedName={nameOk ? typedName : undefined} disabled={!reachedEnd} />
              {padProblem && <p className="text-[11px] text-destructive">{padProblem}</p>}
            </div>
            <Button type="submit" className="w-full gap-1.5 rounded-xl sm:w-auto" disabled={!ready || sign.isPending}>
              {sign.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PenTool className="h-4 w-4" aria-hidden />}
              Sign policy
            </Button>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
