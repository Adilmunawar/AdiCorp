import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/integrations/supabase/client";
import {
  PORTAL_LOGOUT_EVENT,
  PORTAL_PASSWORD_PENDING_EVENT,
  PORTAL_SESSION_KEY,
  PortalAuthError,
  portalRpc,
  readPortalSession,
  writePortalSession,
  type PortalCompany,
  type PortalEmployee,
  type PortalSession,
} from "@/lib/portal";

export type { PortalCompany, PortalEmployee } from "@/lib/portal";
/** @deprecated use PortalEmployee */
export type EmployeeSession = PortalEmployee;

interface EmployeeAuthContextValue {
  employee: PortalEmployee | null;
  /** The employee's company (from portal_me), once validated. */
  company: PortalCompany | null;
  token: string | null;
  /** True while a stored session is being validated with portal_me. */
  loading: boolean;
  /** Sign in with CNIC + password. Resolves with the employee (check `needs_password_change`). */
  login: (cnic: string, password: string) => Promise<PortalEmployee>;
  logout: () => Promise<void>;
  /** Reload the employee from portal_me. */
  refresh: () => Promise<void>;
  /** Patch the cached employee (e.g. after a password or avatar change). */
  updateEmployee: (patch: Partial<PortalEmployee>) => void;
  /** @deprecated use `loading` */
  isLoading: boolean;
  /** @deprecated use `updateEmployee` */
  updateSession: (patch: Partial<PortalEmployee>) => void;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextValue | undefined>(undefined);

interface LoginReply {
  token?: string;
  expires_at?: string | null;
  employee?: Partial<PortalEmployee>;
  error?: string;
}

function normaliseEmployee(raw: Record<string, unknown> | null | undefined, fallback?: PortalEmployee): PortalEmployee | null {
  if (!raw) return fallback ?? null;
  const e = (raw.employee && typeof raw.employee === "object" ? raw.employee : raw) as Record<string, unknown>;
  if (!e.id && !fallback) return null;
  const needs = e.needs_password_change ?? e.must_change_password ?? fallback?.needs_password_change ?? false;
  const merged: Record<string, unknown> = { ...(fallback ?? {}), ...e };
  // The session is kept in localStorage for days: never cache the bank account number there
  // (the profile page reads it live from portal_me).
  delete merged.bank_account_number;
  return {
    ...merged,
    id: String(e.id ?? fallback?.id),
    name: String(e.name ?? fallback?.name ?? ""),
    company_id: String(e.company_id ?? fallback?.company_id ?? ""),
    rank: (e.rank as string | null | undefined) ?? fallback?.rank ?? null,
    avatar_url: (e.avatar_url as string | null | undefined) ?? fallback?.avatar_url ?? null,
    needs_password_change: Boolean(needs),
  };
}

export function EmployeeAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<PortalSession | null>(() => readPortalSession());
  const [loading, setLoading] = useState<boolean>(() => readPortalSession() !== null);

  const persist = useCallback((next: PortalSession | null) => {
    writePortalSession(next);
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    const current = readPortalSession();
    if (!current) {
      setSession(null);
      return;
    }
    try {
      const me = await portalRpc<Record<string, unknown>>("portal_me");
      const employee = normaliseEmployee(me, current.employee);
      if (employee) persist({ ...current, employee });
    } catch (err) {
      // Also drop it from storage, or every later page load re-validates a dead token.
      if (err instanceof PortalAuthError) persist(null);
      // Network or server hiccup: keep the stored session; the next portal call re-checks it.
    }
  }, [persist]);

