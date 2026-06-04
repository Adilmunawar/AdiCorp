import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, UserCircle, Loader2 } from "lucide-react";

export default function EmployeeLogin() {
  const [cnic, setCnic] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading } = useEmployeeAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnic || !password) {
      toast.error("Please enter both CNIC and Password");
      return;
    }

    try {
      await login(cnic, password);
      toast.success("Welcome to your portal!");
      navigate("/portal/profile");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl overflow-hidden border border-border/50">
        <div className="p-8 text-center bg-primary/5 border-b border-border/50">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Employee Portal</h1>
          <p className="text-xs text-muted-foreground mt-2">Sign in with your CNIC to view your records.</p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground px-1">CNIC Number</label>
            <Input 
              placeholder="XXXXX-XXXXXXX-X" 
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              className="h-12 bg-muted/50 border-transparent focus:bg-background focus:border-primary rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground px-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="password"
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pl-10 bg-muted/50 border-transparent focus:bg-background focus:border-primary rounded-xl"
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl mt-4 font-bold text-sm shadow-md shadow-primary/20"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In Securely"}
          </Button>

          <p className="text-[10px] text-center text-muted-foreground pt-4">
            If you don't know your credentials, please contact HR.
          </p>
        </form>
      </div>
    </div>
  );
}
