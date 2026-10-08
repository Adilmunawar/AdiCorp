import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Eye, FileText, History, Lightbulb, Loader2, PenSquare, RotateCcw, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, PageHeader, SectionCard, StatusBadge, formatDate } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useDefaultReplyBy, useIssueLetter, useLetterEmployees, useLetterSettings, useLetters } from "../lib/api";
import { errorMessage, useCompanyToday, useStaffLetterhead } from "../lib/company";
import {
  LETTER_BODY_MAX,
  LETTER_BODY_MIN,
  LETTER_GROUPS,
  LETTER_KINDS,
  LETTER_SUBJECT_MAX,
  LETTER_SUBJECT_MIN,
  SEPARATED_KINDS,
  draftLetter,
  inZone,
  isDisciplinary,
  isLetterKind,
  kindInfo,
  kindTone,
  letterLabel,
  suggestedKind,
} from "../lib/letters";
import { placeholders } from "../lib/richText";
import type { LetterKind } from "../lib/types";
import { EmployeePicker } from "../components/EmployeePicker";
import { LetterPreview } from "../components/LetterPreview";
import { FormatHelp } from "../components/RichText";

export default function LetterComposerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { company } = useAuth();
  const letterhead = useStaffLetterhead();
  const employees = useLetterEmployees();
  const letters = useLetters();
  const settings = useLetterSettings();
  const defaultReplyBy = useDefaultReplyBy();
  const issue = useIssueLetter();

  const initialKind = params.get("kind");
  const [employeeId, setEmployeeId] = useState<string | null>(params.get("employee"));
  const [kind, setKind] = useState<LetterKind>(isLetterKind(initialKind) ? initialKind : "explanation");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [askReply, setAskReply] = useState(false);
  const [replyBy, setReplyBy] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [edited, setEdited] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<"write" | "preview">("write");
  const kindTouched = useRef(isLetterKind(initialKind));

  const employee = useMemo(() => employees.data?.find((e) => e.id === employeeId) ?? null, [employees.data, employeeId]);
  const history = useMemo(() => (letters.data ?? []).filter((l) => l.employee_id === employeeId), [letters.data, employeeId]);
  const suggestion = useMemo(() => (employeeId ? suggestedKind(history) : null), [employeeId, history]);
  const info = kindInfo(kind);
  const replyRequired = info.reply === "required";
  // Reply-by dates are days in the company's calendar (the server checks against the same day).
  const today = useCompanyToday();

  // Signatory from settings (remembered from the last letter).
  useEffect(() => {
    if (settings.data && !signatoryName && !signatoryTitle) {
      setSignatoryName(settings.data.signatory_name);
      setSignatoryTitle(settings.data.signatory_title);
    }
  }, [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reply-by defaults to three working days for explanation letters.
  useEffect(() => {
    if (info.reply === "required") setAskReply(true);
    else if (info.reply === "none") setAskReply(false);
    if (info.reply !== "none" && !replyBy && defaultReplyBy.data) setReplyBy(defaultReplyBy.data);
  }, [kind, defaultReplyBy.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick the suggested disciplinary step when an employee with history is chosen (unless HR chose a kind).
  useEffect(() => {
    if (!kindTouched.current && suggestion && history.some((h) => isDisciplinary(h.kind) && !h.withdrawn_at)) setKind(suggestion);
  }, [employeeId, suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const template = useMemo(
    () =>
      employee
        ? draftLetter(kind, {
            employeeName: employee.name,
            rank: employee.rank,
            department: employee.department?.name,
            cnic: employee.cnic,
            joiningDate: employee.joining_date,
            separationDate: employee.separation_date,
            companyName: company?.name ?? "",
            replyBy: askReply ? replyBy || null : null,
            history,
          })
        : null,
    [employee, kind, company?.name, askReply, replyBy, history],
  );

  // Keep the text in step with the template until HR edits it.
  useEffect(() => {
    if (template && !edited) {
      setSubject(template.subject);
      setBody(template.body);
    }
  }, [template, edited]);

  const resetToTemplate = () => {
    setEdited(false);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const chooseKind = (k: LetterKind) => {
    kindTouched.current = true;
    setKind(k);
  };

  const blanks = useMemo(() => placeholders(`${subject}\n${body}`), [subject, body]);
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!employee) out.push("Choose who the letter is for.");
    else if (employee.status !== "active" && !SEPARATED_KINDS.includes(kind)) out.push(`${employee.name} is not an active employee. Only experience and relieving letters can be issued to them.`);
    const s = subject.trim();
    if (s.length < LETTER_SUBJECT_MIN || s.length > LETTER_SUBJECT_MAX) out.push("The subject should be between 5 and 160 characters.");
    if (body.trim().length < LETTER_BODY_MIN) out.push("Write the letter first (at least a few sentences).");
    if (blanks.length) out.push(`Fill in everything in square brackets: ${blanks.slice(0, 3).join(", ")}${blanks.length > 3 ? ` and ${blanks.length - 3} more` : ""}.`);
    if ((replyRequired || askReply) && (!replyBy || replyBy < today)) out.push(replyRequired ? "An explanation letter needs a date to reply by, today or later." : "Choose a reply-by date, today or later.");
    if (signatoryName.trim().length < 2 || signatoryTitle.trim().length < 2) out.push("Say who signs the letter: a name and a designation.");
    return out;
  }, [employee, kind, subject, body, blanks, replyRequired, askReply, replyBy, today, signatoryName, signatoryTitle]);

  const doIssue = async () => {
    if (!employee) return;
    try {
      const r = await issue.mutateAsync({
        employeeId: employee.id,
        kind,
        subject: subject.trim(),
        body: body.trim(),
        replyBy: replyRequired || askReply ? replyBy : null,
        signatoryName: signatoryName.trim(),
        signatoryTitle: signatoryTitle.trim(),
      });
      toast.success(`Letter ${r.ref} issued`, { description: `${employee.name} has been notified in the portal.` });
      navigate(`/letters/${r.id}`, { replace: true });
    } catch (err) {
      toast.error("Could not issue the letter", { description: errorMessage(err) });
      throw err;
    }
  };

  const nextRef = settings.data?.next_ref ?? "—";

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-xs text-muted-foreground">
        <Link to="/letters">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Letters
        </Link>
      </Button>
      <PageHeader
        icon={PenSquare}
        eyebrow="New letter"
        title="Write a letter"
        description="Issued letters cannot be edited. The employee is notified in the portal."
        actions={
          <div className="flex rounded-lg border border-border p-0.5 xl:hidden" role="tablist" aria-label="Composer view">
            {(["write", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-3 py-1 text-xs font-semibold capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn("min-w-0 space-y-4", view === "preview" && "hidden xl:block")}>
          <SectionCard title="Recipient and kind" icon={UserRound}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lc-employee">Employee</Label>
                <EmployeePicker
                  id="lc-employee"
                  employees={employees.data ?? []}
                  value={employeeId}
                  onChange={(id) => {
                    setEmployeeId(id);
                    setEdited(false);
                  }}
                  disabled={employees.isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-kind">Kind of letter</Label>
                <Select value={kind} onValueChange={(v) => chooseKind(v as LetterKind)}>
                  <SelectTrigger id="lc-kind" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LETTER_GROUPS.map((g) => (
                      <SelectGroup key={g}>
                        <SelectLabel className="micro-label">{g}</SelectLabel>
                        {LETTER_KINDS.filter((k) => k.group === g).map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{info.description}</p>
              </div>

              {employee && suggestion && isDisciplinary(kind) && suggestion !== kind && (
                <button
                  type="button"
                  onClick={() => chooseKind(suggestion)}
                  className="flex w-full items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-left text-xs transition-colors hover:bg-primary/10"
                >
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-semibold text-foreground">Suggested next step: {letterLabel(suggestion)}.</span>{" "}
                    <span className="text-muted-foreground">Based on {employee.name.split(" ")[0]}'s letters in the last 12 months. Click to use it.</span>
                  </span>
                </button>
              )}

              {employee && (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-primary" aria-hidden />
                    <p className="micro-label">Letters to {employee.name.split(" ")[0]}</p>
                  </div>
                  {history.length ? (
                    <ul className="space-y-1.5">
                      {history.slice(0, 5).map((h) => (
                        <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
                          <Link to={`/letters/${h.id}`} className="min-w-0 truncate font-medium text-foreground hover:text-primary">
                            <span className="font-mono text-[11px] text-muted-foreground">{h.ref}</span> {h.subject}
                          </Link>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {h.withdrawn_at ? (
                              <StatusBadge status="withdrawn" label="Withdrawn" tone="neutral" dot={false} />
                            ) : (
                              <StatusBadge status={h.kind} label={letterLabel(h.kind)} tone={kindTone(h.kind)} dot={false} />
                            )}
                            <span className="hidden text-[11px] text-muted-foreground sm:inline">{formatDate(inZone(h.issued_at, letterhead.timezone), "dd MMM yy")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No letters yet.</p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="The letter"
            icon={FileText}
            actions={
              edited && template ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={resetToTemplate}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Use the {letterLabel(kind).toLowerCase()} template
                </Button>
              ) : null
            }
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lc-subject">Subject</Label>
                <Input
                  id="lc-subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setEdited(true);
                  }}
                  maxLength={LETTER_SUBJECT_MAX}
                  disabled={!employee}
                  placeholder={employee ? "Subject of the letter" : "Choose an employee first"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lc-body">Text</Label>
                <Textarea
                  id="lc-body"
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setEdited(true);
                  }}
                  maxLength={LETTER_BODY_MAX}
                  disabled={!employee}
                  rows={12}
                  placeholder={employee ? "Write the letter…" : "The template for this kind of letter appears here once you choose an employee."}
                  className="min-h-[240px] rounded-xl text-[13px] leading-relaxed"
                />
                <FormatHelp />
              </div>

              {info.reply === "optional" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={askReply} onCheckedChange={(v) => setAskReply(v === true)} />
                  Ask for a reply by a date
                </label>
              )}
              {(replyRequired || askReply) && (
                <div className="space-y-1.5">
                  <Label htmlFor="lc-reply">Reply by</Label>
                  <Input id="lc-reply" type="date" min={today} value={replyBy} onChange={(e) => setReplyBy(e.target.value)} className="h-10 w-full rounded-xl sm:w-52" />
                  {replyRequired && <p className="text-[11px] text-muted-foreground">Three company working days from tomorrow by default, skipping weekends and holidays.</p>}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lc-sig-name">Signed by</Label>
                  <Input id="lc-sig-name" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} maxLength={80} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lc-sig-title">Designation</Label>
                  <Input id="lc-sig-title" value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} maxLength={80} />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className={cn("min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start", view === "write" && "hidden xl:block")}>
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="micro-label">Preview</span>
          </div>
          <LetterPreview
            draft
            company={letterhead}
            refNo={`${nextRef} (next)`}
            kind={kind}
            subject={subject}
            body={body}
            replyBy={replyRequired || askReply ? replyBy || null : null}
            signatoryName={signatoryName}
            signatoryTitle={signatoryTitle}
            employeeName={employee?.name ?? ""}
            employeeMeta={employee ? [employee.rank, employee.department?.name, employee.employee_code ? `Employee ID ${employee.employee_code}` : null].filter(Boolean).join(" · ") : null}
            className="xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto"
          />
        </div>
      </div>

      <SectionCard className="sticky bottom-2 z-10 shadow-md" contentClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {problems.length ? (
            <p className="flex items-start gap-1.5 text-xs text-foreground" role="status">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <span>{problems[0]}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ready to issue as <span className="font-mono font-semibold text-foreground">{nextRef}</span>.
            </p>
          )}
          <Button className="gap-1.5 rounded-xl" onClick={() => setConfirming(true)} disabled={!!problems.length || issue.isPending}>
            {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Issue letter
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive={false}
        title={`Issue this ${letterLabel(kind).toLowerCase()} to ${employee?.name ?? "the employee"}?`}
        description="It gets the next reference number and cannot be changed afterwards. The employee is notified in the portal. If it was issued in error, you can withdraw it; it stays on record."
        confirmLabel="Issue letter"
        onConfirm={doIssue}
      />
    </div>
  );
}
