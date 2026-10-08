import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import type { BadgeTone } from "@/components/kit";
import type { LetterKind, LetterRow } from "./types";

export type LetterGroup = "Disciplinary" | "Recognition" | "Employment" | "Separation" | "Other";

export interface LetterKindInfo {
  value: LetterKind;
  label: string;
  group: LetterGroup;
  description: string;
  /** A reply-by date is required (explanation) or offered by default. */
  reply: "required" | "optional" | "none";
}

export const LETTER_KINDS: LetterKindInfo[] = [
  { value: "explanation", label: "Explanation letter", group: "Disciplinary", description: "Asks for the employee's side by a date.", reply: "required" },
  { value: "warning", label: "Warning letter", group: "Disciplinary", description: "A formal written warning.", reply: "none" },
  { value: "final", label: "Final warning", group: "Disciplinary", description: "The last step before termination.", reply: "none" },
  { value: "appreciation", label: "Appreciation letter", group: "Recognition", description: "Thanks the employee for a contribution.", reply: "none" },
  { value: "promotion", label: "Promotion letter", group: "Recognition", description: "Confirms a new designation (no amounts).", reply: "none" },
  { value: "increment", label: "Increment letter", group: "Recognition", description: "Notifies a salary revision. Amounts are shared by Finance.", reply: "none" },
  { value: "appointment", label: "Appointment letter", group: "Employment", description: "Confirms the appointment and asks for acceptance.", reply: "optional" },
  { value: "confirmation", label: "Confirmation letter", group: "Employment", description: "Confirms employment after probation.", reply: "none" },
  { value: "transfer", label: "Transfer letter", group: "Employment", description: "Moves the employee to a team or location.", reply: "none" },
  { value: "experience", label: "Experience certificate", group: "Separation", description: "Certifies the period and role of employment.", reply: "none" },
  { value: "relieving", label: "Relieving letter", group: "Separation", description: "Confirms the last working day.", reply: "none" },
  { value: "general", label: "General letter", group: "Other", description: "Anything else, written from scratch.", reply: "optional" },
];

export const LETTER_GROUPS: LetterGroup[] = ["Disciplinary", "Recognition", "Employment", "Separation", "Other"];

const DISCIPLINARY: LetterKind[] = ["explanation", "warning", "final"];
/** Kinds that may be issued to someone who has already left. */
export const SEPARATED_KINDS: LetterKind[] = ["experience", "relieving"];

export function kindInfo(kind: string): LetterKindInfo {
  return LETTER_KINDS.find((k) => k.value === kind) ?? LETTER_KINDS[LETTER_KINDS.length - 1];
}

export function letterLabel(kind: string): string {
  return kindInfo(kind).label;
}

export function isLetterKind(value: unknown): value is LetterKind {
  return LETTER_KINDS.some((k) => k.value === value);
}

export function isDisciplinary(kind: string): boolean {
  return DISCIPLINARY.includes(kind as LetterKind);
}

export const kindTone = (kind: string): BadgeTone =>
  kind === "final" ? "danger" : kind === "warning" ? "warning" : kind === "explanation" ? "info" : kindInfo(kind).group === "Recognition" ? "success" : "primary";

/* ------------------------------------------------------------------ status */

/** `no_portal`: not acknowledged, and the employee is no longer active, so cannot open the portal to do it. */
export type LetterStatus = "withdrawn" | "replied" | "overdue" | "received" | "no_portal" | "unread";

export const LETTER_STATUS_LABEL: Record<LetterStatus, string> = {
  unread: "Not yet received",
  received: "Received",
  overdue: "Reply overdue",
  replied: "Replied",
  no_portal: "No portal access",
  withdrawn: "Withdrawn",
};

export const LETTER_STATUS_TONE: Record<LetterStatus, BadgeTone> = {
  unread: "warning",
  received: "info",
  overdue: "danger",
  replied: "success",
  no_portal: "neutral",
  withdrawn: "neutral",
};

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The wall-clock time of an instant in a time zone (the company's), as a local Date that
 * date-fns can format. Plain `yyyy-MM-dd` values are calendar days already and are kept as
 * they are. Without a zone, or with one the browser does not know, the browser's zone is used.
 */
export function inZone(value: Date | string, timeZone?: string | null): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parseISO(value);
  const d = typeof value === "string" ? parseISO(value) : value;
  if (!timeZone || Number.isNaN(d.getTime())) return d;
  try {
    let formatter = zoneFormatters.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      zoneFormatters.set(timeZone, formatter);
    }
    const parts: Record<string, number> = {};
    for (const p of formatter.formatToParts(d)) if (p.type !== "literal") parts[p.type] = Number(p.value);
    return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  } catch {
    return d;
  }
}

