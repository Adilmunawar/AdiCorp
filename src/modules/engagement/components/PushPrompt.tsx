import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { cn } from "@/lib/utils";
import {
  detectPush,
  enablePush,
  isAndroid,
  isEdge,
  isIos,
  pushApi,
  putOffReminder,
  remindLaterUntil,
  type PushAudience,
  type PushPhase,
} from "../lib/push";

/* --------------------------------------------------------------- steps */

/** How to allow notifications again after "Block", for the browser in hand. */
export function UnblockSteps({ className }: { className?: string }) {
  const steps = isAndroid()
    ? [
        <>Tap the <strong>icon left of the address</strong> (a lock or two sliders) at the top of Chrome.</>,
        <>Tap <strong>Permissions</strong>, then <strong>Notifications</strong>, and choose <strong>Allow</strong>.</>,
        <>Come back here and tap <strong>Check again</strong>.</>,
      ]
    : [
        <>Click the <strong>icon left of the address bar</strong> (a lock or two sliders).</>,
        <>Set <strong>Notifications</strong> to <strong>Allow</strong>. If it is not listed, open <strong>Site settings</strong> and change it there.</>,
        <>Come back here and click <strong>Check again</strong>.</>,
      ];
  return (
    <ol className={cn("grid gap-2 text-xs leading-5 text-foreground/80", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="tabular grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** When the browser has not shown its question after a few seconds: it probably asked quietly. */
export function QuietAskSteps({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-left", className)} role="status">
      <p className="text-xs font-bold text-foreground">No question popped up?</p>
      <ol className="mt-1.5 grid gap-1.5 text-[11.5px] leading-5 text-foreground/80">
        <li className="flex gap-2">
          <span className="tabular grid h-4 w-4 shrink-0 place-items-center rounded-full bg-warning/20 text-[9px] font-bold text-warning">1</span>
          <span>
            {isEdge() ? (
              <>Edge asked quietly: click the <strong>bell icon at the right end of the address bar</strong>.</>
            ) : (
              <>The browser asked quietly: click the <strong>bell icon in the address bar</strong> (it may have a line through it, or say “Notifications blocked”).</>
            )}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="tabular grid h-4 w-4 shrink-0 place-items-center rounded-full bg-warning/20 text-[9px] font-bold text-warning">2</span>
          <span>Choose <strong>Allow</strong>. This carries on by itself.</span>
        </li>
      </ol>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        No bell either? Click the <strong>lock icon left of the address</strong>, set Notifications to Allow, and this notices it.
      </p>
    </div>
  );
}

/** For a browser that cannot show notifications at all. */
export function PhoneSteps() {
  return isIos() ? (
    <>
      On an iPhone, notifications work once AdiCorp is on your home screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, open it from
      there and turn them on.
    </>
  ) : (
    <>
      This browser cannot show notifications. Open AdiCorp in <strong>Chrome</strong> on Android, or <strong>Chrome</strong> or <strong>Edge</strong> on a computer,
      and turn them on there.
    </>
  );
}

/* --------------------------------------------------------------- state */

export function pushDevicesKey(audience: PushAudience, owner: string | undefined) {
  return ["engagement", "push", audience, owner ?? "anon", "devices"] as const;
}

/** Devices with notifications on for the signed-in person, and this browser's phase. */
export function usePushState(audience: PushAudience) {
  const { user } = useAuth();
  const { employee } = useEmployeeAuth();
  const owner = audience === "portal" ? employee?.id : user?.id;
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: pushDevicesKey(audience, owner),
    enabled: !!owner,
    staleTime: 5 * 60_000,
    queryFn: () => pushApi.devices(audience),
  });
  const [phase, setPhase] = useState<PushPhase>("checking");
  const checked = useRef(false);

  useEffect(() => {
    if (!owner || !devices.data || checked.current) return;
    checked.current = true;
    let live = true;
    void detectPush(
      audience,
      devices.data.map((d) => d.endpoint_hash),
    ).then((p) => {
      if (!live) return;
      setPhase(p);
      if (p === "on") void qc.invalidateQueries({ queryKey: pushDevicesKey(audience, owner) });
    });
    return () => {
      live = false;
    };
  }, [audience, owner, devices.data, qc]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: pushDevicesKey(audience, owner) }), [qc, audience, owner]);
  return {
    phase,
    setPhase,
    devices: devices.data ?? [],
    loading: devices.isPending && !!owner,
    /** The device list could not be read (e.g. the server is missing the push update). */
    failed: devices.isError,
    error: devices.error,
    refresh,
    ready: !!owner,
  };
}

/* -------------------------------------------------------------- banner */

interface PushPromptProps {
  audience: PushAudience;
  /** Where people manage their devices. */
  settingsHref?: string;
  className?: string;
}

/**
 * The quiet reminder to turn on notifications on this device. It appears only for someone
 * with notifications on no device, can be put off for 7 days, guides through a quiet
 * permission request (Edge / Chrome address-bar bell), blocked browsers and iPhones.
 */
export function PushPrompt({ audience, settingsHref, className }: PushPromptProps) {
  const { phase, setPhase, devices, loading, refresh, ready } = usePushState(audience);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [later, setLater] = useState(() => remindLaterUntil(audience) > Date.now());
  const slowTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError("");
    setSlow(false);
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    slowTimer.current = window.setTimeout(() => setSlow(true), 3000);
    const r = await enablePush(audience, true);
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    setSlow(false);
    setBusy(false);
    setPhase(r.phase);
    if (r.error) setError(r.error);
    if (r.phase === "on") {
      setDone(true);
      void refresh();
    }
  }, [audience, refresh, setPhase]);

  if (done) {
    return (
      <div className={cn("mb-4 flex items-start gap-3 rounded-2xl border border-success/25 bg-success/[0.06] px-3.5 py-3 text-xs leading-5", className)} role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span className="min-w-0 flex-1">
          <strong>Notifications are on for this device.</strong> You should get a first one from AdiCorp in a moment. If nothing arrives, check that battery saver is not
          stopping your browser.
        </span>
        <button type="button" onClick={() => setDone(false)} aria-label="Close" className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!ready || loading || phase === "checking" || phase === "on" || devices.length > 0 || later) return null;

  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2.5 rounded-2xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-xs leading-5 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {phase === "unsupported" ? <Smartphone className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1 text-foreground/85">
        {phase === "unsupported" ? (
          <PhoneSteps />
        ) : phase === "denied" ? (
          <>
            <strong className="text-foreground">Notifications from AdiCorp are blocked in this browser.</strong>
            <UnblockSteps className="mt-2" />
          </>
        ) : (
          <>
            <strong className="text-foreground">Get AdiCorp notifications on this device:</strong> approvals, messages and announcements, even when AdiCorp is closed.
          </>
        )}
        {error && <span className="mt-1 block font-semibold text-destructive">{error}</span>}
        {slow && phase === "off" && <QuietAskSteps className="mt-2" />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {phase === "off" && (
          <Button size="sm" className="h-8 rounded-xl px-3 text-xs" disabled={busy} onClick={enable}>
            {busy ? "Waiting for your answer…" : "Turn on"}
          </Button>
        )}
        {phase === "denied" && (
          <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" disabled={busy} onClick={enable}>
            {busy ? "Checking…" : "Check again"}
          </Button>
        )}
        {settingsHref && phase !== "off" && (
          <Button asChild size="sm" variant="ghost" className="h-8 rounded-xl px-2.5 text-xs">
            <Link to={settingsHref}>Settings</Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-xl px-2.5 text-xs text-muted-foreground"
          onClick={() => {
            putOffReminder(audience);
            setLater(true);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
