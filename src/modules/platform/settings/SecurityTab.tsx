import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, KeyRound, LockKeyhole, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMediaBelow } from "@/hooks/use-mobile";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog, SectionCard, Skeleton, StatGrid, StatTile, formatNumber } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useAccessSummary, useUpdateSettings, type CompanySettings } from "../api";
import { useInvalidateMfa, useMfaStatus } from "../mfa";
import { SettingRow, SettingsList, ToggleRow } from "../components/form";

export function SecurityTab({ settings }: { settings: CompanySettings }) {
  const access = useAccessSummary();
  const mine = useMfaStatus();
  const update = useUpdateSettings();
  const invalidateMfa = useInvalidateMfa();
  const [confirm, setConfirm] = useState<boolean | null>(null);
  // On phones the tiles are narrow: drop the icons so labels and hints are not cut off.
  const phone = useMediaBelow(640);

  const apply = async (next: boolean) => {
    try {
      await update.mutateAsync({ require_staff_mfa: next });
      await invalidateMfa();
      toast.success(next ? "Two-step verification is now required" : "Two-step verification is optional again", {
        description: next ? "Staff without an authenticator will be asked to set one up at their next visit." : undefined,
      });
    } catch (e) {
      toast.error("Could not change the policy", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  const s = access.data?.staff;
  const p = access.data?.portal;
  const staffTotal = s ? s.owner + s.hr + s.finance : 0;
  const coverage = s && staffTotal ? Math.round((s.with_mfa / staffTotal) * 100) : 0;
  const missing = s ? Math.max(staffTotal - s.with_mfa, 0) : 0;
  const required = settings.require_staff_mfa;
  const ownMissing = !mine.isPending && (mine.data?.factors.length ?? 0) === 0;
  const unavailable = access.isError ? "Not available right now" : undefined;

  const staffBreakdown = s
    ? [s.owner && `${s.owner} owner`, s.hr && `${s.hr} HR`, s.finance && `${s.finance} Finance`, s.no_role && `${s.no_role} without a role`].filter(Boolean).join(" · ") || "No staff yet"
    : unavailable;

  return (
    <div className="space-y-4">
      <SectionCard title="Staff sign-in" description="Applies to every owner, HR and Finance account" icon={LockKeyhole} flush>
        <SettingsList>
          <ToggleRow
            id="require-mfa"
            label="Require two-step verification"
            description="Everyone enters a code from an authenticator app after their password. Accounts without one are asked to set it up before they can continue."
            checked={required}
            onChange={(v) => setConfirm(v)}
            disabled={update.isPending}
            status={required ? "Required" : "Optional"}
          />
          <SettingRow label="Coverage" description="Staff accounts with an authenticator app set up.">
            {access.isPending ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full" />
              </div>
            ) : s ? (
              <div className="space-y-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="tabular font-display text-lg font-semibold text-foreground">
                    {s.with_mfa} of {staffTotal}
                  </span>
                  <span className="text-muted-foreground">staff protected</span>
                  <span className="tabular ml-auto text-xs font-semibold text-muted-foreground">{coverage}%</span>
                </p>
                <Progress
                  value={coverage}
                  className="h-2 bg-muted"
                  indicatorClassName={cn(coverage === 100 ? "bg-success" : coverage >= 50 ? "bg-primary" : "bg-warning")}
                  aria-label={`${coverage}% of staff use two-step verification`}
                />
                {missing > 0 && (
                  <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                    {required
                      ? `${missing === 1 ? "1 person is" : `${missing} people are`} asked to set it up at their next sign-in.`
                      : `${missing === 1 ? "1 account signs" : `${missing} accounts sign`} in with a password only.`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{unavailable}</p>
            )}
          </SettingRow>
          <SettingRow label="Your account" description="Your own password and authenticator app.">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-10 sm:h-9">
                <Link to="/account?tab=security">
                  <UserCog /> Password and authenticator
                </Link>
              </Button>
              {!mine.isPending && (
                <span className={cn("text-xs font-medium", ownMissing ? "text-warning" : "text-success")}>
                  {ownMissing ? "No authenticator yet" : "Authenticator set up"}
                </span>
              )}
            </div>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <section aria-labelledby="access-overview" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="access-overview" className="font-display text-[15px] font-semibold leading-5 tracking-tight text-foreground">
              Who can sign in
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Staff use the staff login; employees use the portal with their CNIC.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-10 shrink-0 sm:h-9">
            <Link to="/users">
              Users & access <ArrowRight />
            </Link>
          </Button>
        </div>
        <StatGrid columns={3}>
          <StatTile label="Staff accounts" value={s ? formatNumber(staffTotal, 0) : "—"} loading={access.isPending} icon={phone ? undefined : Users} hint={staffBreakdown} href="/users" />
          <StatTile
            label="2-step verification"
            value={s ? `${s.with_mfa} of ${staffTotal}` : "—"}
            loading={access.isPending}
            icon={phone ? undefined : ShieldCheck}
            tone={!s ? "default" : staffTotal > 0 && s.with_mfa === staffTotal ? "success" : "warning"}
            hint={s ? (required ? "Required for all staff" : "Optional for staff") : unavailable}
          />
          <StatTile
            label="Employee portal"
            value={p ? `${p.with_password} of ${p.active_employees}` : "—"}
            loading={access.isPending}
            icon={phone ? undefined : KeyRound}
            tone={p && p.without_password > 0 ? "warning" : "default"}
            hint={
              p
                ? p.without_password > 0
                  ? `${p.without_password} without a password`
                  : `${p.signed_in_7_days} signed in this week`
                : unavailable
            }
            className="col-span-2 lg:col-span-1"
          />
        </StatGrid>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? "Require two-step verification for all staff?" : "Make two-step verification optional?"}
        description={
          confirm
            ? ownMissing
              ? "You have not set up an authenticator yourself yet, so you will be asked to do it on your next visit. Staff are notified and asked to set one up at their next sign-in."
              : "Staff are notified and asked to set up an authenticator at their next sign-in."
            : "Staff who already use an authenticator keep it. Others will no longer be asked to set one up."
        }
        confirmLabel={confirm ? "Require it" : "Make optional"}
        destructive={!confirm}
        onConfirm={() => apply(!!confirm)}
      />
    </div>
  );
}
