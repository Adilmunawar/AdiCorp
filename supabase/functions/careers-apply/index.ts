// careers-apply: public job applications with a CV.
//
// POST multipart/form-data { job_id, name, email, phone, link?, cover_letter?, website (honeypot), cv }
//   -> { ok: true } | { ok: false, error }
//
// Called from the public careers page with the anon key. The job, its company and every
// limit are checked in the database (careers_application_precheck / careers_submit_application,
// service role only). The CV is sniffed by its first bytes, capped at 5 MB and stored at
// cvs/<company_id>/applications/<uuid>.<ext>; it is removed again if the insert is refused.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

const CV_MAX_BYTES = 5 * 1024 * 1024;
const BODY_MAX_BYTES = CV_MAX_BYTES + 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const LINK_PATTERN = /^https?:\/\/[^\s]+$/i;

type CvType = "pdf" | "doc" | "docx";
const CV_MIME: Record<CvType, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Best-effort burst limit per warm instance; the durable limits live in the database.
const WINDOW_MS = 60 * 60 * 1000;
const WINDOW_MAX = 60;
const attempts = new Map<string, { count: number; resetAt: number }>();

function allow(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= WINDOW_MAX;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const fail = (error: string, status = 400) => json({ ok: false, error }, status);

function text(form: FormData, key: string, max: number): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((v, i) => bytes[i] === v);
}

function includesAscii(bytes: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Identify the CV by its bytes and require the extension to agree. */
function detectCv(bytes: Uint8Array, fileName: string): CvType | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" && startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (ext === "doc" && startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";
  if (ext === "docx" && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && includesAscii(bytes, "word/")) return "docx";
  return null;
}

function safeName(fileName: string, type: CvType): string {
  const base = fileName.replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").trim().slice(0, 100) || "cv";
  return `${base}.${type}`;
}

function clientIp(req: Request): string {
  // The LAST hop is the address the gateway saw; earlier entries are whatever the caller sent.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`careers:${ip}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface RpcResult {
  ok?: boolean;
  error?: string;
  status?: number;
  company_id?: string;
  title?: string;
  id?: string;
}

async function rpc(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    console.error(`[careers-apply] ${fn} failed`, error.message);
    throw new Error("rpc failed");
  }
  return (data ?? {}) as RpcResult;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return fail("The careers service is not configured.", 500);

  const ip = clientIp(req);
  if (!allow(ip)) return fail("Too many applications from this connection. Try again later.", 429);

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > BODY_MAX_BYTES) return fail("Your CV is larger than 5 MB.", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("The form could not be read.");
  }

  // Bots fill the hidden field; people never see it. Pretend it worked.
  if (text(form, "website", 10)) return json({ ok: true });

  const jobId = text(form, "job_id", 64);
  const name = text(form, "name", 80);
  const email = text(form, "email", 120).toLowerCase();
  const phone = text(form, "phone", 40);
  const link = text(form, "link", 300);
  const coverLetter = text(form, "cover_letter", 2000);

  if (!UUID_PATTERN.test(jobId)) return fail("This role is no longer open.", 410);
  if (name.length < 2) return fail("Tell us your name.");
  if (!EMAIL_PATTERN.test(email)) return fail("That e-mail address does not look right.");
  if (!PHONE_PATTERN.test(phone)) return fail("That phone number does not look right.");
  if (link && !LINK_PATTERN.test(link)) return fail("The link must start with http:// or https://.");

  const cv = form.get("cv");
  if (!(cv instanceof File) || cv.size === 0) return fail("Attach your CV as a PDF or Word file.");
  if (cv.size > CV_MAX_BYTES) return fail("Your CV is larger than 5 MB.");
  const bytes = new Uint8Array(await cv.arrayBuffer());
  const type = detectCv(bytes, cv.name || "");
  if (!type) return fail("The CV must be a PDF, .doc or .docx file.");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ipHash = await hashIp(ip, serviceKey);

  let stored: string | null = null;
  try {
    const check = await rpc(admin, "careers_application_precheck", { p_job: jobId, p_email: email, p_ip_hash: ipHash });
    if (check.error || !check.company_id) return fail(check.error ?? "This role is no longer open.", check.status ?? 400);
    if (!UUID_PATTERN.test(check.company_id)) return fail("This role is no longer open.", 410);

    const path = `${check.company_id}/applications/${crypto.randomUUID()}.${type}`;
    const upload = await admin.storage.from("cvs").upload(path, bytes, { contentType: CV_MIME[type], upsert: false });
    if (upload.error) {
      console.error("[careers-apply] upload failed", upload.error.message);
      return fail("Your CV could not be stored. Try again in a minute.", 500);
    }
    stored = path;

    const result = await rpc(admin, "careers_submit_application", {
      p_job: jobId,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_link: link,
      p_cover_letter: coverLetter,
      p_cv_path: path,
      p_cv_name: safeName(cv.name || "", type),
      p_cv_size: bytes.length,
      p_ip_hash: ipHash,
    });
    if (!result.ok) {
      stored = null;
      await admin.storage.from("cvs").remove([path]);
      return fail(result.error ?? "Your application could not be sent.", result.status ?? 400);
    }
    return json({ ok: true });
  } catch {
    // Never leave an orphaned CV behind when the application row was not written.
    if (stored) await admin.storage.from("cvs").remove([stored]).catch(() => undefined);
    return fail("Your application could not be sent. Try again in a minute.", 500);
  }
}

Deno.serve(async (req: Request): Promise<Response> => withCors(await handle(req), req));