  // Validate a stored session once on load.
  useEffect(() => {
    if (!readPortalSession()) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Any portal call that finds the session invalid (expired, revoked, signed out elsewhere) ends it
  // here; PortalGuard then sends the employee to the sign-in page, with a note saying why.
  useEffect(() => {
    const onLogout = () => {
      const hadSession = sessionRef.current !== null;
      setSession(null);
      queryClient.clear();
      if (hadSession) toast.error("Your session has ended. Please sign in again.", { id: "portal-session-ended" });
    };
    window.addEventListener(PORTAL_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(PORTAL_LOGOUT_EVENT, onLogout);
  }, [queryClient]);

  // The server refused a call because the temporary password is still in place (the session itself
  // is fine): flag it, and PortalGuard sends the employee to /portal/setup-password.
  useEffect(() => {
    const onPending = () => {
      const current = readPortalSession();
      if (current && !current.employee.needs_password_change) {
        persist({ ...current, employee: { ...current.employee, needs_password_change: true } });
      }
    };
    window.addEventListener(PORTAL_PASSWORD_PENDING_EVENT, onPending);
    return () => window.removeEventListener(PORTAL_PASSWORD_PENDING_EVENT, onPending);
  }, [persist]);

  // The token has a fixed end: end the session then (and when the tab comes back after sleeping).
  useEffect(() => {
    const until = session?.expires_at ? new Date(session.expires_at).getTime() - Date.now() : null;
    if (until === null || Number.isNaN(until)) return;
    const end = () => window.dispatchEvent(new Event(PORTAL_LOGOUT_EVENT));
    if (until <= 0) {
      end();
      return;
    }
    const timer = window.setTimeout(end, Math.min(until, 2_147_000_000));
    const onVisible = () => {
      if (document.visibilityState === "visible" && new Date(session!.expires_at!).getTime() <= Date.now()) end();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session]);

  // Another tab signed in, signed out or switched employee: follow it, so this tab never shows
  // one employee's name over another employee's data.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PORTAL_SESSION_KEY) return;
      const next = readPortalSession();
      const prev = sessionRef.current;
      if (next?.token === prev?.token && next?.employee.id === prev?.employee.id) {
        if (next) setSession(next);
        return;
      }
      if (next?.employee.id !== prev?.employee.id) queryClient.clear();
      setSession(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  const login = useCallback(
    async (cnic: string, password: string) => {
      const { data, error } = await db.rpc("employee_login", { p_cnic: cnic.trim(), p_password: password });
      if (error) throw new Error(error.message || "Login failed");
      const reply = (data ?? {}) as LoginReply;
      if (reply.error) throw new Error(reply.error);
      if (!reply.token) throw new Error("Sign-in is temporarily unavailable. Please try again shortly.");
      const employee = normaliseEmployee(reply.employee as Record<string, unknown>);
      if (!employee) throw new Error("Sign-in reply was incomplete. Please try again.");
      queryClient.clear();
      persist({ token: reply.token, expires_at: reply.expires_at ?? null, employee });
      // The login reply is minimal: load the full record (company and currency, CNIC, department)
      // now, so pages never fall back to defaults for the rest of the session.
      await refresh();
      return readPortalSession()?.employee ?? employee;
    },
    [persist, queryClient, refresh],
  );

  const logout = useCallback(async () => {
    const current = readPortalSession();
    persist(null);
    queryClient.clear();
    if (current?.token) {
      try {
        await db.rpc("portal_logout", { p_token: current.token });
      } catch {
        /* the token expires on its own */
      }
    }
  }, [persist, queryClient]);

  const updateEmployee = useCallback(
    (patch: Partial<PortalEmployee>) => {
      const current = readPortalSession();
      if (!current) return;
      persist({ ...current, employee: { ...current.employee, ...patch } });
    },
    [persist],
  );

  const value = useMemo<EmployeeAuthContextValue>(
    () => ({
      employee: session?.employee ?? null,
      company: (session?.employee?.company as PortalCompany | undefined) ?? null,
      token: session?.token ?? null,
      loading,
      login,
      logout,
      refresh,
      updateEmployee,
      isLoading: loading,
      updateSession: updateEmployee,
    }),
    [session, loading, login, logout, refresh, updateEmployee],
  );

  return <EmployeeAuthContext.Provider value={value}>{children}</EmployeeAuthContext.Provider>;
}

export function useEmployeeAuth(): EmployeeAuthContextValue {
  const context = useContext(EmployeeAuthContext);
  if (context === undefined) throw new Error("useEmployeeAuth must be used within an EmployeeAuthProvider");
  return context;
}
