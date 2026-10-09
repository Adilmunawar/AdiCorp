import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyRow, ProfileRow } from "@/types/supabase";
import { getAuthRedirectUrl } from "@/lib/authRedirect";
import { setCompanyTimeZone } from "@/components/kit/format";
import type { Role } from "@/modules/types";

export type StaffProfile = ProfileRow & { role: Role | null };
export type Company = CompanyRow;

/** @deprecated legacy shape (profile + nested company). Use `profile` and `company`. */
export type LegacyUserProfile = StaffProfile & { companies?: CompanyRow | null };

export interface SignUpMetadata {
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** True until the session and (when signed in) the profile and company have loaded. */
  loading: boolean;
  /** Set when the profile could not be loaded (network or permissions). */
  profileError: Error | null;
  profile: StaffProfile | null;
  company: Company | null;
  companyId: string | null;
  role: Role | null;
  /** role === 'owner' */
  isOwner: boolean;
  /** owner or hr (mirrors public.auth_is_hr()) */
  isHR: boolean;
  /** owner or finance (mirrors public.auth_is_finance()) */
  isFinance: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<void>;
  signOut: () => Promise<void>;
  /** @deprecated use `profile`, `company`, `companyId`, `role`. Kept so legacy pages compile. */
  userProfile: LegacyUserProfile | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ROLES: Role[] = ["owner", "hr", "finance"];

function resolveRole(profile: ProfileRow | null): Role | null {
  if (!profile) return null;
  const raw = (profile as ProfileRow & { role?: string | null }).role;
  if (raw && (ROLES as string[]).includes(raw)) return raw as Role;
  // Before the roles migration lands, an admin profile behaves as the owner.
  if (raw === undefined && profile.is_admin && profile.company_id) return "owner";
  return null;
}

interface ProfileBundle {
  profile: StaffProfile | null;
  company: Company | null;
}

async function loadProfile(userId: string): Promise<ProfileBundle> {
  // One round trip: the profile with its company embedded (profiles_company_id_fkey).
  const { data: row, error } = await supabase
    .from("profiles")
    .select("*, company:companies!profiles_company_id_fkey(*)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { profile: null, company: null };

  const { company: embedded, ...profile } = row as typeof row & { company: Company | null };
  const company: Company | null = profile.company_id ? (embedded ?? null) : null;
  // Before anything renders with this company: form defaults such as "today" follow its clock.
  setCompanyTimeZone(company?.timezone);
  return { profile: { ...profile, role: resolveRole(profile) }, company };
}

export const authProfileKey = (userId: string | undefined) => ["auth", "profile", userId ?? "anon"] as const;

/** Plain-language sign-in errors (GoTrue's own wording for a disabled account is "User is banned"). */
function signInErrorMessage(error: { message?: string; code?: string }): string {
  const raw = error.message ?? "";
  if (error.code === "user_banned" || /banned/i.test(raw)) {
    return "This account has been disabled. Ask your workspace owner to turn it back on.";
  }
  if (error.code === "email_not_confirmed" || /email not confirmed/i.test(raw)) {
    return "Confirm your email address first: open the link we sent you, then sign in.";
  }
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(raw)) {
    return "The email or password is incorrect.";
  }
  return raw || "Please check your credentials and try again.";
}

/**
 * Removes this browser's push subscription from the signed-in staff account, so a shared
 * computer stops showing that person's notifications after they sign out. The browser keeps
 * its subscription: whoever signs in next re-registers it under their own account.
 */
async function unbindPushFromThisBrowser(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const work = (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager?.getSubscription();
      if (sub?.endpoint) await supabase.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
    })().catch(() => undefined);
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2500))]);
  } catch {
    /* best effort */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const user = session?.user ?? null;

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next ?? null);
      setSessionLoading(false);
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        setCompanyTimeZone(null);
        try {
          localStorage.removeItem("app_currency");
        } catch {
          /* storage unavailable */
        }
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setSessionLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const profileQuery = useQuery({
    queryKey: authProfileKey(user?.id),
    queryFn: () => loadProfile(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const profile = profileQuery.data?.profile ?? null;
  const company = profileQuery.data?.company ?? null;
  const role = profile?.company_id ? profile.role : null;
  const loading = sessionLoading || (!!user && profileQuery.isPending);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await queryClient.invalidateQueries({ queryKey: authProfileKey(user.id) });
    await queryClient.refetchQueries({ queryKey: authProfileKey(user.id) });
  }, [queryClient, user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      toast.error("Login failed", { description: signInErrorMessage(error) });
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, metadata: SignUpMetadata) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata, emailRedirectTo: getAuthRedirectUrl("/auth") },
    });
    if (error) {
      toast.error("Registration failed", { description: error.message || "Please try again." });
      throw error;
    }
    // With email confirmation off the new account is signed in straight away: no email to wait for.
    if (data.session) toast.success("Account created", { description: "Next, set up your workspace." });
    else toast.success("Registration successful", { description: "Please check your email to confirm your account." });
  }, []);

  const signOut = useCallback(async () => {
    // Stop this browser receiving the signed-out person's push notifications (best effort, waits 2.5 s at most).
    await unbindPushFromThisBrowser();
    // This device only (GoTrue's default "global" would also end every other device's session, e.g. a
    // shared demo account in use elsewhere). Account > "Sign out other devices" covers the rest.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    // Clear local state whatever the server said, so a failed call never leaves data on screen.
    setSession(null);
    queryClient.clear();
    setCompanyTimeZone(null);
    if (error) toast.error("Signed out locally", { description: error.message });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const legacy: LegacyUserProfile | null = profile ? { ...profile, companies: company } : null;
    return {
      user,
      session,
      loading,
      profileError: (profileQuery.error as Error | null) ?? null,
      profile,
      company,
      companyId: profile?.company_id ?? null,
      role,
      isOwner: role === "owner",
      isHR: role === "owner" || role === "hr",
      isFinance: role === "owner" || role === "finance",
      refreshProfile,
      signIn,
      signUp,
      signOut,
      userProfile: legacy,
    };
  }, [user, session, loading, profileQuery.error, profile, company, role, refreshProfile, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

/** Display label for a staff role. */
export function roleLabel(role: Role | null | undefined): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "hr":
      return "HR Manager";
    case "finance":
      return "Finance";
    default:
      return "No role";
  }
}
