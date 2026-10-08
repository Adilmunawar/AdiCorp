import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageSkeleton, SectionCard, formatDate } from "@/components/kit";
import { usePortalSignature } from "../lib/api";
import { errorMessage, usePortalLetterhead } from "../lib/company";
import { RichText } from "../components/RichText";
import { SignatureEvidence } from "../components/SignatureView";

/** The employee's signed copy: the text they signed and the signature evidence. */
export default function PortalSignaturePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePortalSignature(id);
  const company = usePortalLetterhead();

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="Signature not found"
        description={error ? errorMessage(error) : "It may have been removed. Your signed copies are listed under Policies."}
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/portal/policies">Back to policies</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/portal/policies">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Policies
        </Link>
      </Button>
      <PageHeader icon={BadgeCheck} eyebrow="Signed copy" title={<span className="whitespace-normal break-words">{data.title}</span>} description={`Version ${data.version}${data.published_at ? ` · published ${formatDate(data.published_at)}` : ""}`} />
      <SectionCard title="Your signature">
        <SignatureEvidence record={data} company={company} />
      </SectionCard>
      <SectionCard title="The text you signed" contentClassName="p-5 sm:p-8">
        <RichText source={data.body} />
      </SectionCard>
    </div>
  );
}
