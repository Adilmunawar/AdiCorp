import { FunctionsHttpError } from "@supabase/supabase-js";
import { db } from "@/integrations/supabase/client";

/**
 * Employee portal transport. The portal never signs in to Supabase Auth: it calls
 * SECURITY DEFINER `portal_*` RPCs with the anon key plus an opaque session token
 * issued by `employee_login`. The server resolves the employee and company from the
 * token alone.
 */

const STORAGE_KEY = "adicorp.portal.session";
const LEGACY_KEY = "employee_session";
export const PORTAL_LOGOUT_EVENT = "adicorp:portal-logout";
/** localStorage key of the portal session (other tabs watch it through `storage` events). */
export const PORTAL_SESSION_KEY = STORAGE_KEY;

/** Fallback when localStorage cannot be written (some private modes): the session lives in this tab only. */
let memorySession: PortalSession | null = null;
let memoryOnly = false;

function stillValid(session: PortalSession | null): PortalSession | null {
  if (!session?.token || !session.employee?.id) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) return null;
  return session;
}

export interface PortalCompany {
  id: string;
  name: string;
  logo: string | null;
  currency: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
}

export interface PortalEmployee {
  id: string;
  name: string;
  company_id: string;
  rank: string | null;
  avatar_url: string | null;
  needs_password_change: boolean;
  /** Present after portal_me has run. */
  company?: PortalCompany;
  /** Extra fields portal_me returns (employee_code, department, email, cnic, …). */
  [key: string]: unknown;
}

export interface PortalSession {
  token: string;
  expires_at: string | null;
  employee: PortalEmployee;
}

/** Thrown when the token is missing, expired or revoked. The session is cleared automatically. */
export class PortalAuthError extends Error {
  constructor(message = "Your session has ended. Please sign in again.") {
    super(message);
    this.name = "PortalAuthError";
  }
}

export function readPortalSession(): PortalSession | null {
  if (memoryOnly) return stillValid(memorySession);
  try {
    localStorage.removeItem(LEGACY_KEY); // unsigned pre-token sessions are never trusted
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSession;
    if (!parsed?.token || !parsed.employee?.id) return null;
    if (!stillValid(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return stillValid(memorySession);
  }
}

export function writePortalSession(session: PortalSession | null): void {
  memorySession = session;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
    memoryOnly = false;
  } catch {
    /* storage unavailable (private mode): the session lives in memory only */
    memoryOnly = true;
  }
}

export function getPortalToken(): string | null {
  return readPortalSession()?.token ?? null;
}

const AUTH_PATTERNS = ["invalid session", "session expired", "not authenticated", "invalid token", "jwt expired"];
/** The server refuses every call but portal_me / portal_change_password while a temporary password is in place. */
const PASSWORD_PENDING_PATTERN = "password_change_required";
/** Raised by portalRpc when the server says the password must be changed first (EmployeeAuthContext listens). */
export const PORTAL_PASSWORD_PENDING_EVENT = "adicorp:portal-password-pending";

function isAuthMessage(message: string | undefined | null): boolean {
  const m = (message ?? "").toLowerCase();
  return AUTH_PATTERNS.some((p) => m.includes(p));
}

function isPasswordPendingMessage(message: string | undefined | null): boolean {
  return (message ?? "").toLowerCase().includes(PASSWORD_PENDING_PATTERN);
}

/** Thrown when the session is valid but the temporary password has not been replaced yet. */
export class PortalPasswordPendingError extends Error {
  constructor() {
    super("Set a new password to continue.");
    this.name = "PortalPasswordPendingError";
  }
}

/** Mark the session as needing a password change (PortalGuard then shows /portal/setup-password). */
function requirePasswordChange(): never {
  window.dispatchEvent(new CustomEvent(PORTAL_PASSWORD_PENDING_EVENT));
  throw new PortalPasswordPendingError();
}

/** Clear the stored session and tell EmployeeAuthContext (which redirects to /employee-login). */
export function endPortalSession(): void {
  writePortalSession(null);
  window.dispatchEvent(new CustomEvent(PORTAL_LOGOUT_EVENT));
}

function requireToken(): string {
  const token = getPortalToken();
  if (!token) {
    endPortalSession();
    throw new PortalAuthError();
  }
  return token;
}

/**
 * Call a `portal_*` RPC with the current token as `p_token`.
 * Throws PortalAuthError (and logs out) on an invalid session; throws Error with the
 * server message on `{ error }` JSON replies or database errors.
 */
export async function portalRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = requireToken();
  const { data, error } = await db.rpc(fn, { p_token: token, ...args });
  if (error) {
    if (isPasswordPendingMessage(error.message)) requirePasswordChange();
    if (isAuthMessage(error.message)) {
      endPortalSession();
      throw new PortalAuthError();
    }
    throw new Error(error.message || "Request failed");
  }
  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && (data as { error?: unknown }).error) {
    const message = String((data as { error: unknown }).error);
    if (isPasswordPendingMessage(message)) requirePasswordChange();
    if (isAuthMessage(message)) {
      endPortalSession();
      throw new PortalAuthError();
    }
    throw new Error(message);
  }
  return data as T;
}

async function invokePortalFiles<T>(body: FormData | Record<string, unknown>): Promise<T> {
  const { data, error } = await db.functions.invoke("portal-files", { body });
  if (error) {
    let message = error.message;
    let status = 0;
    if (error instanceof FunctionsHttpError) {
      status = error.context?.status ?? 0;
      try {
        const payload = await error.context.json();
        message = payload?.error || payload?.message || message;
      } catch {
        /* not JSON */
      }
    }
    if (isPasswordPendingMessage(message)) requirePasswordChange();
    if (status === 401 || isAuthMessage(message)) {
      endPortalSession();
      throw new PortalAuthError();
    }
    throw new Error(message || "File request failed");
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

/** Upload a file for the signed-in employee through the `portal-files` Edge Function. */
export async function portalUpload(file: File, bucket: string, kind: string): Promise<{ path: string }> {
  const form = new FormData();
  form.append("token", requireToken());
  form.append("bucket", bucket);
  form.append("kind", kind);
  form.append("file", file);
  return invokePortalFiles<{ path: string }>(form);
}

/** Short-lived signed URL for a private file the employee may read. */
export async function portalSignedUrl(bucket: string, path: string): Promise<string> {
  const res = await invokePortalFiles<{ url: string }>({ token: requireToken(), action: "sign", bucket, path });
  return res.url;
}