/** Today (`yyyy-MM-dd`) in a time zone; reply-by dates are days in the company's calendar. */
export function todayIn(timeZone?: string | null): string {
  return format(inZone(new Date(), timeZone), "yyyy-MM-dd");
}

type StatusFields = Pick<LetterRow, "withdrawn_at" | "replied_at" | "reply_by" | "acknowledged_at">;

/**
 * Where a letter stands. `employeeStatus` is the recipient's employee status when known: only
 * active employees can sign in to the portal, so a letter to someone who has left (an experience
 * or relieving letter) can never be acknowledged there and is not "waiting" for them.
 */
export function letterStatus(l: StatusFields, today = todayIn(), employeeStatus?: string | null): LetterStatus {
  if (l.withdrawn_at) return "withdrawn";
  if (l.replied_at) return "replied";
  if (l.reply_by && l.reply_by < today) return "overdue";
  if (l.acknowledged_at) return "received";
  if (employeeStatus && employeeStatus !== "active") return "no_portal";
  return "unread";
}

/** "Due in 2 days", "Due today", "3 days overdue" (`today` is `yyyy-MM-dd`, the company's day when known). */
export function replyByHint(replyBy: string | null, today = todayIn()): string | null {
  if (!replyBy) return null;
  const days = differenceInCalendarDays(parseISO(replyBy), parseISO(today));
  if (days > 1) return `Due in ${days} days`;
  if (days === 1) return "Due tomorrow";
  if (days === 0) return "Due today";
  return `${-days} ${days === -1 ? "day" : "days"} overdue`;
}

/* --------------------------------------------------------------- suggestion */

type HistoryRow = Pick<LetterRow, "kind" | "issued_at" | "withdrawn_at" | "ref">;

/** Usual next disciplinary step after this person's letters in the last year. */
export function suggestedKind(history: HistoryRow[], today = new Date()): LetterKind {
  const since = subDays(today, 365).getTime();
  const kinds = history.filter((l) => !l.withdrawn_at && parseISO(l.issued_at).getTime() >= since).map((l) => l.kind);
  if (kinds.includes("warning") || kinds.includes("final")) return "final";
  if (kinds.includes("explanation")) return "warning";
  return "explanation";
}

/**
 * " This follows the warning letter of 02 Oct 2026 (NOP/HR/2026/0003)." The dates are the days the
 * earlier letters are dated on their letterhead, in the company's time zone.
 */
export function priorLine(history: HistoryRow[], timeZone?: string | null): string {
  const prior = history.filter((l) => !l.withdrawn_at && isDisciplinary(l.kind)).slice(0, 2);
  if (!prior.length) return "";
  return ` This follows ${prior
    .map((l) => `the ${letterLabel(l.kind).toLowerCase()} of ${format(inZone(l.issued_at, timeZone), "dd MMM yyyy")} (${l.ref})`)
    .join(" and ")}.`;
}

/* ---------------------------------------------------------------- templates */

export interface TemplateContext {
  employeeName: string;
  rank?: string | null;
  department?: string | null;
  cnic?: string | null;
  joiningDate?: string | null;
  separationDate?: string | null;
  companyName: string;
  replyBy?: string | null;
  history: HistoryRow[];
  /** The company's time zone, for the dates of earlier letters. */
  timeZone?: string | null;
}

/** A calendar day (`yyyy-MM-dd`) as written in letter text: "13 October 2026". */
export function letterDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "dd MMMM yyyy");
}

const day = letterDay;

/**
 * A ready-to-edit letter for this kind. Anything HR still has to decide is in
 * [square brackets]; issuing is refused while any are left.
 */
