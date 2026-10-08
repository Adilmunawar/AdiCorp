
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { getAuthRedirectUrl } from "@/lib/authRedirect";

interface ForgotPasswordFormProps { onBack: () => void; }

export default function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(""); const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl("/auth?mode=reset") }); if (error) throw error; setSuccess(true); }
    catch (err) { setError((err as { message?: string } | null)?.message || "Failed to send reset email"); } finally { setLoading(false); }
  };

  if (success) {
    return (
      <Card className="glass-card w-full max-w-md mx-auto">
        <CardHeader className="text-center"><CardTitle className="flex items-center justify-center gap-2"><CheckCircle className="h-6 w-6 text-green-600" />Check Your Email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-500/20 bg-green-500/10"><Mail className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-600">We've sent a password reset link to <strong>{email}</strong>.</AlertDescription></Alert>
          <Button onClick={onBack} variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to Sign In</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card w-full max-w-md mx-auto">
      <CardHeader className="text-center"><CardTitle className="flex items-center justify-center gap-2"><Mail className="h-6 w-6" />Forgot Password</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (<Alert className="border-red-500/20 bg-red-500/10"><AlertDescription className="text-destructive">{error}</AlertDescription></Alert>)}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-3">
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Sending..." : "Send Reset Link"}</Button>
            <Button type="button" onClick={onBack} variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to Sign In</Button>
          </div>
        </form>
        <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Enter your email address and we'll send you a link to reset your password.</p>
        </div>
      </CardContent>
    </Card>
  );
}
