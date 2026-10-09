// admin-users: staff account management for company owners.
//
// POST { action: "list" }                                                   -> { users: StaffUser[] }
// POST { action: "create", email, password, first_name, last_name, role }    -> { user: StaffUser }
// POST { action: "set_role", user_id, role }                                 -> { user: StaffUser }
// POST { action: "disable" | "enable", user_id }                             -> { user: StaffUser }
// POST { action: "reset_password", user_id, password }                       -> { success: true }
//
// The caller's JWT is verified server-side and the caller must be an 'owner' with a company.
// Every target user must belong to the caller's company.
import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** The origin to allow: one listed in ALLOWED_ORIGINS (comma separated), or "*" when it is unset. */
function allowOrigin(req: Request): string {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowed.length === 0) return "*";
  const origin = (req.headers.get("origin") ?? "").replace(/\/+$/, "");
  return allowed.includes(origin) ? origin : allowed[0];
}

function withCors(res: Response, req: Request): Response {
  res.headers.set("Access-Control-Allow-Origin", allowOrigin(req));
  res.headers.append("Vary", "Origin");
  return res;
}

/** A string claim from a JWT that admin.auth.getUser() has already verified. */
function jwtClaim(jwt: string, name: string): string | null {
  try {
    const part = jwt.split(".")[1] ?? "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const value = (JSON.parse(atob(padded)) as Record<string, unknown>)[name];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

const ROLES = ["owner", "hr", "finance"] as const;
type Role = (typeof ROLES)[number];
const BAN_FOREVER = "876000h";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  company_id: string | null;
  role: Role | null;
  created_at: string;
}

interface Caller {
  id: string;
  companyId: string;
  creatorId: string | null;
}

interface StaffUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: Role | null;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
  is_self: boolean;
  is_creator: boolean;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(500, "Server is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asRole(value: unknown): Role {
  if (typeof value === "string" && (ROLES as readonly string[]).includes(value)) return value as Role;
  throw new HttpError(400, "Role must be owner, hr or finance");
}

function asUserId(value: unknown): string {
  if (typeof value === "string" && UUID_PATTERN.test(value)) return value;
  throw new HttpError(400, "A valid user_id is required");
}

function asPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 72) {
    throw new HttpError(400, "Password must be 8 to 72 characters");
  }
  return value;
}

function asName(value: unknown, label: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 60) throw new HttpError(400, `${label} must be 1 to 60 characters`);
  return name;
}

function isDisabled(user: User | null): boolean {
  const until = (user as (User & { banned_until?: string | null }) | null)?.banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

function toStaffUser(profile: Profile, user: User | null, caller: Caller): StaffUser {
  return {
    id: profile.id,
    email: user?.email ?? null,
    first_name: profile.first_name,
    last_name: profile.last_name,
    avatar_url: profile.avatar_url,
    role: profile.role,
    created_at: profile.created_at,
    last_sign_in_at: user?.last_sign_in_at ?? null,
    disabled: isDisabled(user),
    is_self: profile.id === caller.id,
    is_creator: profile.id === caller.creatorId,
  };
}

async function authenticate(req: Request, admin: SupabaseClient): Promise<Caller> {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "Not signed in");

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  // A disabled owner's access token stays valid until it expires; refuse it here.
  if (isDisabled(data.user)) throw new HttpError(403, "This account is disabled");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.company_id || profile.role !== "owner") {
    throw new HttpError(403, "Only the company owner can manage staff accounts");
  }

  // Same rule as public.auth_mfa_ok(): when the company requires two-step verification, or the
  // owner has enrolled a factor, only an aal2 session may manage accounts.
  if (jwtClaim(jwt, "aal") !== "aal2") {
    const factors = (data.user as User & { factors?: { status?: string }[] }).factors ?? [];
    const hasFactor = factors.some((f) => f.status === "verified");
    let required = false;
    if (!hasFactor) {
      const { data: settings } = await admin
        .from("company_settings")
        .select("require_staff_mfa")
        .eq("company_id", profile.company_id)
        .maybeSingle();
      required = !!settings?.require_staff_mfa;
    }
    if (hasFactor || required) throw new HttpError(403, "Two-step verification is required");
  }

  const { data: company } = await admin
    .from("companies")
    .select("created_by")
    .eq("id", profile.company_id)
    .maybeSingle();

  return { id: data.user.id, companyId: profile.company_id, creatorId: company?.created_by ?? null };
}

