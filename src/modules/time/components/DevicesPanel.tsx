import { useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Pencil, Plus, Radio, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ListSkeleton, RowActions, SectionCard, StatusBadge, formatDateTime, formatRelative } from "@/components/kit";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useDeleteDevice, useDevices, useRotateDeviceKey, useSaveDevice, type DeviceInput } from "../api";
import { deviceHealth } from "../lib";
import { LiveDot, useNow } from "./shared";

const EMPTY: DeviceInput = { name: "", serial: "", location: "", direction: "both", is_active: true };

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Copy failed", { description: "Select the text and copy it by hand." });
  }
}

export function DevicesPanel() {
  const { data: devices = [], isLoading } = useDevices({ live: true });
  const save = useSaveDevice();
  const rotate = useRotateDeviceKey();
  const remove = useDeleteDevice();
  const [editing, setEditing] = useState<DeviceInput | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null);
  const now = useNow(15_000);

  const onSave = async (input: DeviceInput) => {
    const res = await save.mutateAsync(input);
    setEditing(null);
    if (res.key) setRevealed({ name: input.name, key: res.key });
  };

  return (
    <>
      <SectionCard
        title="Time clocks"
        description="Each terminal or bridge has its own secret key. Remove a device or issue a new key and the old key stops working at once."
        icon={Server}
        actions={
          <Button size="sm" className="rounded-xl" onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="h-4 w-4" /> Add time clock
          </Button>
        }
      >
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : devices.length === 0 ? (
          <EmptyState
            compact
            icon={Radio}
            title="No time clocks yet"
            description="Add your fingerprint or face terminal (or the bridge program that reads it). You will get a key to paste into the bridge."
            action={
              <Button size="sm" className="rounded-xl" onClick={() => setEditing({ ...EMPTY })}>
                <Plus className="h-4 w-4" /> Add time clock
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {devices.map((d) => {
              const health = deviceHealth(d, now);
              const meta = [d.location, d.serial && `SN ${d.serial}`, d.direction === "both" ? "In and out" : d.direction === "in" ? "Entry only" : "Exit only"].filter(Boolean).join(" · ");
              return (
              <li key={d.id} className={cn("rounded-2xl border p-3.5", health.tone === "danger" ? "border-danger/25" : "border-border")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <LiveDot tone={health.tone} pulse={health.key === "online"} label={health.label} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={d.name}>
                        {d.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground" title={meta}>
                        {meta}
                      </p>
                    </div>
                  </div>
                  <RowActions
                    label={`Actions for ${d.name}`}
                    actions={[
                      { label: "Edit", icon: Pencil, onSelect: () => setEditing({ id: d.id, name: d.name, serial: d.serial ?? "", location: d.location ?? "", direction: d.direction, is_active: d.is_active }) },
                      {
                        label: "Issue a new key",
                        icon: KeyRound,
                        confirm: { title: `New key for ${d.name}?`, description: "The current key stops working immediately. Paste the new key into the bridge to reconnect.", confirmLabel: "Issue new key" },
                        onSelect: async () => {
                          const key = await rotate.mutateAsync(d.id);
                          setRevealed({ name: d.name, key });
                        },
                      },
                      {
                        label: "Remove",
                        icon: Trash2,
                        destructive: true,
                        separated: true,
                        confirm: { title: `Remove ${d.name}?`, description: "Its key stops working. Punches it already sent are kept.", confirmLabel: "Remove" },
                        onSelect: () => remove.mutateAsync(d.id),
                      },
                    ]}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-[11px]">
                  <div className="min-w-0">
                    <dt className="micro-label">Status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={health.key} label={health.label} tone={health.tone} />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="micro-label">Last heard</dt>
                    <dd className="mt-1 truncate font-semibold" title={d.last_seen_at ? formatDateTime(d.last_seen_at) : undefined}>
                      {d.last_seen_at ? formatRelative(d.last_seen_at) : "Never"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="micro-label">Key</dt>
                    <dd className="mt-1 truncate font-mono font-semibold">{d.key_prefix}…</dd>
                  </div>
                </dl>
                {(d.firmware || d.last_ip) && (
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">{[d.firmware && `Firmware ${d.firmware}`, d.last_ip && `IP ${d.last_ip}`].filter(Boolean).join(" · ")}</p>
                )}
                {d.last_error && <p className="mt-2 rounded-lg bg-danger-soft px-2 py-1.5 text-[11px] leading-4 text-danger">Last error: {d.last_error}</p>}
              </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <IntegrationCard />

      <DeviceDialog value={editing} onChange={setEditing} onSave={onSave} saving={save.isPending} />

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Key for {revealed?.name}</DialogTitle>
            <DialogDescription>Copy it now and paste it into the bridge. For your security it is shown only once; issue a new key if it is lost.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{revealed?.key}</code>
            <Button size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => revealed && copy(revealed.key, "Key")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button className="rounded-xl" onClick={() => setRevealed(null)}>
              I have saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeviceDialog({ value, onChange, onSave, saving }: { value: DeviceInput | null; onChange: (v: DeviceInput | null) => void; onSave: (v: DeviceInput) => Promise<void>; saving: boolean }) {
  const [local, setLocal] = useState<DeviceInput>(EMPTY);
  useEffect(() => {
    if (value) setLocal(value);
  }, [value]);
  const set = (patch: Partial<DeviceInput>) => setLocal((v) => ({ ...v, ...patch }));
  const valid = local.name.trim().length >= 2;

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            void onSave(local).catch(() => undefined);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{local.id ? "Edit time clock" : "Add a time clock"}</DialogTitle>
            <DialogDescription>Name it after where it hangs, so punches are easy to read.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dev-name">Name</Label>
            <Input id="dev-name" value={local.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Main entrance" required className="rounded-xl" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dev-serial">Serial number</Label>
              <Input id="dev-serial" value={local.serial ?? ""} onChange={(e) => set({ serial: e.target.value })} maxLength={64} placeholder="Optional" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-location">Location</Label>
              <Input id="dev-location" value={local.location ?? ""} onChange={(e) => set({ location: e.target.value })} maxLength={120} placeholder="Optional" className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Punches mean</Label>
            <Select value={local.direction} onValueChange={(v) => set({ direction: v as DeviceInput["direction"] })}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">In or out (from the punch state)</SelectItem>
                <SelectItem value="in">Always in (entry terminal)</SelectItem>
                <SelectItem value="out">Always out (exit terminal)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-semibold">Accept punches</span>
              <span className="block text-[11px] text-muted-foreground">Turn off to pause a device without removing it.</span>
            </span>
            <Switch checked={local.is_active} onCheckedChange={(c) => set({ is_active: c })} />
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onChange(null)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={!valid || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {local.id ? "Save" : "Add and show key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard() {
  const endpoint = `${SUPABASE_URL}/rest/v1/rpc/time_ingest_punches`;
  const example = `POST ${endpoint}
apikey: ${SUPABASE_PUBLISHABLE_KEY.slice(0, 12)}…   (your public API key)
Content-Type: application/json

{
  "p_device_key": "adk_…",
  "p_punches": [
    { "user_id": "17", "ts": "2026-10-07 09:02:11", "state": 0, "verify": "finger" },
    { "user_id": "17", "ts": "2026-10-07T18:05:40+05:00", "state": 1, "source": "sync" }
  ],
  "p_device": { "firmware": "Ver 6.60" }
}`;
  return (
    <SectionCard title="Connect a bridge" description="Any ZKTeco, ZKBioTime or similar reader can post punches with its key." icon={KeyRound}>
      <div className="space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Add the time clock above and copy its key.</li>
          <li>Point the bridge at the endpoint below with your public API key, and send punches every few seconds. An empty list works as a heartbeat.</li>
          <li>Times without an offset are read in the company timezone. Resends are ignored, so the bridge can safely retry.</li>
          <li>Link terminal IDs to people below. IDs that equal an employee code or CNIC are linked automatically.</li>
        </ol>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">{endpoint}</code>
          <Button size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => copy(endpoint, "Endpoint")}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground">{example}</pre>
      </div>
    </SectionCard>
  );
}
