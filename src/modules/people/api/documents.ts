import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { peopleKeys } from "./keys";
import { logPeopleActivity, usePeopleContext } from "./employees";
import type { DocumentStub, EmployeeDocument } from "./types";
import type { DocumentType } from "../lib/constants";
import { documentTypeLabel } from "../lib/constants";
import { safeFileName, uploadMimeType } from "../lib/utils";

export const DOCUMENT_BUCKET = "employee-documents";
const DOC_COLUMNS = "id,employee_id,company_id,document_type,document_name,file_name,file_path,file_size,mime_type,uploaded_by,expires_on,created_at";

/** Type + expiry of every document in the company (for the matrix, counts and badges). */
export function useDocumentStubs() {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.documentStubs(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      const { data, error } = await db
        .from("employee_documents")
        .select("id,employee_id,document_type,expires_on")
        .eq("company_id", companyId)
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as DocumentStub[];
    },
  });
}

export function useEmployeeDocuments(employeeId: string | undefined) {
  const { companyId } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.documents(companyId, employeeId),
    enabled: !!companyId && !!employeeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("employee_documents")
        .select(DOC_COLUMNS)
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeDocument[];
    },
  });
}

export interface UploadDocumentArgs {
  employeeId: string;
  employeeName: string;
  file: File;
  type: DocumentType;
  name: string;
  expiresOn?: string | null;
}

export function useUploadDocument() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ employeeId, employeeName, file, type, name, expiresOn }: UploadDocumentArgs) => {
      const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${companyId}/${employeeId}/${type}/${stamp}-${safeFileName(file.name)}`;
      const mime = uploadMimeType(file);
      // Blob uploads are sent as form data typed by the blob itself, so retype a file the browser left blank.
      const body = file.type ? file : new Blob([file], { type: mime });
      const up = await db.storage.from(DOCUMENT_BUCKET).upload(path, body, { contentType: mime, upsert: false });
      if (up.error) throw up.error;
      const { data: userData } = await db.auth.getUser();
      const docName = name.trim() || documentTypeLabel(type);
      const { data, error } = await db
        .from("employee_documents")
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          document_type: type,
          document_name: docName.slice(0, 120),
          file_name: file.name.slice(0, 200),
          file_path: path,
          file_size: file.size,
          mime_type: mime,
          uploaded_by: userData.user?.id ?? null,
          expires_on: expiresOn || null,
        })
        .select(DOC_COLUMNS)
        .single();
      if (error) {
        // Keep storage and the table in step: remove the orphaned object.
        await db.storage.from(DOCUMENT_BUCKET).remove([path]);
        throw error;
      }
      await logPeopleActivity("document.added", `Added ${docName} for ${employeeName}`, { document_id: data.id, type }, employeeId);
      return data as EmployeeDocument;
    },
    onSuccess: (_doc, vars) => {
      qc.invalidateQueries({ queryKey: peopleKeys.documents(companyId, vars.employeeId) });
      qc.invalidateQueries({ queryKey: peopleKeys.documentStubs(companyId) });
      qc.invalidateQueries({ queryKey: peopleKeys.badges(companyId) });
      qc.invalidateQueries({ queryKey: peopleKeys.activity(companyId, vars.employeeId) });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ doc, employeeName }: { doc: EmployeeDocument; employeeName: string }) => {
      const { error } = await db.from("employee_documents").delete().eq("id", doc.id).eq("company_id", companyId);
      if (error) throw error;
      const rm = await db.storage.from(DOCUMENT_BUCKET).remove([doc.file_path]);
      if (rm.error && import.meta.env.DEV) console.warn("[people] storage remove failed", rm.error);
      await logPeopleActivity("document.removed", `Removed ${doc.document_name} for ${employeeName}`, { type: doc.document_type }, doc.employee_id);
    },
    onMutate: async ({ doc }) => {
      const key = peopleKeys.documents(companyId, doc.employee_id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<EmployeeDocument[]>(key);
      qc.setQueryData<EmployeeDocument[]>(key, (old) => (old ?? []).filter((d) => d.id !== doc.id));
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: peopleKeys.documents(companyId, vars.doc.employee_id) });
      qc.invalidateQueries({ queryKey: peopleKeys.documentStubs(companyId) });
      qc.invalidateQueries({ queryKey: peopleKeys.badges(companyId) });
    },
  });
}

/** Open a private document in a new tab with a 5-minute signed URL. */
export async function openStaffDocument(path: string): Promise<void> {
  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not open the file.");
  openInNewTab(data.signedUrl);
}

/** Open a URL in a new tab without giving it access to this window. */
export function openInNewTab(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
