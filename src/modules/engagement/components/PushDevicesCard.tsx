import { useEffect, useState } from "react";
import { BellOff, BellRing, Laptop, Loader2, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton, SectionCard, Skeleton, formatRelative } from "@/components/kit";
import { loadErrorHint } from "../lib/api";
import { cn } from "@/lib/utils";
import { currentEndpoint, disablePush, enablePush, endpointHash, pushApi, type PushAudience } from "../lib/push";
import { PhoneSteps, QuietAskSteps, UnblockSteps, usePushState } from "./PushPrompt";

/** "Notifications on your devices": this browser's state, the device list, test and remove. */
export function PushDevicesCard({ audience, className }: { audience: PushAudience; className?: string }) {
  const { phase, setPhase, devices, loading, failed, error, refresh } = usePushState(audience);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);
  const [slow, setSlow] = useState(false);
  const [hereHash, setHereHash] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void currentEndpoint().then(async (endpoint) => {
      const hash = endpoint ? await endpointHash(endpoint) : null;
      if (live) setHereHash(hash);
    });
    return () => {
      live = false;
    };
  }, [phase, devices.length]);

  const turnOn = async () => {
    setBusy("enable");
    const timer = window.setTimeout(() => setSlow(true), 3000);
    const r = await enablePush(audience, true);
    window.clearTimeout(timer);
    setSlow(false);
    setBusy(null);
    setPhase(r.phase);
    if (r.error) toast.error(r.error);
    else if (r.phase === "on") toast.success("Notifications are on for this device.");
    else if (r.phase === "denied") toast.error("The browser blocked notifications. Follow the steps to allow them.");
    void refresh();
  };

  const turnOff = async () => {
    setBusy("disable");
    try {
      await disablePush(audience);
      setPhase("off");
      toast.success("Notifications are off on this device.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Could not turn notifications off. Try again.");
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      await pushApi.test(audience);
      toast.success("Test sent. It should arrive in a few seconds.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send a test.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await pushApi.removeDevice(audience, id);
      toast.success("Device removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the device.");
      throw e;
    } finally {
      void refresh();
    }
  };

  const on = phase === "on";

  if (failed) {
    return (
      <SectionCard title="Device notifications" icon={BellRing} className={className}>
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs leading-5 text-foreground/85" role="status">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <strong>Not available right now.</strong> {loadErrorHint(error)}
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Device notifications"
      description="Get approvals, messages and announcements as phone and desktop notifications, even when AdiCorp is closed."
      icon={BellRing}
      className={className}
      actions={
        on ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-xl text-xs" disabled={!!busy} onClick={test}>
              {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send a test
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-xl text-xs" disabled={!!busy} onClick={turnOff}>
              <BellOff className="h-3.5 w-3.5" />
              Turn off here
            </Button>
          </div>
        ) : phase === "off" || phase === "denied" ? (
          <Button size="sm" className="h-8 gap-1.5 rounded-xl text-xs" disabled={!!busy} onClick={turnOn}>
            {busy === "enable" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
            {phase === "denied" ? "Check again" : "Turn on for this device"}
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-5",
            on ? "border-success/25 bg-success/[0.06]" : phase === "denied" ? "border-destructive/20 bg-destructive/[0.04]" : "border-border bg-muted/30",
          )}
        >
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", on ? "bg-success" : phase === "denied" ? "bg-destructive" : "bg-muted-foreground/50")} aria-hidden />
          <div className="min-w-0 flex-1 text-foreground/85">
            {phase === "checking" && <span className="text-muted-foreground">Checking this browser…</span>}
            {on && <><strong>On for this browser.</strong> Notifications reach you here.</>}
            {phase === "off" && <><strong>Off for this browser.</strong> Turn them on to be told the moment something needs you.</>}
            {phase === "denied" && (
              <>
                <strong>Blocked in this browser.</strong> It will not ask again until you allow notifications:
                <UnblockSteps className="mt-2" />
              </>
            )}
            {phase === "unsupported" && <PhoneSteps />}
          </div>
        </div>
        {slow && <QuietAskSteps />}

        <div>
          <p className="micro-label mb-2">{loading ? "Devices" : `Devices (${devices.length})`}</p>
          {loading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading devices">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No device gets notifications yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
              {devices.map((d) => {
                const phone = /Android|iPhone/.test(d.device);
                const here = hereHash === d.endpoint_hash;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {phone ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        {d.device}
                        {here && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary">This device</span>}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {d.last_ok_at ? `Last delivered ${formatRelative(d.last_ok_at)}` : `Added ${formatRelative(d.created_at)}`}
                        {d.failures > 0 && d.last_error ? ` · ${d.failures} failed (${d.last_error})` : ""}
                      </p>
                    </div>
                    <ConfirmButton
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${d.device}`}
                      title="Remove device"
                      description="It stops getting AdiCorp notifications. You can turn them on again from that device."
                      confirmLabel="Remove"
                      onConfirm={() => remove(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ConfirmButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
