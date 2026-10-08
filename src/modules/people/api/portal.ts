import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalRpc, portalSignedUrl, portalUpload } from "@/lib/portal";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { peoplePortalKeys } from "./keys";
import type { DocumentType } from "../lib/constants";
import { DOCUMENT_BUCKET, openInNewTab } from "./documents";

export interface PortalDocument {
  id: string;
  document_name: string;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  expires_on: string | null;
  created_at: string;
  uploaded_by_me: boolean;
}

export interface PortalAssetNow {
  id: string;
  tag: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  condition: string;
  assigned_on: string | null;
  warranty_until: string | null;
}

export interface PortalAssetPast {
  id: string;
  tag: string;
  name: string;
  category: string;
  assigned_on: string;
  returned_on: string | null;
  condition_out: string | null;
  condition_in: string | null;
}

export function useMyDocuments() {
  const { employee } = useEmployeeAuth();
  return useQuery({
    queryKey: peoplePortalKeys.documents(employee?.id),
    enabled: !!employee?.id,
    queryFn: async () => (await portalRpc<PortalDocument[]>("portal_my_documents")) ?? [],
  });
}

export function useUploadMyDocument() {
  const { employee } = useEmployeeAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, type, name }: { file: File; type: DocumentType; name: string }) => {
      const { path } = await portalUpload(file, DOCUMENT_BUCKET, type);
      return portalRpc<{ id: string }>("portal_add_document", {
        p_path: path,
        p_name: name,
        p_type: type,
        p_file_name: file.name,
        p_size: file.size,
        p_mime: file.type || null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: peoplePortalKeys.documents(employee?.id) }),
  });
}

export async function openMyDocument(path: string): Promise<void> {
  const url = await portalSignedUrl(DOCUMENT_BUCKET, path);
  openInNewTab(url);
}

export function useMyAssets() {
  const { employee } = useEmployeeAuth();
  return useQuery({
    queryKey: peoplePortalKeys.assets(employee?.id),
    enabled: !!employee?.id,
    queryFn: async () => {
      const data = await portalRpc<{ current: PortalAssetNow[]; history: PortalAssetPast[] }>("portal_my_assets");
      return { current: data?.current ?? [], history: data?.history ?? [] };
    },
  });
}
