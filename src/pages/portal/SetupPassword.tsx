import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { portalRpc, PortalAuthError } from "@/lib/portal";
import { PASSWORD_MIN as MIN_LENGTH, passwordIssue as strengthIssue } from "@/modules/portal/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import BrandLoader from "@/components/common/BrandLoader";

const inputClass =
  "h-14 pl-11 pr-10 bg-muted/30 border-border/50 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl text-base transition-all font-medium";

/** First-login (and voluntary) password change for the employee portal. */
export default function SetupPassword() {
  const { employee, loading, updateEmployee, logout } = useEmployeeAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Set your password · AdiCorp HR";
  }, []);

  if (loading) return <BrandLoader fullScreen message="Checking your session..." subtitle="One moment" />;
  if (!employee) return <Navigate to="/employee-login" replace />;

  const forced = employee.needs_password_change;
  const issue = newPassword ? strengthIssue(newPassword) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    const problem = strengthIssue(newPassword);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Choose a password different from your current one");
      return;
    }

    setSaving(true);
    try {
      await portalRpc("portal_change_password", { p_old: currentPassword, p_new: newPassword });
      updateEmployee({ needs_password_change: false });
      toast.success("Password updated securely");
      navigate("/portal", { replace: true });
    } catch (err) {
      if (err instanceof PortalAuthError) {
        // EmployeeAuthContext already says the session ended.
        navigate("/employee-login", { replace: true });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: "4s" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: "6s", animationDelay: "1s" }} />
      </div>

      <div className="w-full max-w-[380px] space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">{forced ? "Secure Your Account" : "Change Password"}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed px-4">
            {forced ? (
              <>
                Welcome, <strong>{employee.name}</strong>. Since this is your first time logging in, please replace the password HR gave you with your own.
              </>
            ) : (
              "Enter your current password, then choose a new one."
            )}
          </p>
        </div>

        <Card className="border-border/50 shadow-2xl rounded-[2rem] overflow-hidden bg-card/80 backdrop-blur-xl">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" name="username" autoComplete="username" value={String(employee.cnic ?? employee.name)} readOnly hidden />
              <div className="space-y-2">
                <label htmlFor="pw-current" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {forced ? "Password from HR" : "Current password"}
                </label>
                <div className="relative group">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="pw-current"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="pw-new" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">New password</label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="pw-new"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={`Min. ${MIN_LENGTH} characters`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    aria-describedby="pw-hint"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p id="pw-hint" className={`px-1 text-[11px] ${issue ? "text-warning" : "text-muted-foreground"}`}>
                  {issue ?? `At least ${MIN_LENGTH} characters with letters and numbers.`}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="pw-confirm" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">Confirm password</label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="pw-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 rounded-2xl mt-6 font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : forced ? "Save Password & Continue" : "Update Password"}
              </Button>
              {forced ? (
                // Signed in on someone else's phone, or not ready to choose now: leave without changing it.
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11"
                  disabled={saving}
                  onClick={async () => {
                    await logout();
                    navigate("/employee-login", { replace: true });
                  }}
                >
                  Sign out
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11"
                  // Opened directly (bookmark, new tab): there is no portal page to go back to.
                  onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/portal", { replace: true }))}
                >
                  Cancel
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
