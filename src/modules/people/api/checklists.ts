import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { peopleKeys } from "./keys";
import { logPeopleActivity, usePeopleContext } from "./employees";
import type { Checklist, ChecklistItem, ChecklistStatus, ChecklistTemplate, ChecklistTemplateStep, ChecklistWithItems } from "./types";
import type { ChecklistKind } from "../lib/constants";

const LIST_COLUMNS = "id,company_id,employee_id,template_id,kind,title,status,start_date,due_date,note,started_at,closed_at";
const ITEM_COLUMNS = "id,checklist_id,title,description,auto_key,position,due_date,done_at,done_by,touched";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** Templates (seeds the two defaults the first time) with their steps. */
export function useChecklistTemplates() {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.templates(companyId),
    enabled: !!companyId && isHR,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      await rpc<number>("people_ensure_checklist_templates");
      const [tpl, steps] = await Promise.all([
        db.from("checklist_templates").select("id,company_id,kind,name,description,is_default,default_due_days,created_at").eq("company_id", companyId).order("is_default", { ascending: false }).order("name"),
        db.from("checklist_template_steps").select("id,template_id,title,description,auto_key,due_offset_days,position").eq("company_id", companyId).order("position"),
      ]);
      if (tpl.error) throw tpl.error;
      if (steps.error) throw steps.error;
      const all = (steps.data ?? []) as ChecklistTemplateStep[];
      return ((tpl.data ?? []) as ChecklistTemplate[]).map((t) => ({ ...t, steps: all.filter((s) => s.template_id === t.id) }));
    },
  });
}

export type TemplateWithSteps = ChecklistTemplate & { steps: ChecklistTemplateStep[] };

/** Every checklist of the company with its items (auto steps refreshed first). */
export function useChecklists() {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.checklists(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      await rpc<number>("people_sync_checklists", { p_checklist: null });
      const [lists, items] = await Promise.all([
        db.from("employee_checklists").select(LIST_COLUMNS).eq("company_id", companyId).order("started_at", { ascending: false }).limit(2000),
        db.from("employee_checklist_items").select(ITEM_COLUMNS).eq("company_id", companyId).order("position").limit(50000),
      ]);
      if (lists.error) throw lists.error;
      if (items.error) throw items.error;
      const byList = new Map<string, ChecklistItem[]>();
      ((items.data ?? []) as ChecklistItem[]).forEach((i) => {
        const arr = byList.get(i.checklist_id) ?? [];
        arr.push(i);
        byList.set(i.checklist_id, arr);
      });
      return ((lists.data ?? []) as Checklist[]).map((l) => ({ ...l, items: byList.get(l.id) ?? [] })) as ChecklistWithItems[];
    },
  });
}

export function useChecklist(id: string | undefined) {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.checklist(companyId, id),
    enabled: !!companyId && !!id && isHR,
    queryFn: async () => {
      await rpc<number>("people_sync_checklists", { p_checklist: id });
      const [list, items] = await Promise.all([
        db.from("employee_checklists").select(LIST_COLUMNS).eq("company_id", companyId).eq("id", id).maybeSingle(),
        db.from("employee_checklist_items").select(ITEM_COLUMNS).eq("checklist_id", id).order("position"),
      ]);
      if (list.error) throw list.error;
      if (items.error) throw items.error;
      if (!list.data) return null;
      return { ...(list.data as Checklist), items: (items.data ?? []) as ChecklistItem[] } as ChecklistWithItems;
    },
  });
}

export function useEmployeeChecklists(employeeId: string | undefined) {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.employeeChecklists(companyId, employeeId),
    enabled: !!companyId && !!employeeId && isHR,
    queryFn: async () => {
      const { data: lists, error } = await db
        .from("employee_checklists")
        .select(LIST_COLUMNS)
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      const ids = (lists ?? []).map((l: Checklist) => l.id);
      const open = (lists ?? []).filter((l: Checklist) => l.status === "open");
      await Promise.all(open.map((l: Checklist) => rpc<number>("people_sync_checklists", { p_checklist: l.id })));
      if (ids.length === 0) return [] as ChecklistWithItems[];
      const items = await db.from("employee_checklist_items").select(ITEM_COLUMNS).in("checklist_id", ids).order("position");
      if (items.error) throw items.error;
      const all = (items.data ?? []) as ChecklistItem[];
      return ((lists ?? []) as Checklist[]).map((l) => ({ ...l, items: all.filter((i) => i.checklist_id === l.id) }));
    },
  });
}

/** Whether Finance has set a salary (true/false only) for the given people. */
export function useSalarySet(employeeIds: string[]) {
  const { companyId, isHR } = usePeopleContext();
  const ids = [...employeeIds].sort().join(",");
  return useQuery({
    queryKey: peopleKeys.salarySet(companyId, ids),
    enabled: !!companyId && isHR && employeeIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await rpc<{ employee_id: string; salary_set: boolean }[]>("people_salary_set", { p_employees: employeeIds });
      return new Map((data ?? []).map((r) => [r.employee_id, r.salary_set]));
    },
  });
}

function useInvalidateChecklists() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return () => {
    qc.invalidateQueries({ queryKey: peopleKeys.checklists(companyId) });
    qc.invalidateQueries({ queryKey: ["people", companyId, "checklist"] });
    qc.invalidateQueries({ queryKey: ["people", companyId, "employee-checklists"] });
    qc.invalidateQueries({ queryKey: peopleKeys.badges(companyId) });
    qc.invalidateQueries({ queryKey: ["people", companyId, "activity"] });
  };
}

