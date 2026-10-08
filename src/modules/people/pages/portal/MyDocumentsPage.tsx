import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, ExternalLink, FileText, FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { cn } from "@/lib/utils";
import { openMyDocument, useMyDocuments, useUploadMyDocument } from "../../api/portal";
import { REQUIRED_DOCUMENTS, documentTypeLabel, type DocumentType } from "../../lib/constants";
import { errorMessage, formatBytes } from "../../lib/utils";
import { DocumentUploadDialog } from "../../components/DocumentUploadDialog";
import { ExpiryBadge } from "../../components/profile/DocumentsPanel";
import { LoadError } from "../../components/PageBits";

/** Portal: my documents on file, with upload for the ones HR still needs. */
export default function MyDocumentsPage() {
  const { data: docs = [], isLoading, isError, refetch } = useMyDocuments();
  const upload = useUploadMyDocument();
  const [dialog, setDialog] = useState<DocumentType | null>(null);
  const has = new Set(docs.map((d) => d.document_type));
  const missing = REQUIRED_DOCUMENTS.filter((r) => !has.has(r.type));

  const open = async (path: string) => {
    try {
      await openMyDocument(path);
    } catch (e) {
      toast.error(errorMessage(e, "Could not open the file."));
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        eyebrow="My portal"
        title="My documents"
        icon={FolderOpen}
        description="Your files on record with HR. Only you and HR can open them."
        actions={
          <Button size="sm" onClick={() => setDialog(missing[0]?.type ?? "other")}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        }
      />

      {/* Without the list, every required file would wrongly read as missing. */}
      {isError ? (
        <LoadError what="Your documents" icon={FolderOpen} onRetry={() => refetch()} />
      ) : (
        <>
          <SectionCard title="What HR needs" className="mb-4">
            {isLoading ? (
              <ListSkeleton rows={1} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-3">
                {REQUIRED_DOCUMENTS.map((r) => {
                  const ok = has.has(r.type);
                  return (
                    <li key={r.type} className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5", ok ? "border-success/20 bg-success/5" : "border-dashed border-warning/40")}>
                      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <CircleDashed className="h-4 w-4 shrink-0 text-warning" />}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{documentTypeLabel(r.type)}</span>
                      {!ok && (
                        <Button size="sm" variant="soft" className="h-7 rounded-lg px-2 text-[11px]" onClick={() => setDialog(r.type)}>
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="On file" description={`${docs.length} document${docs.length === 1 ? "" : "s"}`} flush>
            {isLoading ? (
              <ListSkeleton rows={3} className="p-4" />
            ) : docs.length === 0 ? (
              <EmptyState icon={FileText} title="No documents yet" description="Upload a clear photo or PDF of your CNIC and certificates. HR will see them straight away." compact />
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
                        <span>{formatDate(d.created_at)}</span>
                        {d.uploaded_by_me ? <StatusBadge status="info" tone="neutral" label="Added by you" dot={false} /> : <StatusBadge status="info" tone="primary" label="From HR" dot={false} />}
                        {d.expires_on && <ExpiryBadge date={d.expires_on} />}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => open(d.file_path)} aria-label={`Open ${d.document_name}`}>
                      <ExternalLink className="h-4 w-4" />
                      <span className="hidden sm:inline">Open</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}

      <DocumentUploadDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        defaultType={dialog ?? "other"}
        showExpiry={false}
        title="Upload a document"
        description="PDF, JPG, PNG, WebP or Word, up to 8 MB. Only HR can remove files once uploaded."
        onSubmit={(v) => upload.mutateAsync({ file: v.file, type: v.type, name: v.name })}
      />
    </div>
  );
}
