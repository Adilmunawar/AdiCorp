import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { db } from "@/integrations/supabase/client";
import { portalRpc, portalUpload } from "@/lib/portal";

/* ------------------------------------------------------------------ */
/* Types (shapes returned by the portal_* RPCs of this module)         */
/* ------------------------------------------------------------------ */

export interface HomeCelebration {
  employee_id: string;
  name: string;
  rank: string | null;
  avatar_url: string | null;
  kind: "birthday" | "anniversary" | "welcome";
  years: number | null;
  date: string;
  days_until: number;
  is_me: boolean;
}

export interface HomeLeaveBalance {
  leave_type_id: string;
  name: string;
  /** Leave kind (annual, sick, casual, unpaid, maternity, paternity, other). */
  kind?: string | null;
  is_paid: boolean | null;
  total: number;
  used: number;
  remaining: number;
  /** True for a type without a yearly cap (for example unpaid leave). */
  unlimited?: boolean;
}

export interface HomeAttention {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
}

export interface PortalHome {
  today: string;
  employee: {
    id: string;
    name: string;
    rank: string | null;
    employee_code: string | null;
    department: string | null;
    joining_date: string | null;
    avatar_url: string | null;
  };
  profile: { missing: string[]; pending_request: boolean };
  /**
   * Today's register row plus live time-clock punches (`first_in` / `last_out` as HH:MM in
   * company time, `punches`, `kind`), or null when nothing is recorded yet.
   */
  attendance_today:
    | ({ status?: string | null; date?: string; first_in?: string | null; last_out?: string | null; punches?: number } & Record<string, unknown>)
    | null;
  month: {
    start: string;
    present: number;
    absent: number;
    leave: number;
    short_leave: number;
    recorded: number;
    working_days_so_far: number;
    hours: number | null;
    expected_hours: number;
  };
  leave: { pending: number; balances: HomeLeaveBalance[] };
  payslip: { id: string; month: string; net_salary: number | null } | null;
  holidays: { id: string; title: string; date: string; type: string | null; description: string | null }[];
  celebrations: HomeCelebration[];
  announcements: { id: string; title: string; content: string | null; created_at: string }[];
  attention: HomeAttention[];
  unread_notifications: number;
}

