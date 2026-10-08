import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, ListSkeleton, PageHeader, SectionCard, formatDate, formatRelative } from "@/components/kit";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { cn } from "@/lib/utils";
import { usePortalSessions, useSignOutOtherDevices } from "../api";
import { PasswordForm } from "../components/PasswordForm";

function DevicesCard() {
  const { data, isPending } = usePortalSessions();
  const signOutOthers = useSignOutOtherDevices();
  const others = (data ?? []).filter((s) => !s.current).length;

  return (
    <SectionCard
      title="Signed-in devices"
      description="Sessions stay signed in for up to 7 days"
      icon={MonitorSmartphone}
      flush
      actions={
        others > 0 ? (
          <ConfirmButton
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={signOutOthers.isPending}
            title={`Sign out ${others} other device${others === 1 ? "" : "s"}?`}
            description="Anyone using your account on those devices will have to sign in again. This device stays signed in."
            confirmLabel="Sign out others"
            onConfirm={async () => {
              try {
                const res = await signOutOthers.mutateAsync();
                toast.success(res.count ? `Signed out ${res.count} device${res.count === 1 ? "" : "s"}` : "No other devices were signed in");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not sign out other devices");
              }
            }}
          >
            Sign out others
          </ConfirmButton>
        ) : undefined
      }
    >
      {isPending ? (
        <ListSkeleton rows={2} className="p-4" />
      ) : (data ?? []).length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-5">We couldn't list your devices right now.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {(data ?? []).map((s, i) => (
            <li key={`${s.created_at}-${i}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", s.current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <MonitorSmartphone className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {s.current ? "This device" : "Another device"}
                  {s.current && <span className="ml-2 rounded-full border border-success/15 bg-success-soft px-1.5 py-px text-[10px] font-semibold text-success">Active now</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Signed in {formatDate(s.created_at, "dd MMM, HH:mm")}
                  {!s.current && s.last_seen_at && ` · last active ${formatRelative(s.last_seen_at)}`}
                </p>
              </div>
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">Expires {formatDate(s.expires_at, "dd MMM")}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Account and security: password, devices, company contact, sign out. */
export default function PortalAccountPage() {
  const { employee, company, logout } = useEmployeeAuth();
  const navigate = useNavigate();
  const username = String(employee?.cnic ?? employee?.name ?? "");

  const signOut = async () => {
    await logout();
    navigate("/employee-login", { replace: true });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="My portal"
        title="Account and security"
        description="Keep your portal password private. HR never asks for it."
        icon={ShieldCheck}
        actions={
          <Button variant="outline" className="h-9 gap-1.5 rounded-xl text-destructive hover:text-destructive" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        }
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <SectionCard title="Change password" description="At least 8 characters, with letters and numbers" icon={KeyRound}>
            <PasswordForm username={username} />
          </SectionCard>
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2">
          <DevicesCard />
          {company && (
            <SectionCard title="Your company" icon={Building2}>
              <div className="flex items-center gap-3">
                {company.logo ? (
                  <img src={company.logo} alt="" className="h-10 w-10 rounded-xl border border-border object-contain p-1" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={company.name}>{company.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">Questions about your record? Contact HR.</p>
                </div>
              </div>
              {(company.phone || company.website || company.address) && (
                <dl className="mt-4 space-y-2 text-xs">
                  {company.phone && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="truncate font-semibold">
                        <a href={`tel:${company.phone}`} className="hover:text-primary">{company.phone}</a>
                      </dd>
                    </div>
                  )}
                  {company.website && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Website</dt>
                      <dd className="truncate font-semibold">
                        <a href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                          {company.website.replace(/^https?:\/\//i, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  {company.address && (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">Address</dt>
                      <dd className="text-right font-semibold">{company.address}</dd>
                    </div>
                  )}
                </dl>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
