import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Globe2,
  ListChecks,
  Plane,
  Receipt,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import CompanySetupForm from "@/components/company/CompanySetupForm";
import WorkspaceSettingsForm from "@/components/company/WorkspaceSettingsForm";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import BrandLoader from "@/components/common/BrandLoader";
import { cn } from "@/lib/utils";
import { homeForRole } from "@/modules/registry";

const STEPS = [
  { title: "Your company", description: "Name, industry and contact details.", icon: Building2 },
  { title: "Currency and timezone", description: "How pay and attendance are shown.", icon: Globe2 },
  { title: "First things to do", description: "Add people and set your rules.", icon: ListChecks },
];

interface NextStep {
  icon: LucideIcon;
  title: string;
  text: string;
  to: string;
}

const NEXT_STEPS: NextStep[] = [
  { icon: UserPlus, title: "Add your first employee", text: "Or import everyone at once from a spreadsheet.", to: "/employees/new" },
  { icon: Upload, title: "Import from a spreadsheet", text: "Names, codes, departments and joining dates in one go.", to: "/employees/import" },
  { icon: Users, title: "Invite HR and Finance", text: "HR runs people and time; Finance runs pay. Neither sees the other's area.", to: "/users" },
  { icon: Plane, title: "Check the leave types", text: "Annual, sick, casual and unpaid are set up. Change the days to match your policy.", to: "/leave?tab=types" },
  { icon: CalendarDays, title: "Set the working week and holidays", text: "Weekends, hours per day and public holidays drive attendance and pay.", to: "/settings?tab=workweek" },
  { icon: Receipt, title: "Set up payroll rules", text: "Salary structure and tax table before the first payroll run.", to: "/payroll/rules" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading, companyId, company, role } = useAuth();

  // The company's existence decides the first step; the owner then moves forward with Continue.
  const [advanced, setAdvanced] = useState(0);
  const currentStep = companyId ? Math.max(1, Math.min(advanced, STEPS.length - 1)) : 0;

  const destination = useMemo(() => {
    try {
      return sessionStorage.getItem("post_onboarding_path") || "/dashboard";
    } catch {
      return "/dashboard";
    }
  }, []);

  useEffect(() => {
    document.title = "Set up your workspace · AdiCorp HR";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const handleLaunch = () => {
    try {
      sessionStorage.removeItem("post_onboarding_path");
    } catch {
      /* storage unavailable */
    }
    navigate(destination, { replace: true });
  };

  if (loading) return <BrandLoader fullScreen message="Preparing your workspace" />;

  // HR and Finance join an existing workspace; only its owner sets it up.
  if (companyId && role !== "owner") return <Navigate to={homeForRole(role)} replace />;

  const renderCurrentForm = () => {
    switch (currentStep) {
      case 0:
        return <CompanySetupForm isEmbedded onComplete={() => setAdvanced(1)} />;
      case 1:
        return <WorkspaceSettingsForm isEmbedded onComplete={() => setAdvanced(2)} />;
      default:
        return (
          <div className="flex h-full flex-col animate-in fade-in duration-300 motion-reduce:animate-none">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success ring-1 ring-inset ring-success/15">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{company?.name ?? "Your workspace"} is ready</h2>
                <p className="text-[13.5px] leading-5 text-muted-foreground">A few things make the first week easy. You can do them in any order.</p>
              </div>
            </div>

            <ol className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {NEXT_STEPS.map((s) => (
                <li key={s.to}>
                  <Link
                    to={s.to}
                    className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary ring-1 ring-inset ring-brand-100 dark:bg-primary/10 dark:ring-primary/20">
                      <s.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-foreground group-hover:text-primary">{s.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{s.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => setAdvanced(1)}>
                <ChevronLeft aria-hidden /> Back
              </Button>
              <Button onClick={handleLaunch} size="lg">
                Open the dashboard <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-muted/30 px-4 py-6 sm:items-center sm:p-6 lg:p-10">
      <div className="flex w-full max-w-[1040px] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-sm lg:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-border bg-muted/30 p-5 sm:p-8 lg:w-[340px] lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px_11px_4px_11px] bg-card shadow-[0_6px_16px_-4px_hsl(var(--brand-700)/0.35)] ring-1 ring-brand-100 dark:ring-border">
              <img src={ADICORP_LOGO_PATH} alt="" className="h-6 w-6 object-contain" />
            </span>
            <div className="min-w-0 leading-none">
              <p className="font-display text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                AdiCorp <span className="text-primary">HR</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Workspace setup</p>
            </div>
          </div>

          <h1 className="mt-6 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Set up your workspace</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Three short steps and your team can start using AdiCorp HR.</p>

          <ol className="mt-6 flex gap-2 lg:flex-col lg:gap-0" aria-label="Setup progress">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const state = index < currentStep ? "completed" : index === currentStep ? "active" : "pending";
              const last = index === STEPS.length - 1;
              return (
                <li key={step.title} aria-current={state === "active" ? "step" : undefined} className="flex min-w-0 flex-1 items-start gap-3 lg:flex-none">
                  <div className="flex flex-col items-center self-stretch">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                        state === "completed" && "border-primary bg-primary text-primary-foreground",
                        state === "active" && "border-primary bg-card text-primary ring-4 ring-primary/10",
                        state === "pending" && "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {state === "completed" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                    </span>
                    {!last && <span aria-hidden className={cn("my-1.5 hidden w-px flex-1 lg:block", state === "completed" ? "bg-primary" : "bg-border")} />}
                  </div>
                  <div className={cn("min-w-0 pt-0.5", !last && "lg:pb-6")}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step {index + 1}</p>
                    <p className={cn("text-[13px] font-semibold leading-5 sm:text-sm", state === "pending" ? "text-muted-foreground" : "text-foreground")}>
                      <span className={cn(state !== "active" && "sr-only sm:not-sr-only")}>{step.title}</span>
                    </p>
                    <p className="mt-0.5 hidden text-xs leading-5 text-muted-foreground lg:block">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 hidden items-start gap-3 rounded-xl border border-border bg-card p-3.5 lg:mt-auto lg:flex">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="block text-[13px] font-semibold text-foreground">Private to your company</span>
              Only people you invite can see your workspace data.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{renderCurrentForm()}</main>
      </div>
    </div>
  );
}