export function useStartChecklist() {
  const invalidate = useInvalidateChecklists();
  return useMutation({
    mutationFn: (args: { employeeId: string; kind: ChecklistKind; templateId?: string | null; start?: string | null; due?: string | null; note?: string | null }) =>
      rpc<string>("people_start_checklist", {
        p_employee: args.employeeId,
        p_kind: args.kind,
        p_template: args.templateId || null,
        p_start: args.start || null,
        p_due: args.due || null,
        p_note: args.note || null,
        p_notify: true,
      }),
    onSuccess: () => invalidate(),
  });
}

/** Tick / untick with an optimistic update on the detail and list caches. */
export function useToggleChecklistItem() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  const invalidate = useInvalidateChecklists();
  return useMutation({
    mutationFn: ({ item, done }: { item: ChecklistItem; done: boolean }) =>
      rpc<{ done: number; total: number }>("people_set_checklist_item", { p_item: item.id, p_done: done }),
    onMutate: async ({ item, done }) => {
      const key = peopleKeys.checklist(companyId, item.checklist_id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistWithItems | null>(key);
      if (prev) {
        qc.setQueryData<ChecklistWithItems>(key, {
          ...prev,
          items: prev.items.map((i) => (i.id === item.id ? { ...i, done_at: done ? new Date().toISOString() : null, touched: true } : i)),
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx?.prev !== undefined && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: () => invalidate(),
  });
}

export function useSetChecklistStatus() {
  const invalidate = useInvalidateChecklists();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ChecklistStatus }) => rpc<void>("people_set_checklist_status", { p_checklist: id, p_status: status }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateChecklistDetails() {
  const invalidate = useInvalidateChecklists();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ id, due, note }: { id: string; due: string | null; note: string | null }) => {
      const { error } = await db.from("employee_checklists").update({ due_date: due, note }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useAddChecklistItem() {
  const invalidate = useInvalidateChecklists();
  return useMutation({
    mutationFn: async ({ checklist, title, due }: { checklist: ChecklistWithItems; title: string; due?: string | null }) => {
      const position = Math.max(0, ...checklist.items.map((i) => i.position)) + 1;
      const { error } = await db
        .from("employee_checklist_items")
        .insert({ company_id: checklist.company_id, checklist_id: checklist.id, title: title.trim(), position, due_date: due || null, touched: true });
      if (error) throw error;
      await logPeopleActivity(`${checklist.kind}.step_added`, `Added step "${title.trim()}"`, { checklist_id: checklist.id }, checklist.employee_id);
    },
    onSuccess: () => invalidate(),
  });
}

export function useRemoveChecklistItem() {
  const invalidate = useInvalidateChecklists();
  return useMutation({
    mutationFn: async ({ checklist, item }: { checklist: ChecklistWithItems; item: ChecklistItem }) => {
      const { error } = await db.from("employee_checklist_items").delete().eq("id", item.id).eq("checklist_id", checklist.id);
      if (error) throw error;
      await logPeopleActivity(`${checklist.kind}.step_removed`, `Removed step "${item.title}"`, { checklist_id: checklist.id }, checklist.employee_id);
    },
    onSuccess: () => invalidate(),
  });
}

/* ---------------------------- template editing ---------------------------- */

function useInvalidateTemplates() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return () => qc.invalidateQueries({ queryKey: peopleKeys.templates(companyId) });
}

export function useSaveTemplate() {
  const invalidate = useInvalidateTemplates();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (t: { id?: string; kind: ChecklistKind; name: string; description: string | null; default_due_days: number }) => {
      const row = { name: t.name.trim(), description: t.description?.trim() || null, default_due_days: t.default_due_days };
      if (t.id) {
        const { error } = await db.from("checklist_templates").update(row).eq("id", t.id).eq("company_id", companyId);
        if (error) throw error;
        return t.id;
      }
      const { data, error } = await db.from("checklist_templates").insert({ ...row, company_id: companyId, kind: t.kind }).select("id").single();
      if (error) throw error;
      await logPeopleActivity("checklist.template_created", `Created ${t.kind} template ${row.name}`, { template_id: data.id });
      return data.id as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplates();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (t: ChecklistTemplate) => {
      const { error } = await db.from("checklist_templates").delete().eq("id", t.id).eq("company_id", companyId);
      if (error) throw error;
      await logPeopleActivity("checklist.template_deleted", `Deleted template ${t.name}`, { template_id: t.id });
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveTemplateStep() {
  const invalidate = useInvalidateTemplates();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (s: { id?: string; template_id: string; title: string; description: string | null; auto_key: string | null; due_offset_days: number; position: number }) => {
      const row = {
        title: s.title.trim(),
        description: s.description?.trim() || null,
        auto_key: s.auto_key || null,
        due_offset_days: s.due_offset_days,
      };
      if (s.id) {
        const { error } = await db.from("checklist_template_steps").update(row).eq("id", s.id).eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await db.from("checklist_template_steps").insert({ ...row, company_id: companyId, template_id: s.template_id, position: s.position });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTemplateStep() {
  const invalidate = useInvalidateTemplates();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("checklist_template_steps").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Swap the positions of two steps (move up / down). */
export function useSwapTemplateSteps() {
  const invalidate = useInvalidateTemplates();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ a, b }: { a: ChecklistTemplateStep; b: ChecklistTemplateStep }) => {
      const pa = a.position === b.position ? b.position + 1 : b.position;
      const r1 = await db.from("checklist_template_steps").update({ position: pa }).eq("id", a.id).eq("company_id", companyId);
      if (r1.error) throw r1.error;
      const r2 = await db.from("checklist_template_steps").update({ position: a.position }).eq("id", b.id).eq("company_id", companyId);
      if (r2.error) throw r2.error;
    },
    onSuccess: () => invalidate(),
  });
}