/** Fields an employee may ask HR to change (applied by process_update_request). */
export const EDITABLE_FIELDS = [
  "father_name",
  "date_of_birth",
  "gender",
  "email",
  "phone",
  "emergency_contact",
  "address",
  "education",
  "bank_name",
  "bank_account_number",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ProfileChanges = Partial<Record<EditableField, string>>;

export const FIELD_LABELS: Record<EditableField, string> = {
  father_name: "Father's name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  email: "Email",
  phone: "Phone",
  emergency_contact: "Emergency contact",
  address: "Address",
  education: "Education",
  bank_name: "Bank name",
  bank_account_number: "Account number / IBAN",
};

export interface ProfileRequest {
  id: string;
  status: "pending" | "approved" | "rejected" | string;
  requested_changes: ProfileChanges;
  created_at: string;
  reviewed_at: string | null;
}

export interface PortalSessionRow {
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  current: boolean;
}

/** portal_me fields used by the profile page. */
export interface PortalProfile {
  id: string;
  company_id: string;
  employee_code: string | null;
  name: string;
  rank: string | null;
  department: string | null;
  status: string | null;
  joining_date: string | null;
  separation_date: string | null;
  email: string | null;
  phone: string | null;
  cnic: string | null;
  father_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  education: string | null;
  emergency_contact: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  avatar_url: string | null;
  shift_type: string | null;
  working_hours_per_day: number | null;
  /** The weekend that applies (own setting, else the company rule). */
  weekend_saturday: boolean | null;
  weekend_sunday: boolean | null;
  /** Company Saturday pattern when the employee follows the company rule. */
  saturday_pattern?: "all" | "alt_2_4" | "alt_1_3_5" | string | null;
  company?: { id: string; name: string; logo: string | null; currency: string | null };
}

/* ------------------------------------------------------------------ */
/* Query keys: module id, then company                                 */
/* ------------------------------------------------------------------ */

export const portalKeys = {
  all: (companyId: string | undefined) => ["portal", companyId ?? "none"] as const,
  home: (companyId: string | undefined, employeeId: string | undefined) => ["portal", companyId ?? "none", "home", employeeId] as const,
  me: (companyId: string | undefined, employeeId: string | undefined) => ["portal", companyId ?? "none", "me", employeeId] as const,
  requests: (companyId: string | undefined, employeeId: string | undefined) => ["portal", companyId ?? "none", "profile-requests", employeeId] as const,
  sessions: (companyId: string | undefined, employeeId: string | undefined) => ["portal", companyId ?? "none", "sessions", employeeId] as const,
};

function useIds() {
  const { employee } = useEmployeeAuth();
  return { employee, companyId: employee?.company_id, employeeId: employee?.id };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function usePortalHome() {
  const { companyId, employeeId } = useIds();
  return useQuery({
    queryKey: portalKeys.home(companyId, employeeId),
    enabled: !!employeeId,
    staleTime: 60_000,
    // Home summarises other pages (leave, punches, notifications): show the cache, then refresh
    // every time it is opened so a request sent a moment ago is never missing.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    // "Today" is the company's date, decided by the server (never the browser's timezone).
    queryFn: () => portalRpc<PortalHome>("portal_home"),
  });
}

export function usePortalProfile() {
  const { companyId, employeeId } = useIds();
  return useQuery({
    queryKey: portalKeys.me(companyId, employeeId),
    enabled: !!employeeId,
    queryFn: () => portalRpc<PortalProfile>("portal_me"),
  });
}

export function useProfileRequests() {
  const { companyId, employeeId } = useIds();
  return useQuery({
    queryKey: portalKeys.requests(companyId, employeeId),
    enabled: !!employeeId,
    queryFn: async () => (await portalRpc<ProfileRequest[] | null>("portal_profile_requests")) ?? [],
  });
}

export function usePortalSessions() {
  const { companyId, employeeId } = useIds();
  return useQuery({
    queryKey: portalKeys.sessions(companyId, employeeId),
    enabled: !!employeeId,
    queryFn: async () => (await portalRpc<PortalSessionRow[] | null>("portal_sessions")) ?? [],
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function useRequestProfileUpdate() {
  const { companyId, employeeId } = useIds();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: ProfileChanges) =>
      portalRpc<{ success: boolean; id: string; replaced: boolean; fields: ProfileChanges }>("portal_request_profile_update", { p_changes: changes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.requests(companyId, employeeId) });
      queryClient.invalidateQueries({ queryKey: portalKeys.home(companyId, employeeId) });
    },
  });
}

export function useWithdrawProfileRequest() {
  const { companyId, employeeId } = useIds();
  const queryClient = useQueryClient();
  const key = portalKeys.requests(companyId, employeeId);
  return useMutation({
    mutationFn: (id: string) => portalRpc("portal_withdraw_profile_request", { p_id: id }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ProfileRequest[]>(key);
      if (prev) queryClient.setQueryData(key, prev.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: portalKeys.home(companyId, employeeId) });
    },
  });
}

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Validates, uploads through portal-files, then points the profile at the new photo. */
export function useUpdateAvatar() {
  const { companyId } = useIds();
  const { updateEmployee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
      if (file.size > AVATAR_MAX_BYTES) throw new Error("The photo must be 5 MB or smaller.");
      const uploaded = (await portalUpload(file, "avatars", "avatar")) as { path: string; publicUrl?: string };
      const url = uploaded.publicUrl || db.storage.from("avatars").getPublicUrl(uploaded.path).data.publicUrl;
      const res = await portalRpc<{ avatar_url: string }>("portal_update_avatar", { p_path: uploaded.path, p_url: url });
      return res.avatar_url;
    },
    onSuccess: (avatarUrl) => {
      updateEmployee({ avatar_url: avatarUrl });
      queryClient.invalidateQueries({ queryKey: portalKeys.all(companyId) });
    },
  });
}

export function useRemoveAvatar() {
  const { companyId } = useIds();
  const { updateEmployee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => portalRpc("portal_remove_avatar"),
    onSuccess: () => {
      updateEmployee({ avatar_url: null });
      queryClient.invalidateQueries({ queryKey: portalKeys.all(companyId) });
    },
  });
}

export function useChangePassword() {
  const { companyId, employeeId } = useIds();
  const { updateEmployee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { current: string; next: string }) => portalRpc("portal_change_password", { p_old: vars.current, p_new: vars.next }),
    onSuccess: () => {
      updateEmployee({ needs_password_change: false });
      queryClient.invalidateQueries({ queryKey: portalKeys.sessions(companyId, employeeId) });
    },
  });
}

export function useSignOutOtherDevices() {
  const { companyId, employeeId } = useIds();
  const queryClient = useQueryClient();
  const key = portalKeys.sessions(companyId, employeeId);
  return useMutation({
    mutationFn: () => portalRpc<{ success: boolean; count: number }>("portal_sign_out_other_devices"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<PortalSessionRow[]>(key);
      if (prev) queryClient.setQueryData(key, prev.filter((s) => s.current));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Password rule shared with portal_change_password (8+ chars, letters and digits). */
export const PASSWORD_MIN = 8;
export function passwordIssue(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (pw.length > 72) return "Use 72 characters or fewer";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Mix letters and numbers";
  return null;
}
