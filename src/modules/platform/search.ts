import { BarChart3, Building2, CalendarRange, Database, FilePenLine, History, KeyRound, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { db } from "@/integrations/supabase/client";
import { humanize } from "@/components/kit/format";
import type { SearchCommand, SearchSource } from "@/modules/types";
// Circular (the registry imports this file), which is safe: adminNav is only read at search time.
import { adminNav } from "@/modules/registry";

/** Strip characters that have meaning in a PostgREST `or=` filter. */
function safeTerm(q: string): string {
  return q.replace(/[,()*%\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** The people module's list route. */
async function peopleHref(): Promise<string> {
  return adminNav.find((n) => n.key.startsWith("people."))?.href ?? "/employees";
}

export const platformSearch: SearchSource[] = [
  {
    id: "platform.employees",
    label: "Employees",
    roles: ["owner", "hr", "finance"],
    search: async ({ query, companyId }) => {
      const term = safeTerm(query);
      if (term.length < 2) return [];
      const digits = term.replace(/\D/g, "");
      const filters = [`name.ilike.*${term}*`, `employee_code.ilike.*${term}*`, `rank.ilike.*${term}*`];
      if (digits.length >= 4) {
        // CNICs are stored as 12345-1234567-1: match a run of digits inside one part, and a number
        // typed from the start with or without its dashes.
        filters.push(`cnic.ilike.*${digits}*`);
        if (digits.length > 5) {
          const dashed = [digits.slice(0, 5), digits.slice(5, 12), digits.slice(12)].filter(Boolean).join("-");
          filters.push(`cnic.ilike.${dashed}*`);
        }
      }
      const { data, error } = await db
        .from("employees")
        .select("id, name, rank, employee_code, status")
        .eq("company_id", companyId)
        .or(filters.join(","))
        .order("status", { ascending: true })
        .order("name", { ascending: true })
        .limit(8);
      if (error) throw error;
      const base = await peopleHref();
      return ((data ?? []) as { id: string; name: string; rank: string | null; employee_code: string | null; status: string }[]).map((e) => ({
        id: `employee:${e.id}`,
        title: e.name,
        subtitle: [e.employee_code, e.rank, e.status === "active" ? null : e.status === "separated" || e.status === "terminated" ? "Separated" : humanize(e.status)]
          .filter(Boolean)
          .join(" · "),
        href: `${base}/${e.id}`,
        icon: UserRound,
      }));
    },
  },
];

export const platformCommands: SearchCommand[] = [
  { id: "platform.add-member", label: "Add a team member", href: "/users", icon: UserPlus, roles: ["owner"], keywords: ["invite", "staff", "hr", "finance", "user"] },
  { id: "platform.company", label: "Company profile and logo", href: "/settings?tab=company", icon: Building2, roles: ["owner"], keywords: ["currency", "slug", "timezone", "brand"] },
  { id: "platform.workweek", label: "Working week and Saturdays", href: "/settings?tab=workweek", icon: CalendarRange, roles: ["owner", "hr"], keywords: ["weekend", "hours", "threshold", "saturday"] },
  { id: "platform.letters", label: "Letter signatory and reference prefix", href: "/settings?tab=preferences", icon: FilePenLine, roles: ["owner", "hr"], keywords: ["notifications", "push", "letters"] },
  { id: "platform.backup", label: "Download a backup", href: "/settings?tab=backups", icon: Database, roles: ["owner", "hr"], keywords: ["export", "json", "data"] },
  { id: "platform.staff-mfa", label: "Require two-step verification for staff", href: "/settings?tab=security", icon: ShieldCheck, roles: ["owner"], keywords: ["2fa", "mfa", "security"] },
  { id: "platform.my-mfa", label: "Set up my authenticator app", href: "/account?tab=security", icon: ShieldCheck, roles: ["owner", "hr", "finance"], keywords: ["2fa", "mfa", "otp"] },
  { id: "platform.password", label: "Change my password", href: "/account?tab=security", icon: KeyRound, roles: ["owner", "hr", "finance"], keywords: ["security", "account"] },
  { id: "platform.headcount", label: "Headcount report", href: "/reports?tab=headcount", icon: BarChart3, roles: ["owner", "hr", "finance"], keywords: ["joiners", "leavers", "departments"] },
  { id: "platform.attendance-report", label: "Attendance report", href: "/reports?tab=attendance", icon: BarChart3, roles: ["owner", "hr", "finance"], keywords: ["absent", "present", "percentage"] },
  { id: "platform.leave-report", label: "Leave usage report", href: "/reports?tab=leave", icon: BarChart3, roles: ["owner", "hr", "finance"], keywords: ["balance", "used"] },
  { id: "platform.timeline", label: "Timeline of changes", href: "/timeline", icon: History, roles: ["owner", "hr", "finance"], keywords: ["audit", "activity", "log"] },
];
