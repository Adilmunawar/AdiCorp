import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Settings2, ShieldCheck, CheckCircle2, ArrowRight, LayoutDashboard } from "lucide-react";
import CompanySetupForm from "@/components/company/CompanySetupForm";
import WorkspaceSettingsForm from "@/components/company/WorkspaceSettingsForm";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "Company Profile",
    description: "Configure your organization's workspace.",
    icon: Building2,
  },
  {
    title: "Workspace Settings",
    description: "Set your currency and schedule.",
    icon: Settings2,
  },
  {
    title: "Launch Dashboard",
    description: "Access your centralized control panel.",
    icon: LayoutDashboard,
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading, userProfile } = useAuth();
  
  // Start on step 2 if company is already created, otherwise step 1
  const [currentStep, setCurrentStep] = useState(() => {
    return userProfile?.company_id ? 1 : 0;
  });

  const destination = useMemo(() => sessionStorage.getItem("post_onboarding_path") || "/dashboard", []);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [loading, user, navigate]);

  const handleStepComplete = () => {
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleLaunch = () => {
    sessionStorage.removeItem("post_onboarding_path");
    navigate(destination, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(var(--primary),0.2)]" />
        <p className="text-muted-foreground animate-pulse font-medium tracking-wide">Preparing your workspace...</p>
      </div>
    );
  }

  const renderCurrentForm = () => {
    switch (currentStep) {
      case 0:
        return <CompanySetupForm isEmbedded={true} onComplete={handleStepComplete} />;
      case 1:
        return <WorkspaceSettingsForm isEmbedded={true} onComplete={handleStepComplete} />;
      case 2:
        return (
          <div className="h-full flex flex-col items-center justify-center text-center animate-in slide-in-from-right-8 duration-500 p-8 relative z-10">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none rounded-3xl" />
            <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(var(--primary),0.4)] animate-pulse border border-primary/20">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-4xl font-extrabold text-foreground mb-4 tracking-tight">You're All Set!</h2>
            <p className="text-muted-foreground text-lg mb-10 max-w-sm leading-relaxed">
              Your intelligent HR workspace has been fully configured and securely encrypted.
            </p>
            <Button 
              onClick={handleLaunch}
              className="w-full max-w-sm relative overflow-hidden h-14 rounded-xl text-lg font-bold shadow-[0_8px_30px_rgb(var(--primary)_/_0.2)] hover:shadow-[0_8px_30px_rgb(var(--primary)_/_0.4)] transition-all group"
            >
              <span className="relative z-10 flex items-center justify-center w-full">
                Enter Dashboard 
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[loader-progress-slide_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12 bg-slate-50 dark:bg-[#09090b] selection:bg-primary/20 selection:text-primary">
      {/* Immersive Animated Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Grain effect */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] dark:opacity-[0.05] mix-blend-overlay"></div>
        {/* Ambient Glowing Orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-primary/20 blur-[120px] mix-blend-multiply dark:mix-blend-lighten animate-pulse duration-1000"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/15 blur-[120px] mix-blend-multiply dark:mix-blend-lighten"></div>
      </div>

      {/* Main Container - The Glass Card */}
      <div className="w-full max-w-[1100px] max-h-[90vh] overflow-y-auto mx-auto bg-background/80 dark:bg-card/40 backdrop-blur-2xl border border-white/50 dark:border-white/10 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] relative z-10 flex flex-col lg:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-700">
        
        {/* Left Sidebar - The Journey */}
        <div className="lg:w-[380px] xl:w-[420px] bg-gradient-to-br from-primary/10 to-transparent p-8 sm:p-10 lg:p-12 border-b lg:border-b-0 lg:border-r border-border/50 relative overflow-hidden flex flex-col shrink-0">
          <div className="absolute top-0 right-0 p-32 bg-primary/10 rounded-full blur-[80px] -z-10" />
          
          <div className="relative z-10 mb-8 flex items-center gap-4 sm:gap-5">
            <img src="/AdilMunawar-Uploads/AdiCorp%20-%20Logo.png" alt="AdiCorp Logo" className="h-12 sm:h-16 w-auto object-contain drop-shadow-sm shrink-0" />
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                Welcome to <span className="text-gradient-primary">AdiCorp</span>
              </h1>
            </div>
          </div>

          {/* Progress Tracker */}
          <div className="relative z-10 mb-6">
            <ol className="relative">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                let state = "pending";
                if (index === currentStep) state = "active";
                if (index < currentStep) state = "completed";

                return (
                  <li
                    key={step.title}
                    className={`relative flex gap-5 transition-all duration-500 ${
                      state === "active" ? "scale-105 transform origin-left" : 
                      state === "completed" ? "opacity-100" : "opacity-50"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`relative z-10 flex shrink-0 items-center justify-center w-11 h-11 rounded-full border-4 border-background/50 backdrop-blur-sm shadow-sm transition-colors duration-500 ${
                          state === "active"
                            ? "bg-background border-primary text-primary shadow-[0_0_20px_rgba(var(--primary),0.4)]"
                            : state === "completed"
                            ? "bg-primary border-primary text-primary-foreground shadow-sm"
                            : "bg-muted/80 border-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${state === "active" ? "animate-pulse" : ""}`} />
                      </div>
                      {index < STEPS.length - 1 && (
                        <div className={`w-[2px] h-full rounded-full my-2 transition-colors duration-500 ${
                          state === "completed" ? "bg-primary" : "bg-border/80"
                        }`} />
                      )}
                    </div>
                    <div className={`flex flex-col pt-1 ${index < STEPS.length - 1 ? 'pb-8' : 'pb-0'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-1">
                        Step {index + 1}
                      </p>
                      <h3 className={`text-base sm:text-lg font-bold ${state === "active" ? "text-foreground" : "text-foreground/80"}`}>
                        {step.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed hidden sm:block">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-auto relative z-10 pt-4">
            <div className="p-4 rounded-2xl bg-background/50 backdrop-blur-sm border border-border/50 flex items-center gap-3.5 shadow-sm">
              <div className="rounded-full p-2.5 bg-green-500/20 text-green-600 dark:text-green-400 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <strong className="text-foreground text-[15px] font-semibold mb-0.5">Enterprise Grade Security</strong>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Your organization's data is encrypted at rest and in transit.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - The Form */}
        <div className="flex-1 p-6 sm:p-10 lg:p-12 relative bg-background/40">
          {renderCurrentForm()}
        </div>
      </div>
    </div>
  );
}
