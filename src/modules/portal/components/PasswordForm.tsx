import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PASSWORD_MIN, passwordIssue, useChangePassword } from "../api";

interface PasswordFormProps {
  /** Shown as the username for password managers. */
  username: string;
  onDone?: () => void;
}

function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= PASSWORD_MIN) score++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score++;
  if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too weak", "Weak", "Good", "Strong"];
  return { score: score as 0 | 1 | 2 | 3, label: labels[score] };
}

/** Inline change-password form (portal_change_password). Other devices are signed out by the server. */
export function PasswordForm({ username, onDone }: PasswordFormProps) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const issue = next ? passwordIssue(next) : null;
  const meter = strength(next);
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return toast.error("Enter your current password");
    const problem = passwordIssue(next);
    if (problem) return toast.error(problem);
    if (next !== confirm) return toast.error("The new passwords do not match");
    if (next === current) return toast.error("Choose a password different from your current one");
    change.mutate(
      { current, next },
      {
        onSuccess: () => {
          toast.success("Password updated", { description: "Other devices have been signed out." });
          setCurrent("");
          setNext("");
          setConfirm("");
          onDone?.();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update your password"),
      },
    );
  };

  const type = show ? "text" : "password";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <div className="space-y-1.5">
        <Label htmlFor="pf-current" className="text-xs font-semibold">Current password</Label>
        <Input id="pf-current" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-10 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-new" className="text-xs font-semibold">New password</Label>
          <div className="relative">
            <Input
              id="pf-new"
              type={type}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="pf-new-hint"
              aria-invalid={!!issue}
              className="h-10 rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-1 pt-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full bg-muted transition-colors",
                  meter.score >= i && (meter.score === 1 ? "bg-destructive" : meter.score === 2 ? "bg-warning" : "bg-success"),
                )}
              />
            ))}
          </div>
          <p id="pf-new-hint" className={cn("text-[11px]", issue ? "text-warning" : "text-muted-foreground")}>
            {issue ?? (meter.label ? `${meter.label} password` : `At least ${PASSWORD_MIN} characters with letters and numbers.`)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-confirm" className="text-xs font-semibold">Confirm new password</Label>
          <Input
            id="pf-confirm"
            type={type}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            className="h-10 rounded-xl"
          />
          {mismatch && <p className="text-[11px] text-destructive">The passwords do not match.</p>}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">Changing your password signs you out on every other device.</p>
        <Button type="submit" disabled={change.isPending} className="h-10 rounded-xl px-5">
          {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </div>
    </form>
  );
}
