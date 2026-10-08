import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, EmptyState, ListSkeleton, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { openStaffDocument, useDeleteDocument, useEmployeeDocuments, useUploadDocument } from "../../api/documents";
import { usePeopleContext } from "../../api/employees";
import type { Employee, EmployeeDocument } from "../../api/types";
import { REQUIRED_DOCUMENTS, documentTypeLabel, type DocumentType } from "../../lib/constants";
import { daysUntil, errorMessage, formatBytes } from "../../lib/utils";
import { DocumentUploadDialog } from "../DocumentUploadDialog";

export function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return <StatusBadge status="expired" label={`Expired ${formatDate(date)}`} />;
  if (days <= 60) return <StatusBadge status="pending" label={days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`} />;
  return <span className="text-[11px] text-muted-foreground">Valid until {formatDate(date)}</span>;
}

/** Documents of one employee: required checklist, list, upload, open and delete. */
export function DocumentsPanel({
  employee,
  openUpload,
  onUploadOpened,
}: {
  employee: Pick<Employee, "id" | "name">;
  /** Open the upload dialog once the list has loaded (from the profile's "Upload a document"). */
  openUpload?: boolean;
  onUploadOpened?: () => void;
}) {
  const { isHR } = usePeopleContext();
  const { data: docs = [], isLoading } = useEmployeeDocuments(employee.id);
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const [dialog, setDialog] = useState<{ type: DocumentType } | null>(null);
  const has = new Set(docs.map((d) => d.document_type));
  const onRecord = REQUIRED_DOCUMENTS.filter((r) => has.has(r.type)).length;

  useEffect(() => {
    if (!openUpload || isLoading) return;
    const firstMissing = REQUIRED_DOCUMENTS.find((r) => !has.has(r.type))?.type;
    setDialog({ type: firstMissing ?? "other" });
    onUploadOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpload, isLoading]);

  const open = async (d: EmployeeDocument) => {
    try {
      await openStaffDocument(d.file_path);
    } catch (e) {
      toast.error(errorMessage(e, "Could not open the file."));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <SectionCard
        title="Required"
        description={isLoading ? "Every active employee needs these on file." : `${onRecord} of ${REQUIRED_DOCUMENTS.length} on file`}
        icon={CheckCircle2}
      >
        <ul className="space-y-2">
          {REQUIRED_DOCUMENTS.map((r) => {
            const ok = has.has(r.type);
            return (
              <li key={r.type} className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2", ok ? "border-success/20 bg-success/5" : "border-border")}>
                {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{documentTypeLabel(r.type)}</span>
                {!ok && isHR && (
                  <Button size="sm" variant="soft" className="h-8 rounded-lg px-2.5 text-[11px] sm:h-7" onClick={() => setDialog({ type: r.type })}>
                    Upload
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="All documents"
        description={`${docs.length} file${docs.length === 1 ? "" : "s"} on record`}
        flush
        actions={
          isHR ? (
            <Button size="sm" onClick={() => setDialog({ type: "other" })}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <ListSkeleton rows={3} className="p-4" />
        ) : docs.length === 0 ? (
          <EmptyState icon={FileText} title="No documents yet" description="Upload the CNIC copy, contract and certificates. Employees can also add their own from the portal." compact />
        ) : (
          <ul className="divide-y divide-border/60">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{d.document_name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{documentTypeLabel(d.document_type)}</span>
                    <span>·</span>
                    <span>{formatBytes(d.file_size)}</span>
                    <span>·</span>
                    <span>Added {formatDate(d.created_at)}</span>
                    {!d.uploaded_by && <StatusBadge status="info" tone="info" label="From portal" dot={false} />}
                    {d.expires_on && <ExpiryBadge date={d.expires_on} />}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-10 w-10 px-0 sm:h-8 sm:w-auto sm:px-2" onClick={() => open(d)} aria-label={`Open ${d.document_name}`}>
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Open</span>
                </Button>
                {isHR && (
                  <ConfirmButton
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 px-0 text-destructive hover:text-destructive sm:h-8 sm:w-8"
                    title={`Delete ${d.document_name}?`}
                    description="The file is removed from storage. This cannot be undone."
                    confirmLabel="Delete"
                    aria-label={`Delete ${d.document_name}`}
                    onConfirm={async () => {
                      try {
                        await remove.mutateAsync({ doc: d, employeeName: employee.name });
                        toast.success("Document deleted");
                      } catch (e) {
                        toast.error(errorMessage(e, "Could not delete the document."));
                        throw e;
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <DocumentUploadDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        defaultType={dialog?.type ?? "other"}
        title={`Upload for ${employee.name}`}
        onSubmit={(v) => upload.mutateAsync({ employeeId: employee.id, employeeName: employee.name, file: v.file, type: v.type, name: v.name, expiresOn: v.expiresOn })}
      />
    </div>
  );
}
