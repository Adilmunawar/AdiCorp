import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CV_ACCEPT, CV_MAX_BYTES, EMAIL_RE, LINK_RE, PHONE_RE, formatBytes } from "../lib/model";
import { submitApplication } from "./publicApi";

type Status = "idle" | "sending" | "sent" | "error";

/** Public application form. Validates in the browser; the Edge Function and database check everything again. */
export function ApplyForm({ jobId, jobTitle, companyName }: { jobId: string; jobTitle: string; companyName: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [messageLength, setMessageLength] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const link = String(data.get("link") ?? "").trim();
    const fail = (message: string) => {
      setStatus("error");
      setError(message);
    };
    if (name.length < 2) return fail("Tell us your name.");
    if (!EMAIL_RE.test(email)) return fail("That e-mail address does not look right.");
    if (!PHONE_RE.test(phone)) return fail("That phone number does not look right.");
    if (link && !LINK_RE.test(link)) return fail("The link must start with http:// or https://.");
    if (!file) return fail("Attach your CV as a PDF or Word file.");
    if (file.size > CV_MAX_BYTES) return fail(`Your CV is ${formatBytes(file.size)}; the limit is ${formatBytes(CV_MAX_BYTES)}.`);
    if (!/\.(pdf|docx?)$/i.test(file.name)) return fail("The CV must be a PDF, .doc or .docx file.");

    data.set("job_id", jobId);
    data.set("cv", file);
    setStatus("sending");
    setError(null);
    try {
      await submitApplication(data);
      setStatus("sent");
      form.reset();
      setFile(null);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Your application could not be sent.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-success/25 bg-card p-6 shadow-sm" role="status" aria-live="polite">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="mt-4 font-display text-xl font-bold">Application received.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Thank you for applying for {jobTitle}. The {companyName} team reads every application and will reply by e-mail or phone.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-label={`Apply for ${jobTitle}`}>
      <p className="micro-label text-primary">Apply</p>
      <h3 className="mt-1 font-display text-xl font-bold leading-snug">{jobTitle}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Four fields and your CV. Your details are used only to get back to you about this role.</p>

      <div className="mt-5 grid gap-4">
        <div>
          <Label htmlFor="apply-name">Full name</Label>
          <Input id="apply-name" name="name" className="mt-1.5" required minLength={2} maxLength={80} autoComplete="name" placeholder="Your name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <Label htmlFor="apply-email">E-mail</Label>
            <Input id="apply-email" name="email" type="email" className="mt-1.5" required maxLength={120} autoComplete="email" placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="apply-phone">Phone</Label>
            <Input id="apply-phone" name="phone" type="tel" className="mt-1.5" required maxLength={40} autoComplete="tel" placeholder="+92 3xx xxxxxxx" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="apply-link">LinkedIn or portfolio</Label>
            <span className="text-[11px] text-muted-foreground">optional</span>
          </div>
          <Input id="apply-link" name="link" type="url" className="mt-1.5" maxLength={300} autoComplete="url" placeholder="https://" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="apply-cv">CV</Label>
            <span className="text-[11px] text-muted-foreground">PDF or Word, up to 5 MB</span>
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={cn(
              "mt-1.5 flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed px-3 text-left text-sm transition-colors hover:border-primary",
              file ? "border-primary/40 bg-primary/[0.04] text-foreground" : "border-input text-muted-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file"}</span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">Browse</span>
          </button>
          <input
            ref={fileInput}
            id="apply-cv"
            type="file"
            accept={CV_ACCEPT}
            className="sr-only"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="apply-message">A short note</Label>
            <span className="text-[11px] text-muted-foreground">{messageLength ? `${messageLength}/1000` : "optional"}</span>
          </div>
          <Textarea
            id="apply-message"
            name="cover_letter"
            rows={3}
            maxLength={1000}
            className="mt-1.5"
            placeholder="Anything the CV does not say."
            onChange={(e) => setMessageLength(e.target.value.length)}
          />
        </div>
        {/* Honeypot for bots; hidden from people and assistive tech. */}
        <div className="hidden" aria-hidden>
          <label htmlFor="apply-website">Website</label>
          <input id="apply-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {status === "error" && error && (
        <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-5 w-full" disabled={status === "sending"}>
        <Send className="mr-2 h-4 w-4" />
        {status === "sending" ? "Sending…" : "Send application"}
      </Button>
      <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">Your CV is stored privately and seen only by the hiring team at {companyName}.</p>
    </form>
  );
}