async function loadMember(admin: SupabaseClient, caller: Caller, userId: string): Promise<Profile> {
  const { data } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, company_id, role, created_at")
    .eq("id", userId)
    .eq("company_id", caller.companyId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Staff member not found");
  return data as Profile;
}

async function staffUser(admin: SupabaseClient, caller: Caller, userId: string): Promise<StaffUser> {
  const profile = await loadMember(admin, caller, userId);
  const { data } = await admin.auth.admin.getUserById(userId);
  return toStaffUser(profile, data.user ?? null, caller);
}

async function logActivity(
  admin: SupabaseClient,
  caller: Caller,
  action: string,
  description: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("activity_logs").insert({
    action_type: action,
    description,
    details,
    user_id: caller.id,
    company_id: caller.companyId,
  });
  if (error) console.error("admin-users activity log failed", error.message);
}

function guardTarget(caller: Caller, userId: string, verb: string): void {
  if (userId === caller.id) throw new HttpError(400, `You cannot ${verb} your own account`);
  if (userId === caller.creatorId) throw new HttpError(400, `The company creator's account cannot be ${verb}d`);
}

async function listStaff(admin: SupabaseClient, caller: Caller): Promise<Response> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, company_id, role, created_at")
    .eq("company_id", caller.companyId)
    .order("created_at", { ascending: true });
  if (error) throw new HttpError(500, "Could not load staff");

  const profiles = (data ?? []) as Profile[];
  const users = await Promise.all(
    profiles.map(async (profile) => {
      const { data: auth } = await admin.auth.admin.getUserById(profile.id);
      return toStaffUser(profile, auth.user ?? null, caller);
    }),
  );
  return json({ users });
}

async function createStaff(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address");
  const password = asPassword(body.password);
  const firstName = asName(body.first_name, "First name");
  const lastName = asName(body.last_name, "Last name");
  const role = asRole(body.role);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error || !data.user) {
    const message = error?.message ?? "";
    if (/already|registered|exists/i.test(message)) {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw new HttpError(400, message || "Could not create the account");
  }

  const userId = data.user.id;
  // handle_new_user() normally creates the profile; upsert covers a missing row.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: userId, first_name: firstName, last_name: lastName, company_id: caller.companyId, role },
      { onConflict: "id" },
    );
  if (profileError) {
    console.error("admin-users profile setup failed", profileError.message);
    // Leave the new login unusable rather than half-configured.
    await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
    throw new HttpError(500, "The account was created but could not be added to your company");
  }

  await logActivity(admin, caller, "staff.create", `Added ${firstName} ${lastName} as ${role}`, {
    target_user_id: userId,
    role,
  });
  return json({ user: await staffUser(admin, caller, userId) }, 201);
}

async function setRole(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const userId = asUserId(body.user_id);
  const role = asRole(body.role);
  if (userId === caller.id) throw new HttpError(400, "You cannot change your own role");
  if (userId === caller.creatorId && role !== "owner") {
    throw new HttpError(400, "The company creator must remain an owner");
  }
  const member = await loadMember(admin, caller, userId);

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId).eq("company_id", caller.companyId);
  if (error) throw new HttpError(500, "Could not change the role");

  await logActivity(admin, caller, "staff.set_role", `Changed role from ${member.role ?? "none"} to ${role}`, {
    target_user_id: userId,
    from: member.role,
    to: role,
  });
  return json({ user: await staffUser(admin, caller, userId) });
}

async function setDisabled(
  admin: SupabaseClient,
  caller: Caller,
  body: Record<string, unknown>,
  disable: boolean,
): Promise<Response> {
  const userId = asUserId(body.user_id);
  guardTarget(caller, userId, disable ? "disable" : "enable");
  await loadMember(admin, caller, userId);

  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disable ? BAN_FOREVER : "none" });
  if (error) throw new HttpError(500, disable ? "Could not disable the account" : "Could not enable the account");

  await logActivity(
    admin,
    caller,
    disable ? "staff.disable" : "staff.enable",
    disable ? "Disabled a staff account" : "Enabled a staff account",
    { target_user_id: userId },
  );
  return json({ user: await staffUser(admin, caller, userId) });
}

async function resetPassword(admin: SupabaseClient, caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const userId = asUserId(body.user_id);
  const password = asPassword(body.password);
  if (userId === caller.creatorId && userId !== caller.id) {
    throw new HttpError(400, "The company creator's password can only be changed by the creator");
  }
  await loadMember(admin, caller, userId);

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new HttpError(400, error.message || "Could not reset the password");

  await logActivity(admin, caller, "staff.reset_password", "Reset a staff password", { target_user_id: userId });
  return json({ success: true });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "Expected a JSON body");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected a JSON object");

    switch (body.action) {
      case "list":
        return await listStaff(admin, caller);
      case "create":
        return await createStaff(admin, caller, body);
      case "set_role":
        return await setRole(admin, caller, body);
      case "disable":
        return await setDisabled(admin, caller, body, true);
      case "enable":
        return await setDisabled(admin, caller, body, false);
      case "reset_password":
        return await resetPassword(admin, caller, body);
      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("admin-users unexpected error", err);
    return json({ error: "Something went wrong" }, 500);
  }
}

Deno.serve(async (req: Request): Promise<Response> => withCors(await handle(req), req));
