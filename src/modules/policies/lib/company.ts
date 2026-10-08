import { useAuth } from "@/context/AuthContext";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { todayIn } from "./letters";
import type { LetterheadCompany } from "./pdf";

/** Letterhead details of the signed-in staff member's company. */
export function useStaffLetterhead(): LetterheadCompany {
  const { company } = useAuth();
  return {
    name: company?.name ?? null,
    logo: company?.logo ?? null,
    address: company?.address ?? null,
    phone: company?.phone ?? null,
    website: company?.website ?? null,
    timezone: company?.timezone ?? null,
  };
}

/** Today (`yyyy-MM-dd`) in the staff member's company time zone, the calendar reply-by dates use. */
export function useCompanyToday(): string {
  const { company } = useAuth();
  return todayIn(company?.timezone);
}

/** Letterhead details of the signed-in employee's company (portal). */
export function usePortalLetterhead(): LetterheadCompany {
  const { company } = useEmployeeAuth();
  return {
    name: company?.name ?? null,
    logo: company?.logo ?? null,
    address: company?.address ?? null,
    phone: company?.phone ?? null,
    website: company?.website ?? null,
  };
}

/** Message of an unknown error, for toasts. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
