import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthForm from "@/components/auth/AuthForm";
import { useAuth } from "@/context/AuthContext";
import { ADICORP_LOGO_PATH } from "@/lib/branding";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background relative overflow-hidden font-sans">
        
        {/* Soft glowing accents */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex justify-center items-center">
            {/* Animated glowing ring */}
            <div className="absolute -inset-4 rounded-full bg-primary/5 animate-pulse" style={{ animationDuration: '2s' }} />
            
            {/* Logo */}
            <img
              src={ADICORP_LOGO_PATH}
              alt="AdiCorp Logo"
              className="w-14 h-14 object-contain relative z-10"
            />
          </div>
          
          <div className="mt-8 flex flex-col items-center space-y-3">
            <h3 className="text-3xl font-bold text-foreground tracking-tight">
              Authenticating
            </h3>
            <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground tracking-wide">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Securing your workspace...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return user ? null : <AuthForm />;
}
