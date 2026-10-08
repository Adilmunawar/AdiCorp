import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/components/kit";
import { suggestAssetTag, useAssets, useAssignAsset, useReturnAsset, useSaveAsset, type AssetInput } from "../api/assets";
import { useCompanyToday } from "../api/employees";
import type { Asset } from "../api/types";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_STATUSES, assetCategoryLabel, type AssetCategory, type AssetCondition, type AssetStatus } from "../lib/constants";
import { errorMessage } from "../lib/utils";
import { Field } from "./common";
import { EmployeePicker } from "./pickers";

const EMPTY: AssetInput = {
  tag: "",
  name: "",
  category: "laptop",
  brand: "",
  model: "",
  serial_number: "",
  specs: "",
  purchase_date: "",
  warranty_until: "",
  condition: "good",
  location: "",
  notes: "",
};

function fromAsset(a: Asset): AssetInput {
  return {
    tag: a.tag,
    name: a.name,
    category: a.category,
    brand: a.brand ?? "",
    model: a.model ?? "",
    serial_number: a.serial_number ?? "",
    specs: a.specs ?? "",
    purchase_date: a.purchase_date ?? "",
    warranty_until: a.warranty_until ?? "",
    condition: a.condition,
    location: a.location ?? "",
    notes: a.notes ?? "",
  };
}

function ConditionSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: AssetCondition) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssetCondition)}>
      <SelectTrigger id={id} className="h-10 rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSET_CONDITIONS.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Add or edit an asset. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
  onSaved?: (id: string) => void;
}) {
  const save = useSaveAsset();
  const { data: assets = [] } = useAssets();
  const [v, setV] = useState<AssetInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof AssetInput, string>>>({});

  useEffect(() => {
    if (open) {
      setV(asset ? fromAsset(asset) : EMPTY);
      setErrors({});
    }
  }, [open, asset]);

  const set = <K extends keyof AssetInput>(k: K, value: AssetInput[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const serialClash = useMemo(() => {
    const s = v.serial_number.trim().toLowerCase();
    if (!s) return null;
    return assets.find((a) => a.id !== asset?.id && a.serial_number?.toLowerCase() === s) ?? null;
  }, [v.serial_number, assets, asset]);

  const submit = async () => {
    const e: typeof errors = {};
    if (v.name.trim().length < 2) e.name = "Enter a name, e.g. MacBook Pro 14.";
    if (v.tag && !/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/.test(v.tag.trim())) e.tag = "Letters, digits and dashes.";
    if (v.tag && assets.some((a) => a.id !== asset?.id && a.tag.toLowerCase() === v.tag.trim().toLowerCase())) e.tag = "Another asset already has this tag.";
    if (v.purchase_date && v.warranty_until && v.warranty_until < v.purchase_date) e.warranty_until = "Cannot end before the purchase date.";
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const id = await save.mutateAsync({ id: asset?.id ?? null, input: { ...v, tag: v.tag.trim().toUpperCase() } });
      toast.success(asset ? "Asset updated" : "Asset added");
      onOpenChange(false);
      onSaved?.(id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the asset."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.tag}` : "Add an asset"}</DialogTitle>
          <DialogDescription>Tags are numbered automatically per category when left blank.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="asset-name" label="Name" required error={errors.name} className="sm:col-span-2">
            <Input id="asset-name" value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} className="h-10 rounded-xl" placeholder="e.g. Dell Latitude 5440" />
          </Field>
          <Field id="asset-category" label="Category">
            <Select value={v.category} onValueChange={(c) => set("category", c as AssetCategory)}>
              <SelectTrigger id="asset-category" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="asset-tag" label="Tag" error={errors.tag} hint={asset ? undefined : "Blank = next free tag"}>
            <div className="flex gap-2">
              <Input id="asset-tag" value={v.tag} maxLength={30} onChange={(e) => set("tag", e.target.value)} className="h-10 rounded-xl uppercase" placeholder="Automatic" />
              {!asset && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label="Suggest the next tag"
                  onClick={async () => {
                    const tag = await suggestAssetTag(v.category);
                    if (tag) set("tag", tag);
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Field>
          <Field id="asset-brand" label="Brand">
            <Input id="asset-brand" value={v.brand} maxLength={80} onChange={(e) => set("brand", e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="asset-model" label="Model">
            <Input id="asset-model" value={v.model} maxLength={80} onChange={(e) => set("model", e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="asset-serial" label="Serial number" hint={serialClash ? `Same serial as ${serialClash.tag}. Check before saving.` : undefined}>
            <Input id="asset-serial" value={v.serial_number} maxLength={80} onChange={(e) => set("serial_number", e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="asset-condition" label="Condition">
            <ConditionSelect id="asset-condition" value={v.condition} onChange={(c) => set("condition", c)} />
          </Field>
          <Field id="asset-purchase" label="Purchase date">
            <Input id="asset-purchase" type="date" value={v.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="asset-warranty" label="Warranty until" error={errors.warranty_until}>
            <Input id="asset-warranty" type="date" value={v.warranty_until} onChange={(e) => set("warranty_until", e.target.value)} className="h-10 rounded-xl" />
          </Field>
          <Field id="asset-location" label="Location" className="sm:col-span-2">
            <Input id="asset-location" value={v.location} maxLength={120} onChange={(e) => set("location", e.target.value)} className="h-10 rounded-xl" placeholder="e.g. Lahore office, IT store" />
          </Field>
          <Field id="asset-specs" label="Specs" className="sm:col-span-2">
            <Textarea id="asset-specs" value={v.specs} maxLength={500} rows={2} onChange={(e) => set("specs", e.target.value)} className="rounded-xl" placeholder="CPU, RAM, storage…" />
          </Field>
          <Field id="asset-notes" label="Notes" className="sm:col-span-2">
            <Textarea id="asset-notes" value={v.notes} maxLength={2000} rows={2} onChange={(e) => set("notes", e.target.value)} className="rounded-xl" />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {asset ? "Save" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hand an available asset to an active employee. Pass `asset` or `employeeId` to preselect one side. */
export function AssignAssetDialog({
  open,
  onOpenChange,
  asset,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
  employeeId?: string;
}) {
  const assign = useAssignAsset();
  const { data: assets = [] } = useAssets();
  const today = useCompanyToday();
  const [assetId, setAssetId] = useState("");
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState(today);
  const [condition, setCondition] = useState<AssetCondition>("good");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const available = assets.filter((a) => a.status === "available");

  useEffect(() => {
    if (open) {
      setAssetId(asset?.id ?? "");
      setEmp(employeeId ?? "");
      setDate(today);
      setCondition(asset?.condition ?? "good");
      setNote("");
      setError(null);
    }
  }, [open, asset, employeeId, today]);

  const chosen = asset ?? assets.find((a) => a.id === assetId) ?? null;

  const submit = async () => {
    if (!chosen) return setError("Choose an asset.");
    if (!emp) return setError("Choose who receives it.");
    if (!date || date > today) return setError("The hand-over date cannot be in the future.");
    try {
      await assign.mutateAsync({ assetId: chosen.id, employeeId: emp, date, condition, note });
      toast.success(`${chosen.name} handed over`, { description: "The employee has been notified." });
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Could not hand over the asset."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !assign.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? `Hand over ${asset.tag}` : "Hand over equipment"}</DialogTitle>
          <DialogDescription>The employee gets a notification and sees it under My equipment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!asset && (
            <Field id="assign-asset" label="Asset" required>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id="assign-asset" className="h-10 rounded-xl">
                  <SelectValue placeholder={available.length ? "Choose an available asset" : "No assets are available"} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.tag} · {a.name} ({assetCategoryLabel(a.category)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {!employeeId && (
            <Field id="assign-employee" label="Employee" required>
              <EmployeePicker id="assign-employee" value={emp} onChange={setEmp} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field id="assign-date" label="Date" required>
              <Input id="assign-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl" />
            </Field>
            <Field id="assign-condition" label="Condition out">
              <ConditionSelect id="assign-condition" value={condition} onChange={setCondition} />
            </Field>
          </div>
          <Field id="assign-note" label="Note">
            <Textarea id="assign-note" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-xl" placeholder="Charger, bag, accessories…" />
          </Field>
          {error && (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={assign.isPending}>
            {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Hand over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Record the return of an assigned asset and choose what happens to it next. */
export function ReturnAssetDialog({
  open,
  onOpenChange,
  asset,
  holderName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  holderName?: string;
}) {
  const ret = useReturnAsset();
  const today = useCompanyToday();
  const [date, setDate] = useState(today);
  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [next, setNext] = useState<AssetStatus>("available");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(today);
      setCondition(asset.condition);
      setNext("available");
      setNote("");
      setError(null);
    }
  }, [open, asset, today]);

  const submit = async () => {
    if (!date || date > today) return setError("The return date cannot be in the future.");
    if (asset.assigned_on && date < asset.assigned_on) return setError(`The return date cannot be before the hand-over (${formatDate(asset.assigned_on)}).`);
    try {
      await ret.mutateAsync({ assetId: asset.id, date, condition, note, nextStatus: next });
      toast.success(`${asset.name} returned`);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Could not record the return."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !ret.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return {asset.tag}</DialogTitle>
          <DialogDescription>
            {holderName ? `From ${holderName}` : "From its holder"}
            {asset.assigned_on ? `, handed over ${formatDate(asset.assigned_on)}.` : "."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id="return-date" label="Date" required>
              <Input id="return-date" type="date" min={asset.assigned_on ?? undefined} max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl" />
            </Field>
            <Field id="return-condition" label="Condition in">
              <ConditionSelect id="return-condition" value={condition} onChange={setCondition} />
            </Field>
          </div>
          <Field id="return-next" label="Then">
            <Select value={next} onValueChange={(s) => setNext(s as AssetStatus)}>
              <SelectTrigger id="return-next" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_STATUSES.filter((s) => s.value !== "assigned").map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="return-note" label="Note">
            <Textarea id="return-note" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className="rounded-xl" placeholder="Scratches, missing charger…" />
          </Field>
          {error && (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ret.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={ret.isPending}>
            {ret.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Record return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