export function draftLetter(kind: LetterKind, ctx: TemplateContext): { subject: string; body: string } {
  const first = ctx.employeeName.trim().split(/\s+/)[0] || ctx.employeeName;
  const company = ctx.companyName || "the company";
  const rank = ctx.rank?.trim() || "[designation]";
  const team = ctx.department?.trim() || "[department]";
  const joined = day(ctx.joiningDate) ?? "[joining date]";
  const left = day(ctx.separationDate) ?? "[last working day]";
  const replyBy = day(ctx.replyBy) ?? "[reply-by date]";
  const prior = priorLine(ctx.history, ctx.timeZone);
  const p = (...parts: string[]) => parts.filter(Boolean).join("\n\n");

  switch (kind) {
    case "explanation":
      return {
        subject: "Explanation required: [what it is about]",
        body: p(
          `Dear ${first},`,
          "[Describe what happened, when, and which rule or expectation it concerns.]",
          `Please give your explanation in the employee portal by ${replyBy}. If there is something we should take into account, include it in your reply so that the record is complete.`,
        ),
      };
    case "warning":
      return {
        subject: "Warning: [what it is about]",
        body: p(
          `Dear ${first},`,
          "[Describe what happened, when, and which rule or expectation it concerns.]",
          `This letter is a formal written warning.${prior} If this happens again, further disciplinary action may follow, in line with the Code of Conduct.`,
          "Please acknowledge this letter in the employee portal. If you wish to respond, you can reply there.",
        ),
      };
    case "final":
      return {
        subject: "Final warning: [what it is about]",
        body: p(
          `Dear ${first},`,
          "[Describe what happened, when, and which rule or expectation it concerns.]",
          `This is a final written warning.${prior} Any further breach may lead to the termination of your employment, in line with the Code of Conduct.`,
          "Please acknowledge this letter in the employee portal. If you wish to respond, you can reply there.",
        ),
      };
    case "appreciation":
      return {
        subject: "Appreciation: [what it is for]",
        body: p(
          `Dear ${first},`,
          `On behalf of ${company}, I would like to thank you for [describe the achievement or contribution].`,
          `Your commitment and professionalism made a real difference to [the team, the client or the project]. Contributions like yours set the standard we want for everyone at ${company}.`,
          "This letter will be kept on your personnel file. Thank you, and keep up the excellent work.",
        ),
      };
    case "appointment":
      return {
        subject: `Appointment as ${rank}`,
        body: p(
          `Dear ${first},`,
          `We are pleased to confirm your appointment as **${rank}** in the ${team} team at ${company}, with effect from ${joined}.`,
          "Your terms of employment, including your working hours, probation period and benefits, are set out in your employment contract and in the company policies, which you can read and sign in the employee portal.",
          "Please confirm your acceptance by acknowledging this letter in the employee portal. We look forward to working with you.",
        ),
      };
    case "confirmation":
      return {
        subject: "Confirmation of employment",
        body: p(
          `Dear ${first},`,
          `We are pleased to inform you that you have successfully completed your probation period. Your employment as **${rank}** is confirmed with effect from [date].`,
          `All other terms of your employment remain unchanged. We appreciate your contribution so far and look forward to your continued success at ${company}.`,
        ),
      };
    case "promotion":
      return {
        subject: "Promotion to [new designation]",
        body: p(
          `Dear ${first},`,
          "We are delighted to inform you that you have been promoted to **[new designation]** with effect from [date].",
          "This promotion recognises your performance and your contribution to the team. In your new role you will [describe the main responsibilities] and report to [name, designation].",
          "Any change to your pay will be shared with you separately by Finance. All other terms of your employment remain unchanged.",
          "Congratulations, and thank you for your hard work.",
        ),
      };
    case "increment":
      return {
        subject: "Salary revision",
        body: p(
          `Dear ${first},`,
          "We are pleased to inform you that your salary has been revised with effect from [date], in recognition of your performance and contribution during the review period.",
          "The revised figures will be shared with you by Finance and will appear on your payslip from that month. All other terms of your employment remain unchanged.",
          `Thank you for your continued commitment to ${company}.`,
        ),
      };
    case "transfer":
      return {
        subject: "Transfer to [department or location]",
        body: p(
          `Dear ${first},`,
          "This is to inform you that you are being transferred to [department or location] with effect from [date]. You will report to [name, designation].",
          "[Explain the reason for the transfer and any arrangements, such as the handover of your current work.]",
          "All other terms of your employment remain unchanged. Please acknowledge this letter in the employee portal.",
        ),
      };
    case "experience":
      return {
        subject: "Experience certificate",
        body: p(
          "To whom it may concern,",
          `This is to certify that **${ctx.employeeName}**${ctx.cnic ? `, CNIC ${ctx.cnic},` : ""} worked at ${company} as **${rank}** in the ${team} team from ${joined} to ${left}.`,
          `During this period ${first} was diligent, reliable and professional. [Add a sentence about the main responsibilities.]`,
          `We wish ${first} every success in the future.`,
        ),
      };
    case "relieving":
      return {
        subject: "Relieving letter",
        body: p(
          `Dear ${first},`,
          `This is to confirm that your resignation has been accepted and that you are relieved of your duties at ${company} at the close of business on ${left}.`,
          "Your full and final settlement will be processed by Finance in line with company policy. Please make sure that all company property issued to you has been returned.",
          "We thank you for your contribution and wish you every success in the future.",
        ),
      };
    default:
      return {
        subject: "[Subject]",
        body: p(`Dear ${first},`, "[Write the letter here.]"),
      };
  }
}

export const LETTER_SUBJECT_MIN = 5;
export const LETTER_SUBJECT_MAX = 160;
export const LETTER_BODY_MIN = 40;
export const LETTER_BODY_MAX = 20_000;
export const REPLY_MIN = 5;
export const REPLY_MAX = 5_000;
