import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, CreditCard, Loader2, Eye, EyeOff } from "lucide-react";
import { ADICORP_LOGO_PATH } from "@/lib/branding";

export default function EmployeeLogin() {
  const [cnic, setCnic] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, employee, loading } = useEmployeeAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Employee Portal · AdiCorp HR";
  }, []);

  const formatCNIC = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 5) {
      return digits;
    } else if (digits.length <= 12) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    } else {
      return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cnic.replace(/\D/g, "").length !== 13 || !password) {
      toast.error("Enter your 13-digit CNIC and your password");
      return;
    }

    setSubmitting(true);
    try {
      const me = await login(cnic, password);
      if (me.needs_password_change) {
        toast.success("Welcome! Please set your own password to continue.");
        navigate("/portal/setup-password", { replace: true });
      } else {
        toast.success(`Welcome back, ${me.name.split(" ")[0] || "there"}!`);
        navigate("/portal", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && employee) {
    return <Navigate to={employee.needs_password_change ? "/portal/setup-password" : "/portal"} replace />;
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background relative overflow-hidden p-4 font-sans">
      {/* Premium Animated Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-[380px] bg-card/80 backdrop-blur-xl rounded-[2rem] shadow-2xl overflow-hidden border border-border/50 relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="p-10 pb-6 text-center bg-gradient-to-b from-primary/5 to-transparent border-b border-border/50">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <img 
              src={ADICORP_LOGO_PATH} 
              alt="AdiCorp Logo" 
              className="w-20 h-20 object-contain relative z-10 drop-shadow-md"
            />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight mb-1">Employee Portal</h1>
          <p className="text-sm font-medium text-muted-foreground">Sign in with your CNIC to access your secure workspace.</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="portal-cnic" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">CNIC Number</label>
            <div className="relative group">
              <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="portal-cnic"
                inputMode="numeric"
                autoComplete="username"
                placeholder="XXXXX-XXXXXXX-X"
                value={cnic}
                onChange={(e) => setCnic(formatCNIC(e.target.value))}
                maxLength={15}
                className="h-14 pl-11 bg-muted/30 border-border/50 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl text-base transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="portal-password" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">Password</label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="portal-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 pl-11 pr-11 bg-muted/30 border-border/50 focus:bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl text-base transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 rounded-2xl mt-6 font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            disabled={submitting}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In Securely"}
          </Button>

          <p className="text-xs text-center font-medium text-muted-foreground pt-4">
            If you don't know your credentials, please contact HR.
          </p>
          <p className="text-center text-xs">
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Staff sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
