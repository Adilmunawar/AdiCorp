import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, LayoutDashboard, Settings2, ShieldCheck } from "lucide-react";
import CompanySetupForm from "@/components/company/CompanySetupForm";
import WorkspaceSettingsForm from "@/components/company/WorkspaceSettingsForm";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import BrandLoader from "@/components/common/BrandLoader";
import { cn } from "@/lib/utils";
import { homeForRole } from "@/modules/registry";

const STEPS = [
  {
    title: "Company profile",
    description: "Name, industry and contact details.",
    icon: Building2,
  },
  {
    title: "Workspace settings",
    description: "Currency and timezone.",
    icon: Settings2,
  },
  {
    title: "Open your dashboard",
    description: "Start adding people and running HR.",
    icon: LayoutDashboard,
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading, companyId, role } = useAuth();

  // Start on step 2 if company is already created, otherwise step 1
  const [currentStep, setCurrentStep] = useState(() => {
    return companyId ? 1 : 0;
  });

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
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [loading, user, navigate]);

  const handleStepComplete = () => {
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleLaunch = () => {
    try {
      sessionStorage.removeItem("post_onboarding_path");
    } catch {
      /* storage unavailable */
    }
    navigate(destination, { replace: true });
  };

  if (loading) {
    return <BrandLoader fullScreen message="Preparing your workspace..." subtitle="Setting up onboarding" />;
  }

  // HR and Finance join an existing workspace; only its owner sets it up. A member without a role
  // gets the shell's "access is being set up" screen rather than a settings form they cannot save.
  if (companyId && role !== "owner") {
    return <Navigate to={homeForRole(role)} replace />;
  }

  const renderCurrentForm = () => {
    switch (currentStep) {
      case 0:
        return <CompanySetupForm isEmbedded={true} onComplete={handleStepComplete} />;
      case 1:
        return <WorkspaceSettingsForm isEmbedded={true} onComplete={handleStepComplete} />;
      case 2:
        return (
          <div className="flex h-full flex-col items-center justify-center px-2 py-10 text-center animate-in fade-in duration-300 motion-reduce:animate-none">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success ring-1 ring-inset ring-success/15">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </div>
            <p className="micro-label !text-primary">Setup complete</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">Your workspace is ready</h2>
            <p className="mt-2 max-w-sm text-[13px] leading-5 text-muted-foreground">
              Your company profile and workspace settings are saved. You can change them any time from Settings.
            </p>
            <Button onClick={handleLaunch} size="lg" className="mt-8 w-full max-w-xs">
              Open dashboard
              <ArrowRight aria-hidden />
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-muted/30 px-4 py-6 sm:items-center sm:p-6 lg:p-10">
      <div className="flex w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:flex-row">
        {/* Steps */}
        <aside className="flex shrink-0 flex-col border-b border-border bg-muted/30 p-5 sm:p-8 lg:w-[340px] lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-foreground/5 bg-card shadow-sm">
              <img src={ADICORP_LOGO_PATH} alt="" className="h-full w-full object-contain p-1" />
            </span>
            <div className="min-w-0 leading-none">
              <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">AdiCorp HR</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Workspace setup</p>
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

        {/* Form */}
        <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{renderCurrentForm()}</main>
      </div>
    </div>
  );
}
