import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, ScanFace, Lock, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBiometric } from "@/hooks/useBiometric";
import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { ADICORP_LOGO_PATH } from "@/lib/branding";

export default function BiometricLockScreen() {
  const { isLocked, verifyBiometric, capabilities, removeBiometric } = useBiometric();
  const { user, signOut } = useAuth();
  const { employee, logout } = useEmployeeAuth();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // Auto-trigger on mount
  useEffect(() => {
    if (isLocked) {
      handleUnlock();
    }
  }, []);

  if (!isLocked) return null;

  const handleUnlock = async () => {
    setVerifying(true);
    setError(null);
    const success = await verifyBiometric();
    setVerifying(false);
    if (!success) {
      setAttempts(prev => prev + 1);
      setError(attempts >= 1 ? "Still not verified. Try again, or sign out and sign back in with your password." : "Verification failed. Please try again.");
    }
  };

  // Nothing in the app can turn this legacy lock off any more, so a device whose biometric
  // credential is gone must not be trapped: signing out ends the session and removes the lock.
  const signOutInstead = async () => {
    setLeaving(true);
    try {
      await Promise.all([user ? signOut() : Promise.resolve(), employee ? logout() : Promise.resolve()]);
    } finally {
      removeBiometric();
      setLeaving(false);
      navigate(employee && !user ? "/employee-login" : "/auth", { replace: true });
    }
  };

  const hasFace = capabilities?.biometricType.includes('face');
  const BiometricIcon = hasFace ? ScanFace : Fingerprint;
  const biometricLabel = hasFace ? 'Face ID' : 'Fingerprint / Biometric';

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl flex items-center justify-center">
      <div className="relative">
        {/* Animated background rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 rounded-full border border-primary/10 animate-pulse" />
          <div className="absolute w-48 h-48 rounded-full border border-primary/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute w-32 h-32 rounded-full border border-primary/30 animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 p-8 max-w-sm text-center">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <img 
              src={ADICORP_LOGO_PATH}
              alt="AdiCorp" 
              className="w-10 h-10 rounded-lg"
            />
            <div className="text-left">
              <h2 className="text-lg font-bold text-foreground">AdiCorp HR</h2>
              <p className="text-xs text-muted-foreground">App Locked</p>
            </div>
          </div>

          {/* Lock icon */}
          <div className="relative">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
              verifying 
                ? 'bg-primary/20 scale-110' 
                : error 
                  ? 'bg-destructive/10' 
                  : 'bg-primary/10'
            }`}>
              {verifying ? (
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              ) : (
                <Lock className={`h-10 w-10 transition-colors ${error ? 'text-destructive' : 'text-primary'}`} />
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-foreground mb-1">
              {verifying ? 'Verifying...' : 'Unlock Required'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Use {biometricLabel} to access the application
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg">{error}</p>
          )}

          <Button 
            size="lg" 
            onClick={handleUnlock} 
            disabled={verifying || leaving}
            className="w-full gap-2"
          >
            <BiometricIcon className="h-5 w-5" />
            {verifying ? 'Verifying...' : `Unlock with ${biometricLabel}`}
          </Button>

          {attempts > 0 && (
            <Button variant="ghost" size="sm" onClick={signOutInstead} disabled={verifying || leaving} className="gap-2 text-muted-foreground">
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
              Sign out instead
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            <ShieldCheck className="inline h-3 w-3 mr-1" />
            Protected by device biometric security
          </p>
        </div>
      </div>
    </div>
  );
}
