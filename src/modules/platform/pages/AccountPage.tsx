import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, ImagePlus, KeyRound, Loader2, LogOut, Monitor, MonitorSmartphone, RotateCcw, Save, ShieldCheck, Smartphone, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { roleLabel, useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton, PageHeader, SectionCard, Skeleton, StatusBadge, TabsNav, formatDate, formatDateTime, formatRelative, initials, useTabParam } from "@/components/kit";
import { cn } from "@/lib/utils";
import { CONTROL, Field, SettingRow, SettingsList } from "../components/form";
import { MfaGate, OtpField, TotpEnrollCard, useInvalidateMfa, useMfaStatus } from "../mfa";
import { rpc } from "../api";

const TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "security", label: "Password & sign-in", icon: ShieldCheck },
];

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Best effort: the action itself already succeeded. */
function logActivity(action: string, description: string) {
  void rpc("log_activity", { p_action: action, p_description: description, p_details: {} }).catch(() => undefined);
}

function staffPasswordError(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 72) return "Use at most 72 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Mix letters and digits.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function ProfileTab() {
  const { profile, user, company, companyId, role, refreshProfile } = useAuth();
  const [first, setFirst] = useState(profile?.first_name ?? "");
  const [last, setLast] = useState(profile?.last_name ?? "");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirst(profile?.first_name ?? "");
    setLast(profile?.last_name ?? "");
  }, [profile?.first_name, profile?.last_name]);

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user?.email || "You";
  const dirty = first.trim() !== (profile?.first_name ?? "") || last.trim() !== (profile?.last_name ?? "");
  const firstError = !first.trim() ? "Enter your first name." : null;

  const reset = () => {
    setFirst(profile?.first_name ?? "");
    setLast(profile?.last_name ?? "");
    setTouched(false);
  };

  const save = async () => {
    if (!user) return;
    setTouched(true);
    if (firstError) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ first_name: first.trim().slice(0, 60), last_name: last.trim().slice(0, 60) || null }).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Could not save", { description: error.message });
      return;
    }
    logActivity("account.display_name", "Updated their name");
    await refreshProfile();
    setTouched(false);
    toast.success("Profile saved");
  };

  const setAvatar = async (url: string | null) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (error) throw error;
    logActivity(url ? "account.avatar" : "account.avatar_removed", url ? "Changed their photo" : "Removed their photo");
    await refreshProfile();
  };

  const upload = async (file: File) => {
    if (!user || !companyId) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("The photo must be 2 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${companyId}/staff/${user.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (error) throw error;
      await setAvatar(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      toast.success("Photo updated");
    } catch (e) {
      toast.error("Could not upload the photo", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <SectionCard className="lg:self-start">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 text-xl font-bold text-primary ring-4 ring-primary/[0.06]">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}
          </span>
          <p className="mt-3 max-w-full truncate font-display text-base font-semibold text-foreground" title={name}>
            {name}
          </p>
          <div className="mt-1.5">
            <StatusBadge status={role ?? "none"} label={roleLabel(role)} tone="primary" dot={false} />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="sr-only"
              id="avatar-file"
              aria-label="Choose a photo"
              tabIndex={-1}
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
            <Button variant="outline" size="sm" className="h-10 sm:h-9" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} {profile?.avatar_url ? "Change photo" : "Add photo"}
            </Button>
            {profile?.avatar_url && (
              <ConfirmButton
                variant="ghost"
                size="sm"
                className="h-10 sm:h-9"
                title="Remove your photo?"
                description="Your initials are shown instead."
                confirmLabel="Remove"
                onConfirm={() =>
                  setAvatar(null)
                    .then(() => toast.success("Photo removed"))
                    .catch((e: Error) => {
                      toast.error("Could not remove the photo", { description: e.message });
                      throw e;
                    })
                }
              >
                <Trash2 /> Remove
              </ConfirmButton>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">PNG, JPG or WebP, up to 2 MB.</p>
        </div>
        <dl className="mt-5 grid gap-2.5 border-t border-border/60 pt-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">Company</dt>
            <dd className="min-w-0 truncate text-right font-semibold" title={company?.name ?? undefined}>
              {company?.name ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">Role</dt>
            <dd className="min-w-0 truncate text-right font-semibold">{roleLabel(role)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">Member since</dt>
            <dd className="text-right font-semibold">{formatDate(profile?.created_at)}</dd>
          </div>
        </dl>
      </SectionCard>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="min-w-0"
      >
        <SectionCard
          title="Personal details"
          description="How colleagues and employees see you on approvals, messages and the timeline"
          icon={UserRound}
          flush
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              {dirty && (
                <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-9" onClick={reset} disabled={saving}>
                  <RotateCcw /> Discard
                </Button>
              )}
              <Button type="submit" size="sm" className="h-10 sm:h-9" disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
              </Button>
            </div>
          }
        >
          <SettingsList>
            <SettingRow id="acc-first" label="First name" required error={touched ? firstError : null}>
              <Input
                id="acc-first"
                value={first}
                maxLength={60}
                onChange={(e) => setFirst(e.target.value)}
                aria-invalid={touched && !!firstError}
                className={CONTROL}
                autoComplete="given-name"
              />
            </SettingRow>
            <SettingRow id="acc-last" label="Last name">
              <Input id="acc-last" value={last} maxLength={60} onChange={(e) => setLast(e.target.value)} className={CONTROL} autoComplete="family-name" />
            </SettingRow>
            <SettingRow id="acc-email" label="Email" description="You sign in with this address." hint="It cannot be changed here.">
              <Input id="acc-email" value={user?.email ?? ""} readOnly disabled className={CONTROL} />
            </SettingRow>
          </SettingsList>
        </SectionCard>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
      <span className="sr-only">{ok ? "(done)" : "(not yet)"}</span>
    </li>
  );
}

function PasswordCard() {
  const { user } = useAuth();
  const mfa = useMfaStatus();
  const invalidate = useInvalidateMfa();
  const factor = mfa.data?.factors[0];
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const errNext = staffPasswordError(next) ?? (next && next === current ? "Choose a password you have not used here." : null);
  const errConfirm = confirm !== next ? "The passwords do not match." : null;
  const rules = {
    length: next.length >= 10 && next.length <= 72,
    mix: /[A-Za-z]/.test(next) && /\d/.test(next),
    fresh: !!next && next !== current,
    match: !!confirm && confirm === next,
  };

  const submit = async () => {
    setTouched(true);
    if (!user?.email || !current || errNext || errConfirm || (factor && code.length !== 6)) return;
    setBusy(true);
    try {
      // Verify the current password by signing in again with it.
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (authError) throw new Error("Your current password is not correct.");
      if (factor) {
        const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (mfaError) throw new Error("The authenticator code did not match. Try the next code.");
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      await supabase.auth.signOut({ scope: "others" });
      logActivity("account.password", "Changed their password");
      toast.success("Password changed", { description: "Other devices have been signed out." });
      setCurrent("");
      setNext("");
      setConfirm("");
      setCode("");
      setTouched(false);
    } catch (e) {
      toast.error("Could not change the password", { description: e instanceof Error ? e.message : undefined });
      setCode("");
    } finally {
      setBusy(false);
      await invalidate();
    }
  };

  const type = show ? "text" : "password";
  return (
    <SectionCard title="Password" description="Changing it signs you out on your other devices" icon={KeyRound}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input type="text" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
        <Field id="pw-current" label="Current password" required error={touched && !current ? "Enter your current password." : null} className="sm:col-span-2">
          <div className="relative">
            <Input id="pw-current" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={cn(CONTROL, "pr-11")} />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              aria-pressed={show}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field id="pw-new" label="New password" required error={touched && errNext ? errNext : null}>
          <Input id="pw-new" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={CONTROL} />
        </Field>
        <Field id="pw-confirm" label="Confirm new password" required error={(touched || confirm.length >= next.length) && confirm && errConfirm ? errConfirm : null}>
          <Input id="pw-confirm" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={CONTROL} />
        </Field>
        <ul className="grid gap-1.5 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 sm:col-span-2 sm:grid-cols-2" aria-label="Password requirements">
          <Rule ok={rules.length}>At least 10 characters</Rule>
          <Rule ok={rules.mix}>Letters and digits</Rule>
          <Rule ok={rules.fresh}>Different from the current one</Rule>
          <Rule ok={rules.match}>Both new passwords match</Rule>
        </ul>
        {factor && (
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-[13px] font-semibold leading-5 text-foreground">Authenticator code</p>
            <p className="text-xs text-muted-foreground">The six-digit code from your authenticator app.</p>
            <div className="flex justify-start">
              <OtpField value={code} onChange={setCode} disabled={busy} />
            </div>
          </div>
        )}
        <div className="sm:col-span-2 sm:flex sm:justify-end">
          <Button type="submit" size="sm" className="h-10 w-full sm:h-9 sm:w-auto" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function MfaCard() {
  const mfa = useMfaStatus();
  const invalidate = useInvalidateMfa();
  const [enrolling, setEnrolling] = useState(false);
  const s = mfa.data;
  const factors = s?.factors ?? [];
  const isAal2 = s?.currentLevel === "aal2";

  const remove = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast.error("Could not remove the authenticator", {
        description: /aal2/i.test(error.message) ? "Verify with your current code first: sign out and back in." : error.message,
      });
      throw error;
    }
    await supabase.auth.refreshSession();
    logActivity("account.mfa_disabled", "Turned off two-step verification");
    toast.success("Authenticator removed");
    await invalidate();
  };

  return (
    <SectionCard
      title="Two-step verification"
      description="A code from an authenticator app after your password"
      icon={Smartphone}
      actions={mfa.isPending ? undefined : factors.length ? <StatusBadge status="active" label="On" /> : <StatusBadge status="off" label="Off" tone="warning" />}
    >
      {mfa.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-56 rounded-xl" />
        </div>
      ) : enrolling ? (
        <TotpEnrollCard
          onCancel={() => setEnrolling(false)}
          onDone={() => {
            setEnrolling(false);
            logActivity("account.mfa_enabled", "Turned on two-step verification");
            void supabase.auth.refreshSession().then(() => invalidate());
          }}
        />
      ) : factors.length ? (
        <div className="space-y-3">
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {factors.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{f.friendly_name?.replace(/\s\d{4}-\d{2}-\d{2}$/, "") || "Authenticator app"}</p>
                  <p className="text-xs text-muted-foreground">Added {formatDate(f.created_at)}</p>
                </div>
                {s?.companyRequires && factors.length === 1 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Required by your company</span>
                ) : (
                  <ConfirmButton
                    variant="ghost"
                    size="sm"
                    className="h-10 shrink-0 sm:h-9"
                    disabled={!isAal2}
                    title="Remove this authenticator?"
                    description="You will sign in with your password only. You can set it up again at any time."
                    confirmLabel="Remove"
                    onConfirm={() => remove(f.id)}
                  >
                    <Trash2 /> Remove
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
          {!isAal2 && <p className="text-xs text-muted-foreground">Sign out and back in with a code to manage your authenticators.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] leading-5 text-muted-foreground">
            Your account is protected by a password only. Add Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app, and enter a six-digit
            code at each sign-in.
          </p>
          <Button size="sm" className="h-10 w-full sm:h-9 sm:w-auto" onClick={() => setEnrolling(true)}>
            <ShieldCheck /> Set up two-step verification
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

/** "Chrome on Windows" from the user agent, for the current-device row. */
function describeDevice(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard() {
  const { signOut, user } = useAuth();
  const device = typeof navigator !== "undefined" ? describeDevice(navigator.userAgent) : "This browser";
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  const DeviceIcon = mobile ? Smartphone : Monitor;
  return (
    <SectionCard title="Devices" description="Where you are signed in" icon={MonitorSmartphone}>
      <div className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <DeviceIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{device}</p>
          <p className="text-xs text-muted-foreground">
            {user?.last_sign_in_at ? (
              <>
                Signed in <span title={formatDateTime(user.last_sign_in_at)}>{formatRelative(user.last_sign_in_at)}</span>
              </>
            ) : (
              "Signed in"
            )}
          </p>
        </div>
        <StatusBadge status="active" label="This device" />
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">Lost a phone or used a shared computer? Sign out everywhere except this browser.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ConfirmButton
          variant="outline"
          size="sm"
          className="h-10 sm:h-9"
          destructive={false}
          title="Sign out other devices?"
          description="Every other browser and device is signed out. This one stays signed in."
          confirmLabel="Sign out others"
          onConfirm={async () => {
            const { error } = await supabase.auth.signOut({ scope: "others" });
            if (error) {
              toast.error("Could not sign out other devices", { description: error.message });
              throw error;
            }
            logActivity("account.sessions_revoked", "Signed out their other devices");
            toast.success("Other devices signed out");
          }}
        >
          <LogOut /> Sign out other devices
        </ConfirmButton>
        <Button variant="ghost" size="sm" className="h-10 sm:h-9" onClick={() => void signOut()}>
          <LogOut /> Sign out here
        </Button>
      </div>
    </SectionCard>
  );
}

function AccountBody() {
  const [tab] = useTabParam(TABS);
  return (
    <>
      <PageHeader eyebrow="Account" title="My account" description="Your profile, password and how you sign in." icon={UserRound}>
        <TabsNav tabs={TABS} />
      </PageHeader>
      {tab === "security" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PasswordCard />
          <div className="grid content-start gap-4">
            <MfaCard />
            <SessionsCard />
          </div>
        </div>
      ) : (
        <ProfileTab />
      )}
    </>
  );
}

export default function AccountPage() {
  return (
    <MfaGate>
      <AccountBody />
    </MfaGate>
  );
}
