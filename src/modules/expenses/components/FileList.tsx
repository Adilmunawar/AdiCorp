import { FileText } from "lucide-react";
import { FILE_KIND_LABELS, type ExpenseFile } from "../kinds";

/** Files on an item (quotes, certificates); receipts are listed under their payment. */
export function FileList({ files, onOpen }: { files: ExpenseFile[]; onOpen: (path: string) => void }) {
  return (
    <ul className="grid gap-1.5">
      {files.map((f) => (
        <li key={f.id}>
          <FileButton file={f} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

export function FileButton({ file, onOpen, label }: { file: ExpenseFile; onOpen: (path: string) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file.storage_path)}
      className="group flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left text-xs hover:bg-muted/50"
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="shrink-0 text-muted-foreground">{label ?? FILE_KIND_LABELS[file.kind]}:</span>
      <span className="min-w-0 truncate font-medium text-primary underline-offset-2 group-hover:underline">{file.file_name}</span>
    </button>
  );
}
