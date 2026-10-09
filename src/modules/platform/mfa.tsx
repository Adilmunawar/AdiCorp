import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { db, supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Skeleton } from "@/components/kit";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { platformKeys } from "./api";

export interface MfaStatus {
  currentLevel: string | null;
  nextLevel: string | null;
  /** Verified TOTP factors. */
  factors: { id: string; friendly_name: string | null; created_at: string }[];
  /** The owner requires two-step verification for every staff account. */
  companyRequires: boolean;
}

const mfaKey = (userId: string | undefined) => ["platform", "mfa", userId ?? "anon"] as const;

/** Assurance level, enrolled factors and the company policy for the signed-in staff member. */
export function useMfaStatus() {
  const { user, companyId } = useAuth();
  return useQuery({
    queryKey: mfaKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<MfaStatus> => {
      // All three at once: the company rule does not depend on the auth calls.
      // All local except the company rule: the factors come from the session's user (listFactors would
      // call /user, and that call holds the auth lock that every other request on the page waits for).
      const [aal, session, setting] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.getSession(),
        companyId
          ? db.from("company_settings").select("require_staff_mfa").eq("company_id", companyId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (aal.error) throw aal.error;
      if (session.error) throw session.error;
      const factors = { data: { totp: (session.data.session?.user.factors ?? []).filter((f) => f.factor_type === "totp") } };
      const companyRequires = !!(setting.data as { require_staff_mfa?: boolean } | null)?.require_staff_mfa;
      return {
        currentLevel: aal.data.currentLevel ?? null,
        nextLevel: aal.data.nextLevel ?? null,
        factors: (factors.data.totp ?? [])
          .filter((f) => f.status === "verified")
          .map((f) => ({ id: f.id, friendly_name: f.friendly_name ?? null, created_at: f.created_at })),
        companyRequires,
      };
    },
  });
}

export function useInvalidateMfa() {
  const qc = useQueryClient();
  const { user, companyId } = useAuth();
  return async () => {
    await qc.invalidateQueries({ queryKey: mfaKey(user?.id) });
    await qc.invalidateQueries({ queryKey: platformKeys.all(companyId) });
  };
}

/** Six-digit code input. */
export function OtpField({ value, onChange, disabled, onComplete }: { value: string; onChange: (v: string) => void; disabled?: boolean; onComplete?: (v: string) => void }) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      onComplete={onComplete}
      disabled={disabled}
      inputMode="numeric"
      autoFocus
      aria-label="Six-digit code from your authenticator app"
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: 6 }).map((_, i) => (
          <InputOTPSlot key={i} index={i} className="h-11 w-10 text-base font-bold sm:w-11" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-1 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <img src={ADICORP_LOGO_PATH} alt="AdiCorp" className="h-9 w-9 rounded-xl object-contain" />
          <div>
            <p className="micro-label text-primary">Security check</p>
            <p className="text-sm font-bold text-foreground">Two-step verification</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ask for the authenticator code to raise the session to aal2. */
export function MfaChallengeCard({ factorId, onVerified }: { factorId: string; onVerified: () => void }) {
  const { signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: value });
    setBusy(false);
    if (err) {
      setCode("");
      setError(/invalid|expired/i.test(err.message) ? "That code did not match. Wait for a new code and try again." : err.message);
      return;
    }
    toast.success("Verified", { description: "Welcome back." });
    onVerified();
  };

  return (
    <GateFrame>
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden />
        </div>
        <p className="text-sm font-bold">Enter the code from your authenticator app</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Your account is protected with two-step verification. Open Google Authenticator, 1Password or a similar app.
        </p>
        <form
          className="mt-5 flex w-full flex-col items-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <OtpField value={code} onChange={setCode} disabled={busy} onComplete={(v) => void verify(v)} />
          {error && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify
          </Button>
        </form>
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => void signOut()}>
          <LogOut /> Sign out
        </Button>
      </div>
    </GateFrame>
  );
}

/** Enrol a TOTP factor: QR code and secret, then confirm with a first code. */
export function TotpEnrollCard({ onDone, onCancel, required }: { onDone: () => void; onCancel?: () => void; required?: boolean }) {
  const [state, setState] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [name, setName] = useState("Authenticator app");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // Abandoned enrolments block a new one with the same name: clear them first.
      const listed = await supabase.auth.mfa.listFactors();
      for (const f of listed.data?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${name.trim() || "Authenticator app"} ${new Date().toISOString().slice(0, 10)}`,
      });
      if (err) throw err;
      setState({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start set-up.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    if (!state || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: value });
    setBusy(false);
    if (err) {
      setCode("");
      setError("That code did not match. Check the time on your phone and try the next code.");
      return;
    }
    toast.success("Two-step verification is on", { description: "You'll be asked for a code when you sign in." });
    onDone();
  };

  const cancel = async () => {
    if (state) await supabase.auth.mfa.unenroll({ factorId: state.factorId });
    setState(null);
    onCancel?.();
  };

  if (!state) {
    return (
      <div className="space-y-4">
        {required && (
          <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
            Your company requires two-step verification for every staff account. Set it up to continue.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="mfa-name" className="micro-label">
            Device name
          </Label>
          <Input id="mfa-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-9 rounded-xl text-sm" />
        </div>
        {error && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Set up authenticator
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Scan the QR code with your authenticator app.</li>
        <li>Or type the setup key by hand.</li>
        <li>Enter the six-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <img src={state.qr} alt="QR code for your authenticator app" className="h-40 w-40 shrink-0 rounded-xl border border-border bg-white p-2" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="micro-label">Setup key</p>
          <code className="block break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-[11px]">{state.secret}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(state.secret).then(() => toast.success("Setup key copied"));
            }}
          >
            Copy key
          </Button>
        </div>
      </div>
      <form
        className="flex flex-col items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <OtpField value={code} onChange={setCode} disabled={busy} onComplete={(v) => void confirm(v)} />
        {error && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {error}
          </p>
        )}
        <div className="flex w-full flex-wrap justify-center gap-2">
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Turn on
          </Button>
          <Button type="button" variant="outline" onClick={() => void cancel()} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Holds staff pages until the session satisfies the two-step verification policy:
 * - an enrolled factor at aal1 must be verified (aal2);
 * - when the owner requires it, a staff member without a factor must enrol first.
 * The database applies the same rule to every platform RPC (public.auth_mfa_ok()).
 */
export function MfaGate({ children }: { children: ReactNode }) {
  const status = useMfaStatus();
  const invalidate = useInvalidateMfa();
  const { refreshProfile } = useAuth();
  const [verifiedAt, setVerifiedAt] = useState(0);

  useEffect(() => {
    if (!verifiedAt) return;
    void refreshProfile();
  }, [verifiedAt, refreshProfile]);

  if (status.isPending) {
    // The page mounts hidden underneath, so its own data loads while this check runs; nothing shows until it passes.
    return (
      <>
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
        <div hidden>{children}</div>
      </>
    );
  }
  // If the status cannot be read (offline, old auth server), fall through: the database still enforces it.
  const s = status.data;
  if (!s) return <>{children}</>;

  const done = async () => {
    await supabase.auth.refreshSession();
    await invalidate();
    setVerifiedAt(Date.now());
  };

  if (s.nextLevel === "aal2" && s.currentLevel !== "aal2" && s.factors[0]) {
    return <MfaChallengeCard factorId={s.factors[0].id} onVerified={() => void done()} />;
  }
  if (s.companyRequires && s.factors.length === 0) {
    return (
      <GateFrame>
        <TotpEnrollCard required onDone={() => void done()} />
      </GateFrame>
    );
  }
  return <>{children}</>;
}
