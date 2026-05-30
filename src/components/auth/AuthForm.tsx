import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ADICORP_LOGO_PATH } from "@/lib/branding";

export default function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password, { first_name: firstName, last_name: lastName });
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex overflow-hidden bg-primary lg:bg-background font-sans">
      {/* Left Panel — Branding (White Background) */}
      <div className="hidden lg:flex lg:w-[50%] relative bg-background items-center justify-center p-8">
        {/* Soft glowing accents */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full max-w-[420px]">
          <div className="flex items-center gap-3 mb-8">
            <img
              src={ADICORP_LOGO_PATH}
              alt="AdiCorp Logo"
              className="w-10 h-10 object-contain drop-shadow-sm"
            />
            <span className="text-2xl font-bold text-foreground tracking-tight">
              AdiCorp
            </span>
          </div>

          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-foreground leading-tight tracking-tight">
              Empowering your workforce.
              <span className="block text-primary mt-1.5 text-2xl font-semibold">Securing your future.</span>
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed font-medium">
              Experience the next generation of enterprise HR management. 
              Streamlined operations, advanced analytics, and bank-grade security.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-8 mt-8 border-t border-border/40">
            {[
              { value: "99.9%", label: "Uptime" },
              { value: "AES-256", label: "Encryption" },
              { value: "SOC 2", label: "Compliant" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <div className="text-lg font-bold text-foreground">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Form (Blue Background) */}
      <div className="flex-1 relative flex flex-col justify-center items-center p-6 lg:p-8 bg-primary overflow-y-auto lg:overflow-hidden">
        {/* Soft abstract elements for the blue side */}
        <div className="absolute top-[-5%] right-[-5%] w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-black/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[360px] space-y-6 relative z-10 flex flex-col justify-center min-h-full lg:min-h-0 py-6 lg:py-0">
          
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-2">
            <img
              src={ADICORP_LOGO_PATH}
              alt="AdiCorp Logo"
              className="w-10 h-10 object-contain drop-shadow-md brightness-0 invert"
            />
            <span className="text-2xl font-bold text-white tracking-tight drop-shadow-sm">AdiCorp</span>
          </div>

          {/* Header */}
          <div className="space-y-1.5 text-center lg:text-left">
            <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow-sm">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-white/80 text-sm font-medium">
              {mode === "signin"
                ? "Enter your credentials to access your workspace."
                : "Fill in your details to join the platform."}
            </p>
          </div>

          {/* Mode toggle pills */}
          <div className="flex bg-black/20 p-1.5 rounded-full shadow-inner backdrop-blur-md border border-white/10">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-sm font-bold rounded-full transition-all duration-300 ${
                mode === "signin"
                  ? "bg-white text-primary shadow-md"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm font-bold rounded-full transition-all duration-300 ${
                mode === "signup"
                  ? "bg-white text-primary shadow-md"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-wider text-white/90 ml-0.5">
                    First Name
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 transition-colors group-focus-within:text-primary" />
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="Adil"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="pl-9 h-10 rounded-lg border-none bg-white text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-white/30 shadow-sm text-sm font-medium transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lastName" className="text-[10px] font-bold uppercase tracking-wider text-white/90 ml-0.5">
                    Last Name
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 transition-colors group-focus-within:text-primary" />
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Munawar"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="pl-9 h-10 rounded-lg border-none bg-white text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-white/30 shadow-sm text-sm font-medium transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-white/90 ml-0.5">
                Email Address
              </Label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 transition-colors group-focus-within:text-primary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-9 h-10 rounded-lg border-none bg-white text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-white/30 shadow-sm text-sm font-medium transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-wider text-white/90 ml-0.5">
                Password
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 transition-colors group-focus-within:text-primary" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signin" ? "Enter your password" : "Min. 8 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-9 pr-10 h-10 rounded-lg border-none bg-white text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-white/30 shadow-sm text-sm font-medium transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-4 rounded-lg text-sm font-bold tracking-wide gap-2 bg-white text-primary hover:bg-white/90 shadow-md hover:shadow-lg transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "signin" ? "Authenticating..." : "Setting up workspace..."}
                </>
              ) : (
                <>
                  {mode === "signin" ? "Sign In to Workspace" : "Create Enterprise Account"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-white/70 text-xs font-semibold pt-4">
            © {new Date().getFullYear()} AdiCorp HR. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
