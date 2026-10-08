import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { peopleKeys } from "./keys";
import { logPeopleActivity, usePeopleContext } from "./employees";
import type { Department } from "./types";

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function validateDepartmentName(name: string, existing: Department[], selfId?: string): string | null {
  const n = cleanName(name);
  if (n.length < 1) return "Enter a name.";
  if (n.length > 80) return "Keep it under 80 characters.";
  if (existing.some((d) => d.id !== selfId && d.name.toLowerCase() === n.toLowerCase())) return "A department with this name already exists.";
  return null;
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await db
        .from("departments")
        .insert({ company_id: companyId, name: cleanName(name) })
        .select("id,company_id,name,created_at")
        .single();
      if (error) throw error;
      await logPeopleActivity("department.created", `Created department ${cleanName(name)}`, { department_id: data.id });
      return data as Department;
    },
    onSuccess: (dept) => {
      qc.setQueryData<Department[]>(peopleKeys.departments(companyId), (old) =>
        [...(old ?? []), dept].sort((a, b) => a.name.localeCompare(b.name)),
      );
      qc.invalidateQueries({ queryKey: peopleKeys.departments(companyId) });
    },
  });
}

export function useRenameDepartment() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ id, name, previous }: { id: string; name: string; previous: string }) => {
      const { error } = await db.from("departments").update({ name: cleanName(name) }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      await logPeopleActivity("department.renamed", `Renamed department ${previous} to ${cleanName(name)}`, { department_id: id });
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: peopleKeys.departments(companyId) });
      const prev = qc.getQueryData<Department[]>(peopleKeys.departments(companyId));
      qc.setQueryData<Department[]>(peopleKeys.departments(companyId), (old) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, name: cleanName(name) } : d)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(peopleKeys.departments(companyId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: peopleKeys.departments(companyId) }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ id, moveTo }: { id: string; moveTo: string | null }) => {
      const { data, error } = await db.rpc("people_delete_department", { p_department: id, p_move_to: moveTo });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: peopleKeys.all(companyId) }),
  });
}
