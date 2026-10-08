import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/supabase/client";
import { peopleKeys } from "./keys";
import { logPeopleActivity, usePeopleContext } from "./employees";
import type { Asset, AssetAssignment } from "./types";
import { assetStatusLabel, type AssetCategory, type AssetCondition, type AssetStatus } from "../lib/constants";

const ASSET_COLUMNS =
  "id,company_id,tag,name,category,brand,model,serial_number,specs,purchase_date,warranty_until,condition,status,location,notes,employee_id,assigned_on,created_at,updated_at";
const ASSIGNMENT_COLUMNS = "id,asset_id,employee_id,assigned_on,assigned_by,condition_out,note_out,returned_on,returned_by,condition_in,note_in,created_at";

export function useAssets() {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.assets(companyId),
    enabled: !!companyId && isHR,
    queryFn: async () => {
      const { data, error } = await db.from("assets").select(ASSET_COLUMNS).eq("company_id", companyId).order("tag").limit(10000);
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
}

export function useAsset(id: string | undefined) {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.asset(companyId, id),
    enabled: !!companyId && !!id && isHR,
    queryFn: async () => {
      const [asset, history] = await Promise.all([
        db.from("assets").select(ASSET_COLUMNS).eq("company_id", companyId).eq("id", id).maybeSingle(),
        db.from("asset_assignments").select(ASSIGNMENT_COLUMNS).eq("company_id", companyId).eq("asset_id", id).order("assigned_on", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (asset.error) throw asset.error;
      if (history.error) throw history.error;
      return asset.data ? { asset: asset.data as Asset, history: (history.data ?? []) as AssetAssignment[] } : null;
    },
  });
}

/** Current and past equipment of one employee. */
export function useEmployeeAssets(employeeId: string | undefined) {
  const { companyId, isHR } = usePeopleContext();
  return useQuery({
    queryKey: peopleKeys.employeeAssets(companyId, employeeId),
    enabled: !!companyId && !!employeeId && isHR,
    queryFn: async () => {
      const [current, history] = await Promise.all([
        db.from("assets").select(ASSET_COLUMNS).eq("company_id", companyId).eq("employee_id", employeeId).eq("status", "assigned"),
        db.from("asset_assignments").select(`${ASSIGNMENT_COLUMNS},asset:assets(id,tag,name,category)`).eq("company_id", companyId).eq("employee_id", employeeId).order("assigned_on", { ascending: false }),
      ]);
      if (current.error) throw current.error;
      if (history.error) throw history.error;
      type Row = AssetAssignment & { asset: Pick<Asset, "id" | "tag" | "name" | "category"> | null };
      return { current: (current.data ?? []) as unknown as Asset[], history: (history.data ?? []) as unknown as Row[] };
    },
  });
}

function useInvalidateAssets() {
  const qc = useQueryClient();
  const { companyId } = usePeopleContext();
  return () => {
    qc.invalidateQueries({ queryKey: peopleKeys.assets(companyId) });
    qc.invalidateQueries({ queryKey: ["people", companyId, "asset"] });
    qc.invalidateQueries({ queryKey: ["people", companyId, "employee-assets"] });
    qc.invalidateQueries({ queryKey: ["people", companyId, "activity"] });
    qc.invalidateQueries({ queryKey: peopleKeys.checklists(companyId) });
  };
}

export interface AssetInput {
  tag: string;
  name: string;
  category: AssetCategory;
  brand: string;
  model: string;
  serial_number: string;
  specs: string;
  purchase_date: string;
  warranty_until: string;
  condition: AssetCondition;
  location: string;
  notes: string;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

export function useSaveAsset() {
  const invalidate = useInvalidateAssets();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: AssetInput }) => {
      const row = {
        tag: blank(input.tag),
        name: input.name.trim(),
        category: input.category,
        brand: blank(input.brand),
        model: blank(input.model),
        serial_number: blank(input.serial_number),
        specs: blank(input.specs),
        purchase_date: blank(input.purchase_date),
        warranty_until: blank(input.warranty_until),
        condition: input.condition,
        location: blank(input.location),
        notes: blank(input.notes),
      };
      if (id) {
        const { error } = await db.from("assets").update(row).eq("id", id).eq("company_id", companyId);
        if (error) throw error;
        await logPeopleActivity("asset.updated", `Updated asset ${row.tag ?? row.name}`, { asset_id: id });
        return id;
      }
      const { data, error } = await db.from("assets").insert({ ...row, company_id: companyId }).select("id,tag").single();
      if (error) throw error;
      await logPeopleActivity("asset.created", `Added asset ${data.tag} (${row.name})`, { asset_id: data.id });
      return data.id as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSetAssetStatus() {
  const invalidate = useInvalidateAssets();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async ({ asset, status }: { asset: Asset; status: AssetStatus }) => {
      const { error } = await db.from("assets").update({ status }).eq("id", asset.id).eq("company_id", companyId);
      if (error) throw error;
      await logPeopleActivity("asset.status", `Marked ${asset.tag} as ${assetStatusLabel(status).toLowerCase()}`, { asset_id: asset.id, from: asset.status, to: status });
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteAsset() {
  const invalidate = useInvalidateAssets();
  const { companyId } = usePeopleContext();
  return useMutation({
    mutationFn: async (asset: Asset) => {
      const { error } = await db.from("assets").delete().eq("id", asset.id).eq("company_id", companyId);
      if (error) {
        if ((error as { code?: string }).code === "23503") {
          throw new Error("This asset has hand-over history, so it cannot be deleted. Mark it as retired instead.");
        }
        throw error;
      }
      await logPeopleActivity("asset.deleted", `Deleted asset ${asset.tag} (${asset.name})`, { tag: asset.tag });
    },
    onSuccess: () => invalidate(),
  });
}

export function useAssignAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: async (args: { assetId: string; employeeId: string; date: string; condition: string; note: string }) => {
      const { data, error } = await db.rpc("people_assign_asset", {
        p_asset: args.assetId,
        p_employee: args.employeeId,
        p_date: args.date,
        p_condition: args.condition || null,
        p_note: args.note || null,
      });
      if (error) throw error;
      return data as { assignment_id: string };
    },
    onSuccess: () => invalidate(),
  });
}

export function useReturnAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: async (args: { assetId: string; date: string; condition: string; note: string; nextStatus: AssetStatus }) => {
      const { data, error } = await db.rpc("people_return_asset", {
        p_asset: args.assetId,
        p_date: args.date,
        p_condition: args.condition || null,
        p_note: args.note || null,
        p_next_status: args.nextStatus,
      });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: () => invalidate(),
  });
}

export async function suggestAssetTag(category: AssetCategory): Promise<string | null> {
  const { data, error } = await db.rpc("people_next_asset_tag", { p_category: category });
  if (error) return null;
  return (data as string) ?? null;
}
