import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES, documentTypeLabel, type DocumentType } from "../lib/constants";
import { UPLOAD_ACCEPT, checkUpload, errorMessage, formatBytes } from "../lib/utils";
import { Field } from "./common";

export interface DocumentUploadValues {
  file: File;
  type: DocumentType;
  name: string;
  expiresOn: string | null;
}

/**
 * Pick a file, its type, a display name and an optional expiry date. `onSubmit`
 * does the upload (staff storage or the portal Edge Function).
 */
export function DocumentUploadDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultType = "id_copy",
  title = "Upload a document",
  description = "PDF, JPG, PNG, WebP or Word, up to 8 MB.",
  showExpiry = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DocumentUploadValues) => Promise<unknown>;
  defaultType?: DocumentType;
  title?: string;
  description?: string;
  showExpiry?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(defaultType);
  const [name, setName] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setType(defaultType);
      setName("");
      setExpiresOn("");
      setError(null);
    }
  }, [open, defaultType]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = checkUpload(f);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return setError("Choose a file to upload.");
    setPending(true);
    try {
      await onSubmit({ file, type, name: name.trim() || documentTypeLabel(type), expiresOn: expiresOn || null });
      toast.success("Document uploaded");
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Upload failed. Please try again."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40",
            )}
            aria-label="Choose a file"
          >
            {file ? (
              <div className="flex w-full items-center gap-3 text-left">
                <FileUp className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <FileUp className="h-6 w-6 text-primary" />
                <p className="text-[13px] font-semibold">Drop a file here or tap to choose</p>
                <p className="text-[11px] text-muted-foreground">PDF, images or Word · 8 MB max</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                // Clear the input so choosing the same file again (after removing it) still fires.
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="doc-type" label="Type" required>
              <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
                <SelectTrigger id="doc-type" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {showExpiry && (
              <Field id="doc-expiry" label="Expires on" hint="Optional (ID cards, visas)">
                <Input id="doc-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="h-10 rounded-xl" />
              </Field>
            )}
          </div>
          <Field id="doc-name" label="Name" hint={`Defaults to "${documentTypeLabel(type)}"`}>
            <Input id="doc-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={documentTypeLabel(type)} className="h-10 rounded-xl" />
          </Field>
          {error && (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !file}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
